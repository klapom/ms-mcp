import { fileURLToPath } from "node:url";
import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withPersonaCapabilityGate } from "../src/auth/persona-pinning.js";
import { loadPersonaScopesFromFile, resetLoadedPersonaScopes } from "../src/auth/persona-scopes.js";
import { runWithIdentity } from "../src/auth/request-identity.js";
import type { Config } from "../src/config.js";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { GetRecentFilesParams, ListFilesParams, SearchFilesParams } from "../src/schemas/files.js";
import { registerDriveListTools } from "../src/tools/drive-list.js";
import { registerDriveSearchTools } from "../src/tools/drive-search.js";
import type { ToolResult } from "../src/types/tools.js";
import { extractSkipToken } from "../src/utils/pagination.js";
import { PAGED_FOLDER_ID, PAGED_TOTAL, pagedRequestLog } from "./mocks/handlers/drive.js";

const KLAUS = "klaus.pommer@pommerconsulting.de";
const SCOPES_FILE = fileURLToPath(new URL("../config/persona-scopes.json", import.meta.url));

const testConfig: Config = {
  limits: { maxItems: 25, maxBodyLength: 50000 },
  auth: { clientId: "test-client", tenantId: "test-tenant" },
  logging: { level: "silent" },
  cache: { tokenCachePath: "/tmp/test-cache.json" },
} as unknown as Config;

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

function handlersFor(client: Client, gated = false): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  const capturing = {
    tool: (name: string, _d: string, _s: unknown, h: ToolHandler) => handlers.set(name, h),
  } as unknown as McpServer;
  const server = gated ? withPersonaCapabilityGate(capturing) : capturing;
  registerDriveListTools(server, client, testConfig);
  registerDriveSearchTools(server, client, testConfig);
  return handlers;
}

function realClient(): Client {
  const mapping = new ErrorMappingMiddleware();
  mapping.setNext(new HTTPMessageHandler());
  return Client.initWithMiddleware({ middleware: mapping, defaultVersion: "v1.0" });
}

function spyClient(getReturn: unknown = { value: [] }) {
  const get = vi.fn().mockResolvedValue(getReturn);
  const req: Record<string, unknown> = { get };
  for (const m of ["header", "query", "top", "skip", "select", "filter", "count", "orderby"]) {
    req[m] = vi.fn().mockReturnValue(req);
  }
  const api = vi.fn().mockReturnValue(req);
  return { client: { api } as unknown as Client, api, req };
}

const text = (r: ToolResult) => (r.content[0] as { text: string }).text;
const names = (t: string) => [...t.matchAll(/ID: (paged-\d{3})/g)].map((m) => m[1]);
const tokenOf = (t: string) => /page_token: "([^"]+)"/.exec(t)?.[1];

beforeEach(() => {
  pagedRequestLog.length = 0;
});

const CASES = [
  { tool: "list_files", args: { folder_id: PAGED_FOLDER_ID } },
  { tool: "get_recent_files", args: {} },
  { tool: "search_files", args: { query: "paged" } },
] as const;

describe.each(CASES)("$tool: page_token paging over 250 items", ({ tool, args }) => {
  it("walks 3 pages (100/100/50), complete and duplicate-free, last page has no token", async () => {
    const h = handlersFor(realClient()).get(tool) as ToolHandler;
    const all: string[] = [];
    let token: string | undefined;
    const pages: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await h({ ...args, top: 100, ...(token ? { page_token: token } : {}) });
      expect(res.isError).toBeUndefined();
      const t = text(res);
      pages.push(t);
      all.push(...names(t));
      token = tokenOf(t);
      if (!token) break;
    }
    expect(pages).toHaveLength(3);
    expect(names(pages[0])).toHaveLength(100);
    expect(names(pages[1])).toHaveLength(100);
    expect(names(pages[2])).toHaveLength(50);
    expect(pages[0]).toContain("More available - next page: page_token:");
    expect(pages[2]).toContain("Showing 50 items (complete).");
    expect(new Set(all).size).toBe(PAGED_TOTAL);
    expect(all).toHaveLength(PAGED_TOTAL);
  });

  it("top=200 returns 200 items on the first page", async () => {
    const h = handlersFor(realClient()).get(tool) as ToolHandler;
    const t = text(await h({ ...args, top: 200 }));
    expect(names(t)).toHaveLength(200);
    expect(tokenOf(t)).toBeDefined();
  });

  it("never recommends 'Use skip:' (regression)", async () => {
    const h = handlersFor(realClient()).get(tool) as ToolHandler;
    const t = text(await h({ ...args, top: 100 }));
    expect(t).not.toMatch(/Use skip:/);
  });

  it("page_token + skip together -> ValidationError, no Graph request", async () => {
    const spy = spyClient();
    const h = handlersFor(spy.client).get(tool) as ToolHandler;
    const res = await h({ ...args, page_token: "abc123==", skip: 5 });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("mutually exclusive");
    expect(spy.api).not.toHaveBeenCalled();
  });

  it.each([
    "https://graph.microsoft.com/v1.0/users/x/drive/root/children?$skiptoken=abc",
    "http:evil",
    "//evil.example/x",
    "a//b",
    "abc&$top=999",
    "abc def",
  ])("URL-like/invalid token %s -> rejected, NO Graph request", async (bad) => {
    const spy = spyClient();
    const h = handlersFor(spy.client).get(tool) as ToolHandler;
    const res = await h({ ...args, page_token: bad });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("page_token is invalid");
    expect(spy.api).not.toHaveBeenCalled();
  });
});

