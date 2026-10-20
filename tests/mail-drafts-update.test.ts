/**
 * Tests for update_draft and delete_draft (issue #38).
 *
 * Handlers run against a real Graph client chain
 * (Caching → ErrorMapping → HTTPMessageHandler) with MSW recording every request,
 * so the tests assert on what actually reaches Graph.
 */

import type { Middleware } from "@microsoft/microsoft-graph-client";
import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findToolsMissingCapability } from "../src/auth/persona-pinning.js";
import type { Config } from "../src/config.js";
import { CachingMiddleware } from "../src/middleware/caching-middleware.js";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { UpdateDraftParams } from "../src/schemas/mail-extensions.js";
import { registerMailDraftUpdateTools } from "../src/tools/mail-draft-update.js";
import type { ToolResult } from "../src/types/tools.js";
import { CacheManager } from "../src/utils/cache.js";
import { idempotencyCache } from "../src/utils/idempotency.js";
import { MAIL_FONT_STYLE } from "../src/utils/mail-html.js";
import { server as mswServer } from "./mocks/server.js";

const logCalls = vi.hoisted(() => ({ info: [] as unknown[][], warn: [] as unknown[][] }));
vi.mock("../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: (...args: unknown[]) => logCalls.info.push(args),
    warn: (...args: unknown[]) => logCalls.warn.push(args),
    debug: () => {},
    error: () => {},
    child() {
      return this;
    },
  }),
}));

const GRAPH = "https://graph.microsoft.com/v1.0";

const testConfig: Config = {
  limits: { maxItems: 100, maxBodyLength: 50000 },
  auth: { clientId: "test-client", tenantId: "test-tenant" },
  logging: { level: "silent" },
  cache: { tokenCachePath: "/tmp/test-cache.json" },
};

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

interface RecordedRequest {
  method: string;
  url: URL;
  body: unknown;
  headers: Headers;
}

interface DraftState {
  id: string;
  subject: string;
  isDraft: boolean;
  importance: string;
  lastModifiedDateTime: string;
  body: { contentType: string; content: string };
  toRecipients: Array<{ emailAddress: { address: string; name?: string } }>;
  ccRecipients: Array<{ emailAddress: { address: string } }>;
  bccRecipients: Array<{ emailAddress: { address: string } }>;
}

let draft: DraftState;
let requests: RecordedRequest[];
let getStatus: number;
let patchStatus: number;

function defaultDraft(): DraftState {
  return {
    id: "draft-1",
    subject: "Old",
    isDraft: true,
    importance: "normal",
    lastModifiedDateTime: "2026-10-20T08:00:00Z",
    body: { contentType: "html", content: "<p>SECRET-BODY-CONTENT</p>" },
    toRecipients: [
      { emailAddress: { address: "one@x.de" } },
      { emailAddress: { address: "two@x.de" } },
      { emailAddress: { address: "three@x.de" } },
    ],
    ccRecipients: [{ emailAddress: { address: "cc@x.de" } }],
    bccRecipients: [],
  };
}

function graphError(status: number, code: string) {
  return HttpResponse.json({ error: { code, message: code } }, { status });
}

/** Record every message request and serve it from the in-memory draft. */
function installHandlers(): void {
  const record = async (request: Request): Promise<void> => {
    const text = await request.clone().text();
    requests.push({
      method: request.method,
      url: new URL(request.url),
      body: text ? JSON.parse(text) : undefined,
      headers: request.headers,
    });
  };

  const getHandler = async ({ request }: { request: Request }) => {
    await record(request);
    if (getStatus !== 200) return graphError(getStatus, "ErrorItemNotFound");
    const select = new URL(request.url).searchParams.get("$select")?.split(",") ?? [];
    const full = draft as unknown as Record<string, unknown>;
    const selected: Record<string, unknown> = {};
    for (const field of select) selected[field] = full[field];
    return HttpResponse.json(select.length > 0 ? selected : full);
  };

  const patchHandler = async ({ request }: { request: Request }) => {
    await record(request);
    if (patchStatus !== 200) return graphError(patchStatus, "ErrorInvalidRequest");
    const patch = (await request.json()) as Record<string, unknown>;
    draft = { ...draft, ...(patch as Partial<DraftState>) };
    return HttpResponse.json(draft);
  };

  const moveHandler = async ({ request }: { request: Request }) => {
    await record(request);
    return HttpResponse.json({ ...draft, id: "new-id" }, { status: 201 });
  };

  for (const base of [`${GRAPH}/me/messages`, `${GRAPH}/users/:userId/messages`]) {
    mswServer.use(
      http.get(`${base}/:messageId`, getHandler),
      http.patch(`${base}/:messageId`, patchHandler),
      http.post(`${base}/:messageId/move`, moveHandler),
    );
  }
}

