import { fileURLToPath } from "node:url";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enforceToolCapability,
  findToolsMissingCapability,
  pinUserId,
  withPersonaCapabilityGate,
} from "../src/auth/persona-pinning.js";
import {
  getPersonaScope,
  loadPersonaScopesFromFile,
  resetLoadedPersonaScopes,
  setLoadedPersonaScopes,
} from "../src/auth/persona-scopes.js";
import { type CallerIdentity, runWithIdentity } from "../src/auth/request-identity.js";
import type { Config } from "../src/config.js";
import { resolveUserPath } from "../src/schemas/common.js";
import { registerBatchFilesTools } from "../src/tools/batch-files.js";
import { registerBatchMailTools } from "../src/tools/batch-mail.js";
import { registerCalendarCreateTools } from "../src/tools/calendar-create.js";
import { registerCalendarRespondTools } from "../src/tools/calendar-respond.js";
import { registerDriveCopyTools } from "../src/tools/drive-copy.js";
import { registerDriveFolderTools } from "../src/tools/drive-folder.js";
import { registerDriveListTools } from "../src/tools/drive-list.js";
import { registerDriveMoveTools } from "../src/tools/drive-move.js";
import { registerDriveShareTools } from "../src/tools/drive-share.js";
import { registerDriveUploadTools } from "../src/tools/drive-upload.js";
import { registerDriveUploadLargeTools } from "../src/tools/drive-upload-large.js";
import { registerMailAttachmentToDriveTools } from "../src/tools/mail-attachment-to-drive.js";
import { registerMailForwardTools } from "../src/tools/mail-forward.js";
import { registerMailReplyTools } from "../src/tools/mail-reply.js";
import { registerMailSendTools } from "../src/tools/mail-send.js";
import { registerPresenceTools } from "../src/tools/presence.js";
import { registerSharePointListWriteTools } from "../src/tools/sharepoint-list-write.js";
import { registerSharePointListTools } from "../src/tools/sharepoint-lists.js";
import { registerSharePointSiteTools } from "../src/tools/sharepoint-sites.js";
import { registerUserPhotoTools } from "../src/tools/user-photo.js";
import type { ToolResult } from "../src/types/tools.js";
import { resolveDrivePath } from "../src/utils/drive-path.js";
import { AuthError } from "../src/utils/errors.js";

const KLAUS = "klaus.pommer@pommerconsulting.de";
const SUKI = "suki-mailbox@pommerconsulting.de";
const SCOPES_FILE = fileURLToPath(new URL("../config/persona-scopes.json", import.meta.url));

const testConfig: Config = {
  limits: { maxItems: 100, maxBodyLength: 50000 },
  server: { logLevel: "silent", toolPreset: "full" },
  cache: { tokenCachePath: "/tmp/test-cache.json" },
} as unknown as Config;

function id(personaKey: string | null): CallerIdentity {
  return { personaKey, sub: personaKey ?? "anon" };
}

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

/** Register `register` onto a capturing server wrapped by the capability gate. */
function gatedHandler(
  register: (s: McpServer, c: Client, cfg: Config, deps?: unknown) => void,
  toolName: string,
  client: Client,
): ToolHandler {
  const handlers = new Map<string, ToolHandler>();
  const capturing = {
    tool: (name: string, _d: string, _s: unknown, h: ToolHandler) => handlers.set(name, h),
  } as unknown as McpServer;
  register(withPersonaCapabilityGate(capturing), client, testConfig);
  const h = handlers.get(toolName);
  if (!h) throw new Error(`${toolName} not registered`);
  return h;
}

/** Fully chainable Graph spy: every fluent method returns the same request. */
function createSpyClient(getReturn?: unknown) {
  const post = vi.fn().mockResolvedValue({});
  const put = vi.fn().mockResolvedValue({});
  const get = vi.fn().mockResolvedValue(getReturn ?? { value: [] });
  const req: Record<string, unknown> = { get, post, put };
  for (const m of [
    "header",
    "query",
    "top",
    "skip",
    "select",
    "filter",
    "count",
    "expand",
    "orderby",
  ]) {
    req[m] = vi.fn().mockReturnValue(req);
  }
  const api = vi.fn().mockReturnValue(req);
  return { client: { api } as unknown as Client, api, post, put, get };
}

