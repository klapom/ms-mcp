import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config.js";
import { SaveAttachmentToDriveParams } from "../src/schemas/mail-attachment-to-drive.js";
import { registerMailAttachmentToDriveTools } from "../src/tools/mail-attachment-to-drive.js";
import type {
  AttachmentMetadata,
  FetchAttachmentContentResult,
} from "../src/tools/mail-attachments.js";
import { fetchAttachmentContent } from "../src/tools/mail-attachments.js";
import type { ToolResult } from "../src/types/tools.js";
import { NotFoundError } from "../src/utils/errors.js";
import { uploadAllChunks } from "../src/utils/upload-session.js";

// Mock the two collaborators this tool composes: the attachment fetcher (its
// internals are covered by A3's tests) and the chunk transfer.
vi.mock("../src/tools/mail-attachments.js", () => ({
  fetchAttachmentContent: vi.fn(),
}));
vi.mock("../src/utils/upload-session.js", () => ({
  uploadAllChunks: vi.fn(),
}));

const mockFetch = vi.mocked(fetchAttachmentContent);
const mockUploadAllChunks = vi.mocked(uploadAllChunks);

const testConfig: Config = {
  limits: { maxItems: 100, maxBodyLength: 50000 },
  auth: { clientId: "test-client", tenantId: "test-tenant" },
  logging: { level: "silent" },
  cache: { tokenCachePath: "/tmp/test-cache.json" },
} as unknown as Config;

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

/** Spy Graph client: `.api().header().put()` (simple) and `.api().post()` (session). */
function createSpyGraphClient() {
  const put = vi
    .fn()
    .mockResolvedValue({ id: "id-1", name: "file.pdf", webUrl: "https://web/file.pdf" });
  const header = vi.fn().mockReturnValue({ put });
  const post = vi.fn().mockResolvedValue({ uploadUrl: "https://upload/session" });
  const api = vi.fn().mockReturnValue({ header, post });
  return { client: { api } as unknown as Client, api, header, post, put };
}

function createCapturingServer() {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _shape: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  return { server, handlers };
}

function getHandler(client: Client): ToolHandler {
  const { server, handlers } = createCapturingServer();
  registerMailAttachmentToDriveTools(server, client, testConfig, {
    getAccessToken: async () => "test-token",
  });
  const handler = handlers.get("save_attachment_to_drive");
  if (!handler) throw new Error("save_attachment_to_drive not registered");
  return handler;
}

function meta(overrides: Partial<AttachmentMetadata> = {}): AttachmentMetadata {
  return {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: "invoice.pdf",
    contentType: "application/pdf",
    size: 300 * 1024,
    ...overrides,
  };
}