function buildClient(): Client {
  const caching = new CachingMiddleware(new CacheManager());
  const errorMapping = new ErrorMappingMiddleware();
  caching.setNext(errorMapping);
  errorMapping.setNext(new HTTPMessageHandler() as Middleware);
  return Client.initWithMiddleware({ middleware: caching, defaultVersion: "v1.0" });
}

function setup(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _shape: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  registerMailDraftUpdateTools(server, buildClient(), testConfig);
  return handlers;
}

function text(result: ToolResult): string {
  return result.content.map((c) => ("text" in c ? c.text : "")).join("\n");
}

const byMethod = (method: string) => requests.filter((r) => r.method === method);
const patches = () => byMethod("PATCH");
const moves = () => byMethod("POST").filter((r) => r.url.pathname.endsWith("/move"));

let keyCounter = 0;
const uniqueKey = (label: string) => `${label}-${Date.now()}-${keyCounter++}`;

beforeEach(() => {
  draft = defaultDraft();
  requests = [];
  getStatus = 200;
  patchStatus = 200;
  logCalls.info.length = 0;
  logCalls.warn.length = 0;
  installHandlers();
});

describe("UpdateDraftParams schema", () => {
  it("accepts message_id only and defaults confirm to false", () => {
    const parsed = UpdateDraftParams.parse({ message_id: "d1" });
    expect(parsed.confirm).toBe(false);
  });

  it("rejects missing or empty message_id", () => {
    expect(UpdateDraftParams.safeParse({}).success).toBe(false);
    expect(UpdateDraftParams.safeParse({ message_id: "" }).success).toBe(false);
  });

  it("rejects an invalid recipient address", () => {
    const result = UpdateDraftParams.safeParse({
      message_id: "d1",
      to: [{ address: "not-an-email" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid body_type and importance", () => {
    expect(UpdateDraftParams.safeParse({ message_id: "d1", body_type: "markdown" }).success).toBe(
      false,
    );
    expect(UpdateDraftParams.safeParse({ message_id: "d1", importance: "urgent" }).success).toBe(
      false,
    );
  });

  it("accepts an empty cc array (clear)", () => {
    expect(UpdateDraftParams.safeParse({ message_id: "d1", cc: [] }).success).toBe(true);
  });

  it("has no default for body_type", () => {
    expect(UpdateDraftParams.parse({ message_id: "d1", body: "x" }).body_type).toBeUndefined();
  });
});

describe("update_draft — handler validation", () => {
  it("rejects a call without any updatable field, without calling Graph", async () => {
    const result = await setup().get("update_draft")?.({ message_id: "draft-1", confirm: true });
    expect(result?.isError).toBe(true);
    expect(text(result as ToolResult)).toContain("At least one updatable field");
    expect(requests).toHaveLength(0);
  });

  it("rejects body_type without body, without calling Graph", async () => {
    const result = await setup().get("update_draft")?.({
      message_id: "draft-1",
      body_type: "html",
      confirm: true,
    });
    expect(result?.isError).toBe(true);
    expect(text(result as ToolResult)).toContain("body_type requires body");
    expect(requests).toHaveLength(0);
  });
});

describe("update_draft — preview (confirm=false)", () => {
  it("shows current vs new subject with one GET and no PATCH", async () => {
    const result = (await setup().get("update_draft")?.({
      message_id: "draft-1",
      subject: "New",
    })) as ToolResult;

    expect(result.isError).toBeUndefined();
    expect(byMethod("GET")).toHaveLength(1);
    expect(byMethod("GET")[0].url.searchParams.get("$select")).toContain("isDraft");
    expect(patches()).toHaveLength(0);
    const out = text(result);
    expect(out).toContain("Current subject: Old");
    expect(out).toContain("New subject: New");
    expect(out).toContain("confirm: true");
    expect(out).toContain("Last modified: 2026-10-20T08:00:00Z");
  });

  it("marks cleared and replaced recipient lists", async () => {
    const result = (await setup().get("update_draft")?.({
      message_id: "draft-1",
      cc: [],
      to: [{ address: "a@x.de" }, { address: "b@x.de" }],
    })) as ToolResult;

    const out = text(result);
    expect(out).toContain("New CC: (cleared)");
    expect(out).toContain("New To: a@x.de, b@x.de (replaces 3 current)");
  });

  it("describes a body change without echoing body content", async () => {
    const result = (await setup().get("update_draft")?.({
      message_id: "draft-1",
      body: "plain new text",
    })) as ToolResult;

    const out = text(result);
    expect(out).toContain("14 characters (text input, saved as HTML in Aptos 11pt black)");
    expect(out).not.toContain("SECRET-BODY-CONTENT");
    expect(out).not.toContain("plain new text");
  });

  it("never selects the body", async () => {
    await setup().get("update_draft")?.({ message_id: "draft-1", subject: "New", body: "x" });
    expect(byMethod("GET")[0].url.searchParams.get("$select")?.split(",")).not.toContain("body");
  });

  it("refuses a non-draft message", async () => {
    draft.isDraft = false;
    const result = (await setup().get("update_draft")?.({
      message_id: "draft-1",
      subject: "New",
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("not a draft");
    expect(patches()).toHaveLength(0);
  });
});

describe("update_draft — confirmed", () => {
  it("patches only the subject", async () => {
    const result = (await setup().get("update_draft")?.({
      message_id: "draft-1",
      subject: "New",
      confirm: true,
    })) as ToolResult;

    expect(patches()).toHaveLength(1);
    expect(patches()[0].body).toEqual({ subject: "New" });
    const out = text(result);
    expect(out).toContain("Draft updated");
    expect(out).toContain("Message ID: draft-1");
    expect(out).toContain("Fields changed: 1");
  });

  it("patches the body as styled HTML for text and html input", async () => {
    const handlers = setup();
    await handlers.get("update_draft")?.({ message_id: "draft-1", body: "Hi", confirm: true });
    expect(patches()[0].body).toEqual({
      body: { contentType: "HTML", content: `<div style="${MAIL_FONT_STYLE}">Hi</div>` },
    });

    await handlers.get("update_draft")?.({
      message_id: "draft-1",
      body: "<b>Hi</b>",
      body_type: "html",
      confirm: true,
    });
    expect(patches()[1].body).toEqual({
      body: { contentType: "HTML", content: `<div style="${MAIL_FONT_STYLE}"><b>Hi</b></div>` },
    });
  });

  it("replaces To and keeps the display name", async () => {
    await setup().get("update_draft")?.({
      message_id: "draft-1",
      to: [{ address: "a@x.de", name: "A" }],
      confirm: true,
    });
    expect(patches()[0].body).toEqual({
      toRecipients: [{ emailAddress: { address: "a@x.de", name: "A" } }],
    });
  });

  it("clears CC with an empty array", async () => {
    await setup().get("update_draft")?.({ message_id: "draft-1", cc: [], confirm: true });
    expect(patches()[0].body).toEqual({ ccRecipients: [] });
  });

  it("patches importance", async () => {
    await setup().get("update_draft")?.({
      message_id: "draft-1",
      importance: "high",
      confirm: true,
    });
    expect(patches()[0].body).toEqual({ importance: "high" });
  });

  it("patches exactly the combination of passed fields", async () => {
    const result = (await setup().get("update_draft")?.({
      message_id: "draft-1",
      subject: "S",
      to: [{ address: "a@x.de" }],
      bcc: [{ address: "b@x.de" }],
      confirm: true,
    })) as ToolResult;

    expect(Object.keys(patches()[0].body as object).sort()).toEqual([
      "bccRecipients",
      "subject",
      "toRecipients",
    ]);
    expect(text(result)).toContain("Fields changed: 3");
  });

  it("refuses a non-draft message without patching", async () => {
    draft.isDraft = false;
    const result = (await setup().get("update_draft")?.({
      message_id: "draft-1",
      subject: "New",
      confirm: true,
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("not a draft");
    expect(patches()).toHaveLength(0);
  });

  it("re-checks isDraft without the cache after a preview", async () => {
    const handlers = setup();
    await handlers.get("update_draft")?.({ message_id: "draft-1", subject: "New" });

    // The user sends the draft in Outlook between preview and confirm.
    draft.isDraft = false;
    const result = (await handlers.get("update_draft")?.({
      message_id: "draft-1",
      subject: "New",
      confirm: true,
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(patches()).toHaveLength(0);
    expect(byMethod("GET")).toHaveLength(2);
  });

  it("does not trust a cached isDraft after a failed PATCH", async () => {
    // A failing PATCH skips cache invalidation, so the confirmed-path isDraft
    // entry would survive — the re-check must still go to Graph.
    const handlers = setup();
    patchStatus = 400;
    await handlers.get("update_draft")?.({ message_id: "draft-1", subject: "A", confirm: true });

    patchStatus = 200;
    draft.isDraft = false;
    const result = (await handlers.get("update_draft")?.({
      message_id: "draft-1",
      subject: "A",
      confirm: true,
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("not a draft");
    expect(patches()).toHaveLength(1);
  });

  it("maps a 404 to a not-found error", async () => {
    getStatus = 404;
    const result = (await setup().get("update_draft")?.({
      message_id: "missing",
      subject: "New",
      confirm: true,
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("not found");
    expect(patches()).toHaveLength(0);
  });

  it("maps a 400 on PATCH and stores no idempotency entry", async () => {
    patchStatus = 400;
    const key = uniqueKey("upd-400");
    const handlers = setup();
    const first = (await handlers.get("update_draft")?.({
      message_id: "draft-1",
      subject: "New",
      confirm: true,
      idempotency_key: key,
    })) as ToolResult;
    expect(first.isError).toBe(true);
    expect(text(first)).toContain("Validation failed");

    patchStatus = 200;
    await handlers.get("update_draft")?.({
      message_id: "draft-1",
      subject: "New",
      confirm: true,
      idempotency_key: key,
    });
    expect(patches()).toHaveLength(2);
  });

  it("uses the /users/{id} path when user_id is given", async () => {
    await setup().get("update_draft")?.({
      message_id: "draft-1",
      subject: "New",
      user_id: "u@x.de",
      confirm: true,
    });
    for (const r of requests) {
      expect(r.url.pathname).toBe("/v1.0/users/u@x.de/messages/draft-1");
    }
    expect(patches()).toHaveLength(1);
  });

  it("encodes the message id", async () => {
    await setup().get("update_draft")?.({
      message_id: "AA/b+c=",
      subject: "New",
      confirm: true,
    });
    expect(patches()[0].url.pathname).toBe("/v1.0/me/messages/AA%2Fb%2Bc%3D");
  });

  it("replays the same idempotency key without calling Graph again", async () => {
    const key = uniqueKey("upd-replay");
    const handlers = setup();
    const params = { message_id: "draft-1", subject: "New", confirm: true, idempotency_key: key };
    const first = await handlers.get("update_draft")?.(params);
    const second = await handlers.get("update_draft")?.(params);

    expect(byMethod("GET")).toHaveLength(1);
    expect(patches()).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it("isolates keys by tool and by user_id", async () => {
    const key = uniqueKey("upd-iso");
    idempotencyCache.set("create_draft", key, { message_id: "other" });
    const handlers = setup();
    await handlers.get("update_draft")?.({
      message_id: "draft-1",
      subject: "A",
      confirm: true,
      idempotency_key: key,
    });
    await handlers.get("update_draft")?.({
      message_id: "draft-1",
      subject: "A",
      confirm: true,
      idempotency_key: key,
      user_id: "u@x.de",
    });
    expect(patches()).toHaveLength(2);
  });

  it("does not cache previews under the idempotency key", async () => {
    const key = uniqueKey("upd-preview");
    const handlers = setup();
    await handlers.get("update_draft")?.({
      message_id: "draft-1",
      subject: "A",
      idempotency_key: key,
    });
    await handlers.get("update_draft")?.({
      message_id: "draft-1",
      subject: "A",
      confirm: true,
      idempotency_key: key,
    });
    expect(patches()).toHaveLength(1);
  });

  it("logs metadata only — no subject, body or addresses", async () => {
    await setup().get("update_draft")?.({
      message_id: "draft-1",
      subject: "Very private subject",
      body: "private body",
      to: [{ address: "secret@x.de" }],
      confirm: true,
    });

    const record = logCalls.info.find((args) => {
      const data = args[0] as Record<string, unknown>;
      return data.tool === "update_draft";
    });
    expect(record).toBeDefined();
    const data = (record as unknown[])[0] as Record<string, unknown>;
    expect(data.fieldCount).toBe(3);
    expect(typeof data.duration_ms).toBe("number");
    const serialized = JSON.stringify(logCalls);
    expect(serialized).not.toContain("Very private subject");
    expect(serialized).not.toContain("private body");
    expect(serialized).not.toContain("secret@x.de");
  });
});

describe("delete_draft", () => {
  it("previews a reversible move without moving", async () => {
    const result = (await setup().get("delete_draft")?.({ message_id: "draft-1" })) as ToolResult;

    expect(byMethod("GET")[0].url.searchParams.get("$select")).toContain("isDraft");
    expect(text(result)).toContain("Deleted Items (reversible)");
    expect(moves()).toHaveLength(0);
  });

  it("moves the draft to deleteditems and returns the new id with a restore hint", async () => {
    const result = (await setup().get("delete_draft")?.({
      message_id: "draft-1",
      confirm: true,
    })) as ToolResult;

    expect(moves()).toHaveLength(1);
    expect(moves()[0].body).toEqual({ destinationId: "deleteditems" });
    const out = text(result);
    expect(out).toContain("New Message ID: new-id");
    expect(out).toContain("move_email");
    expect(out).toContain("drafts");
  });

  it("refuses a non-draft message in preview and when confirmed", async () => {
    draft.isDraft = false;
    const handlers = setup();
    const preview = (await handlers.get("delete_draft")?.({ message_id: "draft-1" })) as ToolResult;
    const confirmed = (await handlers.get("delete_draft")?.({
      message_id: "draft-1",
      confirm: true,
    })) as ToolResult;

    expect(preview.isError).toBe(true);
    expect(confirmed.isError).toBe(true);
    expect(text(confirmed)).toContain("not a draft");
    expect(moves()).toHaveLength(0);
  });

  it("uses the /users/{id} path when user_id is given", async () => {
    await setup().get("delete_draft")?.({
      message_id: "draft-1",
      user_id: "u@x.de",
      confirm: true,
    });
    expect(moves()[0].url.pathname).toBe("/v1.0/users/u@x.de/messages/draft-1/move");
  });

  it("maps a 404 to a not-found error", async () => {
    getStatus = 404;
    const result = (await setup().get("delete_draft")?.({
      message_id: "missing",
      confirm: true,
    })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(moves()).toHaveLength(0);
  });

  it("replays the same idempotency key with a single move", async () => {
    const key = uniqueKey("del-replay");
    const handlers = setup();
    const params = { message_id: "draft-1", confirm: true, idempotency_key: key };
    const first = await handlers.get("delete_draft")?.(params);
    const second = await handlers.get("delete_draft")?.(params);
    expect(moves()).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it("isolates its keys from delete_email", async () => {
    const key = uniqueKey("del-iso");
    idempotencyCache.set("delete_email", key, { message_id: "other" });
    await setup().get("delete_draft")?.({
      message_id: "draft-1",
      confirm: true,
      idempotency_key: key,
    });
    expect(moves()).toHaveLength(1);
  });
});

describe("persona capability gating", () => {
  it("does not gate update_draft/delete_draft (they never send mail)", () => {
    expect(findToolsMissingCapability(["update_draft", "delete_draft"])).toEqual([
      "update_draft",
      "delete_draft",
    ]);
  });
});