describe("token never changes the target path", () => {
  it("valid token: request goes to the path resolved from params, token only as $skiptoken", async () => {
    const spy = spyClient();
    const h = handlersFor(spy.client).get("list_files") as ToolHandler;
    await h({ path: "/Invoices", page_token: "T0ZGU0VU100==" });
    expect(spy.api).toHaveBeenCalledTimes(1);
    expect(spy.api).toHaveBeenCalledWith("/me/drive/root:/Invoices:/children");
    expect(spy.req.query).toHaveBeenCalledWith({ $skiptoken: "T0ZGU0VU100==" });
  });

  it("persona pinning: pinned persona stays on klaus's drive with a token; foreign user_id still blocked", async () => {
    resetLoadedPersonaScopes();
    loadPersonaScopesFromFile(SCOPES_FILE);
    const spy = spyClient();
    const h = handlersFor(spy.client, true).get("list_files") as ToolHandler;
    const ident = { personaKey: "conny", sub: "conny" };

    const ok = await runWithIdentity(ident, () => h({ path: "/Invoices", page_token: "AbC123==" }));
    expect(ok.isError).toBeUndefined();
    for (const call of spy.api.mock.calls) {
      expect(String(call[0])).toBe(
        `/users/${encodeURIComponent(KLAUS)}/drive/root:/Invoices:/children`,
      );
    }
    expect(spy.req.query).toHaveBeenCalledWith({ $skiptoken: "AbC123==" });

    spy.api.mockClear();
    const blocked = await runWithIdentity(ident, () =>
      h({ user_id: "suki-mailbox@pommerconsulting.de", page_token: "AbC123==" }),
    );
    expect(blocked.isError).toBe(true);
    expect(spy.api).not.toHaveBeenCalled();
    resetLoadedPersonaScopes();
  });
});

describe("schemas", () => {
  it("top: 200 accepted, 201 rejected (all three drive tools)", () => {
    for (const S of [ListFilesParams, GetRecentFilesParams]) {
      expect(S.safeParse({ top: 200 }).success).toBe(true);
      expect(S.safeParse({ top: 201 }).success).toBe(false);
    }
    expect(SearchFilesParams.safeParse({ query: "x", top: 200 }).success).toBe(true);
    expect(SearchFilesParams.safeParse({ query: "x", top: 201 }).success).toBe(false);
  });

  it("default (no top) still uses config maxItems, explicit top=200 is not capped by it", async () => {
    const spy = spyClient();
    const h = handlersFor(spy.client).get("list_files") as ToolHandler;
    await h({});
    expect(spy.req.top).toHaveBeenLastCalledWith(25);
    await h({ top: 200 });
    expect(spy.req.top).toHaveBeenLastCalledWith(200);
  });
});

describe("honest hints", () => {
  it("nextLink without $skiptoken -> no token, no 'Use skip'", async () => {
    const spy = spyClient({
      value: [{ id: "1", name: "a", size: 1 }],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/drive/root/children?$skip=1",
    });
    const h = handlersFor(spy.client).get("list_files") as ToolHandler;
    const t = text(await h({}));
    expect(t).not.toMatch(/Use skip:|page_token: "/);
    expect(t).toContain("cannot be paged further");
  });

  it("legacy skip: Graph's $skip error gets a page_token hint", async () => {
    const h = handlersFor(realClient()).get("list_files") as ToolHandler;
    const res = await h({ folder_id: PAGED_FOLDER_ID, skip: 5 });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("page_token");
  });
});

describe("extractSkipToken", () => {
  it("returns raw value, keeps '+' and '=' intact", () => {
    expect(extractSkipToken("https://g/x?$top=5&$skiptoken=a+b/c==&$orderby=name")).toBe("a+b/c==");
    expect(extractSkipToken("https://g/x?%24skiptoken=zz")).toBe("zz");
  });
  it("undefined when absent, only $skip, or not a URL", () => {
    expect(extractSkipToken(undefined)).toBeUndefined();
    expect(extractSkipToken("https://g/x?$skip=5")).toBeUndefined();
    expect(extractSkipToken("nonsense")).toBeUndefined();
  });
});