function okFetch(buffer: Buffer, metaOverrides: Partial<AttachmentMetadata> = {}) {
  const m = meta({ size: buffer.length, ...metaOverrides });
  const result: FetchAttachmentContentResult = { ok: true, meta: m, buffer };
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// schema
// ---------------------------------------------------------------------------

describe("SaveAttachmentToDriveParams schema", () => {
  it("parses required fields and applies defaults", () => {
    const parsed = SaveAttachmentToDriveParams.parse({
      message_id: "msg-1",
      attachment_id: "att-1",
    });
    expect(parsed.folder_path).toBe("/");
    expect(parsed.confirm).toBe(false);
    expect(parsed.file_name).toBeUndefined();
  });

  it("rejects empty message_id / attachment_id", () => {
    expect(
      SaveAttachmentToDriveParams.safeParse({ message_id: "", attachment_id: "a" }).success,
    ).toBe(false);
    expect(
      SaveAttachmentToDriveParams.safeParse({ message_id: "m", attachment_id: "" }).success,
    ).toBe(false);
  });

  it("does not expose site_id / drive_id (identity narrowed to user_id)", () => {
    const parsed = SaveAttachmentToDriveParams.parse({
      message_id: "m",
      attachment_id: "a",
      site_id: "s",
      drive_id: "d",
    }) as Record<string, unknown>;
    expect(parsed.site_id).toBeUndefined();
    expect(parsed.drive_id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------

describe("save_attachment_to_drive handler", () => {
  it("happy path: small attachment → one PUT with exact bytes, no payload in result", async () => {
    const payload = Buffer.from("A".repeat(300 * 1024), "utf-8");
    mockFetch.mockResolvedValue(okFetch(payload, { name: "invoice.pdf" }));
    const { client, api, put, post } = createSpyGraphClient();

    const result = await getHandler(client)({
      message_id: "msg-happy",
      attachment_id: "att-1",
      folder_path: "/Invoices",
      confirm: true,
    });

    expect(result.isError).toBeUndefined();
    expect(put).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    // Exact bytes uploaded.
    const uploadedBody = put.mock.calls[0][0] as Buffer;
    expect(Buffer.isBuffer(uploadedBody)).toBe(true);
    expect(uploadedBody.equals(payload)).toBe(true);
    // Path-addressed to the requested folder.
    expect(api).toHaveBeenCalledWith("/me/drive/root:/Invoices/invoice.pdf:/content");
    // Result names the item but never the payload.
    const text = result.content[0].text;
    expect(text).toContain("id-1");
    expect(text).toContain("file.pdf");
    expect(text).toContain("https://web/file.pdf");
    expect(text.length).toBeLessThan(200);
    expect(text).not.toContain(payload.toString("base64"));
  });

  it("confirm absent → preview naming source + destination, zero upload calls", async () => {
    const payload = Buffer.from("hello", "utf-8");
    mockFetch.mockResolvedValue(okFetch(payload, { name: "invoice.pdf", size: 5 }));
    const { client, put, post } = createSpyGraphClient();

    const result = await getHandler(client)({
      message_id: "msg-preview",
      attachment_id: "att-1",
      folder_path: "/Invoices",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("invoice.pdf");
    expect(text).toContain("5 B");
    expect(text).toContain("/Invoices/invoice.pdf");
    expect(put).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(mockUploadAllChunks).not.toHaveBeenCalled();
  });

  it("attachment just over 4MB → chunked session path, no simple PUT", async () => {
    const payload = Buffer.alloc(5 * 1024 * 1024, 0x41);
    mockFetch.mockResolvedValue(okFetch(payload, { name: "big.bin" }));
    mockUploadAllChunks.mockResolvedValue({
      id: "big-id",
      name: "big.bin",
      size: payload.length,
      webUrl: "https://web/big.bin",
    });
    const { client, api, put, post } = createSpyGraphClient();

    const result = await getHandler(client)({
      message_id: "msg-chunk",
      attachment_id: "att-1",
      folder_path: "/Invoices",
      confirm: true,
    });

    expect(result.isError).toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
    expect(mockUploadAllChunks).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith("/me/drive/root:/Invoices/big.bin:/createUploadSession");
    expect(result.content[0].text).toContain("big-id");
  });

  it("fetch returns >10MB abort error → passthrough, no upload", async () => {
    const abort: FetchAttachmentContentResult = {
      ok: false,
      result: {
        content: [{ type: "text", text: "Attachment too large: 11.0 MB (max 10 MB)." }],
        isError: true,
      },
    };
    mockFetch.mockResolvedValue(abort);
    const { client, put, post } = createSpyGraphClient();

    const result = await getHandler(client)({
      message_id: "msg-abort",
      attachment_id: "att-1",
      confirm: true,
    });

    expect(result).toBe(abort.result);
    expect(result.isError).toBe(true);
    expect(put).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("fetch returns unsupported-type error → passthrough, no upload", async () => {
    const unsupported: FetchAttachmentContentResult = {
      ok: false,
      result: {
        content: [{ type: "text", text: "This attachment is an embedded Outlook item." }],
        isError: true,
      },
    };
    mockFetch.mockResolvedValue(unsupported);
    const { client, put, post } = createSpyGraphClient();

    const result = await getHandler(client)({
      message_id: "msg-item",
      attachment_id: "att-1",
      confirm: true,
    });

    expect(result).toBe(unsupported.result);
    expect(put).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("invalid folder_path '/a/../b' → isError, thrown before fetch, zero Graph calls", async () => {
    const { client, api, put } = createSpyGraphClient();

    const result = await getHandler(client)({
      message_id: "msg-badfolder",
      attachment_id: "att-1",
      folder_path: "/a/../b",
      confirm: true,
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("explicit unsafe file_name 'x:y' → isError, no upload, no fetch", async () => {
    const { client, put, post } = createSpyGraphClient();

    const result = await getHandler(client)({
      message_id: "msg-badname",
      attachment_id: "att-1",
      file_name: "x:y",
      confirm: true,
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("unsafe attachment name + no override → rejected, tells caller to supply file_name", async () => {
    const payload = Buffer.from("data", "utf-8");
    mockFetch.mockResolvedValue(okFetch(payload, { name: "böse:name.pdf" }));
    const { client, put } = createSpyGraphClient();

    const result = await getHandler(client)({
      message_id: "msg-unsafemeta",
      attachment_id: "att-1",
      confirm: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("file_name");
    expect(put).not.toHaveBeenCalled();
  });

  it("individually-safe parts, unsafe when joined (encoded traversal) → rejected, no upload", async () => {
    // ".%2E%2Fx" passes assertSafeFileName (no literal '/', ':' or '..'), but the
    // joined path "/a/.%2E%2Fx" decodes to "/a/../x" and is caught.
    const { client, api, put } = createSpyGraphClient();

    const result = await getHandler(client)({
      message_id: "msg-join",
      attachment_id: "att-1",
      folder_path: "/a",
      file_name: ".%2E%2Fx",
      confirm: true,
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("same (message, attachment, folder, file) twice → second is cached, upload once total", async () => {
    const payload = Buffer.from("idempotent", "utf-8");
    mockFetch.mockResolvedValue(okFetch(payload, { name: "invoice.pdf" }));
    const { client, put } = createSpyGraphClient();
    const handler = getHandler(client);

    const args = {
      message_id: "msg-idem-1",
      attachment_id: "att-1",
      folder_path: "/Invoices",
      confirm: true,
    };
    const first = await handler({ ...args });
    const second = await handler({ ...args });

    expect(put).toHaveBeenCalledTimes(1);
    expect(second.content[0].text).toBe(first.content[0].text);
  });

  it("same attachment + destination but different user_id → not a cache hit", async () => {
    const payload = Buffer.from("per-user", "utf-8");
    mockFetch.mockResolvedValue(okFetch(payload, { name: "invoice.pdf" }));
    const { client, put } = createSpyGraphClient();
    const handler = getHandler(client);

    const base = {
      message_id: "msg-idem-2",
      attachment_id: "att-1",
      folder_path: "/Invoices",
      confirm: true,
    };
    await handler({ ...base, user_id: "alice@example.com" });
    await handler({ ...base, user_id: "bob@example.com" });

    expect(put).toHaveBeenCalledTimes(2);
  });

  it("Graph 404 during fetch → isError result, not an unhandled exception", async () => {
    mockFetch.mockRejectedValue(new NotFoundError("attachment", "att-404"));
    const { client, put, post } = createSpyGraphClient();

    const result = await getHandler(client)({
      message_id: "msg-404",
      attachment_id: "att-404",
      confirm: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
    expect(put).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