beforeEach(() => {
  resetLoadedPersonaScopes();
  loadPersonaScopesFromFile(SCOPES_FILE);
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// scope loader / lookup
// ---------------------------------------------------------------------------

describe("persona-scopes loader + getPersonaScope", () => {
  it("the shipped config file loads and matches the decided matrix", () => {
    const map = loadPersonaScopesFromFile(SCOPES_FILE);
    expect(map.helga).toEqual({ mailboxes: [KLAUS], sendAs: true, drive: "write", sites: [] });
    expect(map.ferdinand).toEqual({ mailboxes: [KLAUS], sendAs: false, drive: "write", sites: [] });
    expect(map.conny).toEqual({ mailboxes: [KLAUS], sendAs: false, drive: "read", sites: [] });
    expect(map.cora).toEqual({ mailboxes: [], sendAs: false, drive: "none", sites: [] });
  });

  it("unknown persona, null key, and unloaded table all resolve to null (fail-closed)", () => {
    expect(getPersonaScope("mallory")).toBeNull();
    expect(getPersonaScope(null)).toBeNull();
    resetLoadedPersonaScopes();
    expect(getPersonaScope("ferdinand")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pinUserId (the shared mailbox choke point)
// ---------------------------------------------------------------------------

describe("pinUserId", () => {
  it("no identity → passthrough (off-mode)", () => {
    expect(pinUserId(undefined, undefined)).toBeUndefined();
    expect(pinUserId(SUKI, undefined)).toBe(SUKI);
  });

  it("__operator__ → passthrough (bypass)", () => {
    expect(pinUserId(SUKI, id("__operator__"))).toBe(SUKI);
    expect(pinUserId(undefined, id("__operator__"))).toBeUndefined();
  });

  it("absent user_id resolves to the persona's primary mailbox", () => {
    expect(pinUserId(undefined, id("ferdinand"))).toBe(KLAUS);
    expect(pinUserId("me", id("ferdinand"))).toBe(KLAUS);
    expect(pinUserId("/me", id("ferdinand"))).toBe(KLAUS);
  });

  it("matching mailbox is allowed, case-insensitively", () => {
    expect(pinUserId(KLAUS, id("ferdinand"))).toBe(KLAUS);
    expect(pinUserId("Klaus.Pommer@PommerConsulting.de", id("ferdinand"))).toBe(KLAUS);
  });

  it("non-allowed mailbox → 403", () => {
    expect(() => pinUserId(SUKI, id("ferdinand"))).toThrow(AuthError);
    try {
      pinUserId(SUKI, id("ferdinand"));
    } catch (e) {
      expect((e as AuthError).httpStatus).toBe(403);
      expect((e as AuthError).message).toContain("may not act as mailbox");
    }
  });

  it("unknown persona → 403 (fail-closed)", () => {
    expect(() => pinUserId(undefined, id("mallory"))).toThrow(AuthError);
    expect(() => pinUserId(KLAUS, id("mallory"))).toThrow(/not authorized/);
  });

  it("no-mailbox persona cannot default to anything → 403", () => {
    expect(() => pinUserId(undefined, id("cora"))).toThrow(AuthError);
  });
});

// ---------------------------------------------------------------------------
// resolveUserPath (choke point 1)
// ---------------------------------------------------------------------------

describe("resolveUserPath under persona pinning", () => {
  it("off-mode passthrough is byte-for-byte the pre-B5 behavior", () => {
    expect(resolveUserPath()).toBe("/me");
    expect(resolveUserPath(SUKI)).toBe(`/users/${SUKI}`);
  });

  it("ferdinand, user_id absent → pinned to klaus", () => {
    expect(runWithIdentity(id("ferdinand"), () => resolveUserPath(undefined))).toBe(
      `/users/${KLAUS}`,
    );
  });

  it("ferdinand, own mailbox (mixed case) → allowed", () => {
    expect(
      runWithIdentity(id("ferdinand"), () => resolveUserPath("Klaus.Pommer@PommerConsulting.de")),
    ).toBe(`/users/${KLAUS}`);
  });

  it("ferdinand, foreign mailbox → 403 (no path returned)", () => {
    expect(() => runWithIdentity(id("ferdinand"), () => resolveUserPath(SUKI))).toThrow(AuthError);
  });

  it("unknown persona → 403", () => {
    expect(() => runWithIdentity(id("mallory"), () => resolveUserPath(undefined))).toThrow(
      AuthError,
    );
  });

  it("__operator__ → passthrough", () => {
    expect(runWithIdentity(id("__operator__"), () => resolveUserPath(SUKI))).toBe(`/users/${SUKI}`);
  });
});

// ---------------------------------------------------------------------------
// resolveDrivePath (choke point 2) — mailbox + site gating
// ---------------------------------------------------------------------------

describe("resolveDrivePath under persona pinning", () => {
  it("off-mode passthrough preserves pre-B5 behavior", () => {
    expect(resolveDrivePath()).toBe("/me/drive");
    expect(resolveDrivePath("user@tenant.com")).toBe("/users/user%40tenant.com/drive");
    expect(resolveDrivePath(undefined, "site-abc", "drive-xyz")).toBe(
      "/sites/site-abc/drives/drive-xyz",
    );
  });

  it("ferdinand, absent user_id → pinned to klaus's drive", () => {
    expect(runWithIdentity(id("ferdinand"), () => resolveDrivePath(undefined))).toBe(
      "/users/klaus.pommer%40pommerconsulting.de/drive",
    );
  });

  it("ferdinand, foreign mailbox → 403", () => {
    expect(() => runWithIdentity(id("ferdinand"), () => resolveDrivePath(SUKI))).toThrow(AuthError);
  });

  it("site_id with an empty sites scope → 403 (closes the escape hatch)", () => {
    expect(() =>
      runWithIdentity(id("ferdinand"), () => resolveDrivePath(undefined, "site-1", "drive-1")),
    ).toThrow(/site\/drive/);
  });

  it("site_id present in the persona's sites scope → allowed", () => {
    setLoadedPersonaScopes({
      "site-persona": { mailboxes: [KLAUS], sendAs: false, drive: "read", sites: ["site-1"] },
    });
    expect(
      runWithIdentity(id("site-persona"), () => resolveDrivePath(undefined, "site-1", "drive-1")),
    ).toBe("/sites/site-1/drives/drive-1");
  });
});

// ---------------------------------------------------------------------------
// enforceToolCapability (operation-level gate)
// ---------------------------------------------------------------------------

describe("enforceToolCapability", () => {
  it("off-mode and operator bypass — never throws", () => {
    expect(() => enforceToolCapability("upload_file", undefined)).not.toThrow();
    expect(() => enforceToolCapability("upload_file", id("__operator__"))).not.toThrow();
  });

  it("untracked tool carries no requirement", () => {
    expect(() => enforceToolCapability("get_user", id("cora"))).not.toThrow();
  });

  it("send_email requires sendAs", () => {
    expect(() => enforceToolCapability("send_email", id("helga"))).not.toThrow();
    expect(() => enforceToolCapability("send_email", id("ferdinand"))).toThrow(/send_as/);
  });

  it("drive:write tools require write", () => {
    expect(() => enforceToolCapability("upload_file", id("ferdinand"))).not.toThrow();
    expect(() => enforceToolCapability("upload_file", id("conny"))).toThrow(/drive:write/);
    expect(() => enforceToolCapability("upload_file", id("cora"))).toThrow(/drive:write/);
  });

  it("drive read-only tools require drive !== none", () => {
    expect(() => enforceToolCapability("list_files", id("conny"))).not.toThrow();
    expect(() => enforceToolCapability("download_attachment", id("conny"))).not.toThrow();
    expect(() => enforceToolCapability("list_files", id("cora"))).toThrow(/drive/);
  });

  it("unknown persona is denied for any gated tool", () => {
    expect(() => enforceToolCapability("list_files", id("mallory"))).toThrow(/not authorized/);
  });
});

// ---------------------------------------------------------------------------
// gate integration — the check fires before the handler / Graph call
// ---------------------------------------------------------------------------

describe("capability gate integration", () => {
  it("conny (drive:read) → upload_file 403 at the gate, zero Graph calls", async () => {
    const spy = createSpyClient();
    const handler = gatedHandler(registerDriveUploadTools, "upload_file", spy.client);
    const result = await runWithIdentity(id("conny"), () =>
      handler({ path: "/x.txt", content_base64: "AA==", confirm: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("drive:write");
    expect(spy.api).not.toHaveBeenCalled();
  });

  it("helga (sendAs) → send_email passes the gate (reaches handler → preview)", async () => {
    const spy = createSpyClient();
    const handler = gatedHandler(registerMailSendTools, "send_email", spy.client);
    const result = await runWithIdentity(id("helga"), () =>
      handler({ to: ["x@y.com"], subject: "hi", body: "b" }),
    );
    expect(result.isError).toBeUndefined();
    expect(spy.post).not.toHaveBeenCalled(); // preview only (confirm defaulted false)
  });

  it("ferdinand (sendAs:false) → send_email 403 at the gate, nothing sent", async () => {
    const spy = createSpyClient();
    const handler = gatedHandler(registerMailSendTools, "send_email", spy.client);
    const result = await runWithIdentity(id("ferdinand"), () =>
      handler({ to: ["x@y.com"], subject: "hi", body: "b", confirm: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("send_as");
    expect(spy.api).not.toHaveBeenCalled();
  });

  it("conny (drive:read) → list_files passes the gate (reaches handler)", async () => {
    const spy = createSpyClient({ value: [] });
    const handler = gatedHandler(registerDriveListTools, "list_files", spy.client);
    const result = await runWithIdentity(id("conny"), () => handler({}));
    expect(result.isError).toBeUndefined();
    // pinned to klaus's drive, not blocked
    expect(spy.api).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// directory-read exemption vs. pinned write
// ---------------------------------------------------------------------------

describe("directory exemption (get_user_photo) vs. pinned write (set_status_message)", () => {
  it("get_user_photo of ANOTHER mailbox is allowed (directory lookup, exempt)", async () => {
    const spy = createSpyClient(new Uint8Array([1, 2, 3]).buffer);
    const handler = gatedHandler(registerUserPhotoTools, "get_user_photo", spy.client);
    const result = await runWithIdentity(id("ferdinand"), () => handler({ user_id: SUKI }));
    expect(result.isError).toBeUndefined();
    expect(spy.api).toHaveBeenCalledWith(`/users/${encodeURIComponent(SUKI)}/photo/$value`);
  });

  it("set_status_message targeting ANOTHER mailbox → 403, nothing written", async () => {
    const spy = createSpyClient();
    const handler = gatedHandler(registerPresenceTools, "set_status_message", spy.client);
    await expect(
      runWithIdentity(id("ferdinand"), () =>
        handler({ message: "brb", confirm: true, user_id: SUKI }),
      ),
    ).rejects.toThrow(/may not act as mailbox/);
    expect(spy.api).not.toHaveBeenCalled();
  });

  it("set_status_message for the persona's own mailbox → allowed, one write", async () => {
    const spy = createSpyClient();
    const handler = gatedHandler(registerPresenceTools, "set_status_message", spy.client);
    const result = await runWithIdentity(id("ferdinand"), () =>
      handler({ message: "brb", confirm: true, user_id: KLAUS }),
    );
    expect(result.isError).toBeUndefined();
    expect(spy.api).toHaveBeenCalledWith("/me/presence/setStatusMessage");
  });
});

// ---------------------------------------------------------------------------
// calendar operations that notify an external party (sendAs-gated)
// ---------------------------------------------------------------------------

describe("calendar notification tools require sendAs", () => {
  const start = { dateTime: "2026-01-01T10:00:00", timeZone: "UTC" };
  const end = { dateTime: "2026-01-01T11:00:00", timeZone: "UTC" };

  it("respond_to_event (decline, confirm) as sendAs:false persona → 403, zero Graph calls", async () => {
    const spy = createSpyClient();
    const handler = gatedHandler(registerCalendarRespondTools, "respond_to_event", spy.client);
    const result = await runWithIdentity(id("ferdinand"), () =>
      handler({ event_id: "e1", action: "decline", confirm: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("send_as");
    expect(spy.api).not.toHaveBeenCalled();
  });

  it("create_event WITH attendees as sendAs:false persona → 403, zero Graph calls", async () => {
    const spy = createSpyClient();
    const handler = gatedHandler(registerCalendarCreateTools, "create_event", spy.client);
    const result = await runWithIdentity(id("ferdinand"), () =>
      handler({ subject: "s", start, end, attendees: [{ email: "x@y.com" }], confirm: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("send_as");
    expect(spy.api).not.toHaveBeenCalled();
  });

  // The capability table sees only the tool NAME, not its arguments, so it
  // cannot distinguish an attendee-less create_event; the chosen policy gates
  // create_event unconditionally on sendAs. A no-attendee call by a sendAs:false
  // persona is therefore ALSO denied — the deliberate, safer tradeoff.
  it("create_event with NO attendees as sendAs:false persona → still 403 (unconditional)", async () => {
    const spy = createSpyClient();
    const handler = gatedHandler(registerCalendarCreateTools, "create_event", spy.client);
    const result = await runWithIdentity(id("ferdinand"), () =>
      handler({ subject: "s", start, end, confirm: true }),
    );
    expect(result.isError).toBe(true);
    expect(spy.api).not.toHaveBeenCalled();
  });

  it("create_event as a sendAs persona → passes the gate (reaches handler → preview)", async () => {
    const spy = createSpyClient();
    const handler = gatedHandler(registerCalendarCreateTools, "create_event", spy.client);
    const result = await runWithIdentity(id("helga"), () => handler({ subject: "s", start, end }));
    expect(result.isError).toBeUndefined();
    expect(spy.api).not.toHaveBeenCalled(); // preview only (confirm defaulted false)
  });
});

// ---------------------------------------------------------------------------
// bulk mailbox mutations require owning a mailbox (mailboxWrite)
// ---------------------------------------------------------------------------

describe("bulk mailbox mutations require a mailbox", () => {
  it("batch_move_emails as a mailbox-owning persona → passes the gate (preview)", async () => {
    const spy = createSpyClient();
    const handler = gatedHandler(registerBatchMailTools, "batch_move_emails", spy.client);
    const result = await runWithIdentity(id("ferdinand"), () =>
      handler({ message_ids: ["m1"], destination_folder_id: "f1" }),
    );
    expect(result.isError).toBeUndefined();
    expect(spy.api).not.toHaveBeenCalled(); // preview only (confirm defaulted false)
  });

  it("batch_move_emails as a no-mailbox persona → 403 at the gate, zero Graph calls", async () => {
    const spy = createSpyClient();
    const handler = gatedHandler(registerBatchMailTools, "batch_move_emails", spy.client);
    const result = await runWithIdentity(id("cora"), () =>
      handler({ message_ids: ["m1"], destination_folder_id: "f1", confirm: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("mailbox");
    expect(spy.api).not.toHaveBeenCalled();
  });

  it("batch_delete_emails as a no-mailbox persona → 403; as a mailbox owner → preview", async () => {
    const denySpy = createSpyClient();
    const denyHandler = gatedHandler(registerBatchMailTools, "batch_delete_emails", denySpy.client);
    const denied = await runWithIdentity(id("cora"), () =>
      denyHandler({ message_ids: ["m1"], confirm: true }),
    );
    expect(denied.isError).toBe(true);
    expect(denySpy.api).not.toHaveBeenCalled();

    const okSpy = createSpyClient();
    const okHandler = gatedHandler(registerBatchMailTools, "batch_delete_emails", okSpy.client);
    const allowed = await runWithIdentity(id("ferdinand"), () =>
      okHandler({ message_ids: ["m1"] }),
    );
    expect(allowed.isError).toBeUndefined();
    expect(okSpy.api).not.toHaveBeenCalled(); // preview only
  });
});

// ---------------------------------------------------------------------------
// SharePoint list writes: capability gate (drive:write) + site allow-list
// ---------------------------------------------------------------------------

describe("SharePoint list-write tools: capability + site scoping", () => {
  const ALLOWED = "site-allowed";
  const FORBIDDEN = "site-forbidden";

  function useSpScopes(): void {
    setLoadedPersonaScopes({
      "sp-writer": { mailboxes: [KLAUS], sendAs: false, drive: "write", sites: [ALLOWED] },
      "sp-reader": { mailboxes: [KLAUS], sendAs: false, drive: "read", sites: [ALLOWED] },
    });
  }

  it("create_list_item with an out-of-scope site_id → 403, zero Graph calls", async () => {
    useSpScopes();
    const spy = createSpyClient();
    const handler = gatedHandler(registerSharePointListWriteTools, "create_list_item", spy.client);
    const result = await runWithIdentity(id("sp-writer"), () =>
      handler({ site_id: FORBIDDEN, list_id: "l1", fields: { Title: "x" }, confirm: true }),
    );
    expect(result.isError).toBe(true);
    expect(spy.api).not.toHaveBeenCalled();
  });

  it("update_list_item with an out-of-scope site_id → 403, zero Graph calls", async () => {
    useSpScopes();
    const spy = createSpyClient();
    const handler = gatedHandler(registerSharePointListWriteTools, "update_list_item", spy.client);
    const result = await runWithIdentity(id("sp-writer"), () =>
      handler({
        site_id: FORBIDDEN,
        list_id: "l1",
        item_id: "i1",
        fields: { Title: "x" },
        confirm: true,
      }),
    );
    expect(result.isError).toBe(true);
    expect(spy.api).not.toHaveBeenCalled();
  });

  it("delete_list_item with an out-of-scope site_id → 403, zero Graph calls", async () => {
    useSpScopes();
    const spy = createSpyClient();
    const handler = gatedHandler(registerSharePointListWriteTools, "delete_list_item", spy.client);
    const result = await runWithIdentity(id("sp-writer"), () =>
      handler({ site_id: FORBIDDEN, list_id: "l1", item_id: "i1", confirm: true }),
    );
    expect(result.isError).toBe(true);
    expect(spy.api).not.toHaveBeenCalled();
  });

  it("create_list_item with an in-scope site_id → allowed, one Graph write", async () => {
    useSpScopes();
    const spy = createSpyClient({ id: "new-item" });
    const handler = gatedHandler(registerSharePointListWriteTools, "create_list_item", spy.client);
    const result = await runWithIdentity(id("sp-writer"), () =>
      handler({ site_id: ALLOWED, list_id: "l1", fields: { Title: "x" }, confirm: true }),
    );
    expect(result.isError).toBeUndefined();
    expect(spy.api).toHaveBeenCalled();
    expect(spy.post).toHaveBeenCalled();
  });

  it("create_list_item by a drive:read persona (in-scope site) → 403 at the gate, zero Graph", async () => {
    useSpScopes();
    const spy = createSpyClient();
    const handler = gatedHandler(registerSharePointListWriteTools, "create_list_item", spy.client);
    const result = await runWithIdentity(id("sp-reader"), () =>
      handler({ site_id: ALLOWED, list_id: "l1", fields: { Title: "x" }, confirm: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("drive:write");
    expect(spy.api).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SharePoint site-scoped reads must honor the site allow-list too
// ---------------------------------------------------------------------------

describe("SharePoint reads honor the site allow-list", () => {
  const ALLOWED = "site-allowed";
  const FORBIDDEN = "site-forbidden";

  function useReaderScope(): void {
    setLoadedPersonaScopes({
      "sp-reader": { mailboxes: [KLAUS], sendAs: false, drive: "read", sites: [ALLOWED] },
    });
  }

  it("list_list_items on an out-of-scope site → 403, zero Graph calls", async () => {
    useReaderScope();
    const spy = createSpyClient({ value: [] });
    const handler = gatedHandler(registerSharePointListTools, "list_list_items", spy.client);
    const result = await runWithIdentity(id("sp-reader"), () =>
      handler({ site_id: FORBIDDEN, list_id: "l1" }),
    );
    expect(result.isError).toBe(true);
    expect(spy.api).not.toHaveBeenCalled();
  });

  it("list_list_items on an in-scope site → reaches Graph", async () => {
    useReaderScope();
    const spy = createSpyClient({ value: [] });
    const handler = gatedHandler(registerSharePointListTools, "list_list_items", spy.client);
    const result = await runWithIdentity(id("sp-reader"), () =>
      handler({ site_id: ALLOWED, list_id: "l1" }),
    );
    expect(result.isError).toBeUndefined();
    expect(spy.api).toHaveBeenCalled();
  });

  it("get_site by an out-of-scope site_id → 403, zero Graph calls", async () => {
    useReaderScope();
    const spy = createSpyClient({ id: FORBIDDEN });
    const handler = gatedHandler(registerSharePointSiteTools, "get_site", spy.client);
    const result = await runWithIdentity(id("sp-reader"), () => handler({ site_id: FORBIDDEN }));
    expect(result.isError).toBe(true);
    expect(spy.api).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// capability-table completeness — a risky tool must never ship unguarded
// ---------------------------------------------------------------------------

describe("TOOL_CAPABILITY completeness for risky module groups", () => {
  /**
   * Registration functions whose every tool sends/notifies an external party,
   * bulk-mutates a mailbox, writes a drive, or writes SharePoint content — each
   * MUST carry a TOOL_CAPABILITY entry. Adding a new tool to any of these
   * without a capability entry fails this test.
   */
  const RISKY_REGISTRATIONS = [
    registerMailSendTools,
    registerMailReplyTools,
    registerMailForwardTools,
    registerBatchMailTools,
    registerDriveUploadTools,
    registerDriveUploadLargeTools,
    registerMailAttachmentToDriveTools,
    registerDriveFolderTools,
    registerDriveMoveTools,
    registerDriveCopyTools,
    registerDriveShareTools,
    registerBatchFilesTools,
    registerSharePointListWriteTools,
  ];

  function toolNamesOf(
    registers: ((s: McpServer, c: Client, cfg: Config, deps?: unknown) => void)[],
  ): string[] {
    const names: string[] = [];
    const capturing = { tool: (name: string) => names.push(name) } as unknown as McpServer;
    const { client } = createSpyClient();
    for (const register of registers) register(capturing, client, testConfig);
    return names;
  }

  it("every tool in a risky module group has a capability entry", () => {
    const names = toolNamesOf(RISKY_REGISTRATIONS);
    expect(names.length).toBeGreaterThan(0);
    expect(findToolsMissingCapability(names)).toEqual([]);
  });

  it("the check catches a risky tool that is missing from TOOL_CAPABILITY", () => {
    const registerFakeRiskyTool = (s: McpServer): void => {
      s.tool("fake_unguarded_send_tool", "test-only", {}, async () => ({ content: [] }));
    };
    const names = toolNamesOf([...RISKY_REGISTRATIONS, registerFakeRiskyTool]);
    expect(findToolsMissingCapability(names)).toEqual(["fake_unguarded_send_tool"]);
  });
});
