import { fileURLToPath } from "node:url";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withPersonaCapabilityGate } from "../src/auth/persona-pinning.js";
import { loadPersonaScopesFromFile, resetLoadedPersonaScopes } from "../src/auth/persona-scopes.js";
import { runWithIdentity } from "../src/auth/request-identity.js";
import type { Config } from "../src/config.js";
import { registerMailAttachmentToDriveTools } from "../src/tools/mail-attachment-to-drive.js";
import type {
  AttachmentMetadata,
  FetchAttachmentContentResult,
} from "../src/tools/mail-attachments.js";
import { fetchAttachmentContent } from "../src/tools/mail-attachments.js";
import type { ToolResult } from "../src/types/tools.js";

// Same collaborators the A4 unit test mocks: attachment fetch + chunk transfer.
vi.mock("../src/tools/mail-attachments.js", () => ({ fetchAttachmentContent: vi.fn() }));
vi.mock("../src/utils/upload-session.js", () => ({ uploadAllChunks: vi.fn() }));

const mockFetch = vi.mocked(fetchAttachmentContent);
const KLAUS_ENC = "klaus.pommer%40pommerconsulting.de";
const SCOPES_FILE = fileURLToPath(new URL("../config/persona-scopes.json", import.meta.url));

const testConfig = { limits: { maxItems: 100, maxBodyLength: 50000 } } as unknown as Config;

function createSpyGraphClient() {
  const put = vi.fn().mockResolvedValue({ id: "id-1", name: "invoice.pdf", webUrl: "https://w/f" });
  const header = vi.fn().mockReturnValue({ put });
  const post = vi.fn().mockResolvedValue({ uploadUrl: "https://u/s" });
  const api = vi.fn().mockReturnValue({ header, post });
  return { client: { api } as unknown as Client, api, put };
}

function gatedHandler(client: Client): (p: Record<string, unknown>) => Promise<ToolResult> {
  const handlers = new Map<string, (p: Record<string, unknown>) => Promise<ToolResult>>();
  const capturing = {
    tool: (
      name: string,
      _d: string,
      _s: unknown,
      h: (p: Record<string, unknown>) => Promise<ToolResult>,
    ) => handlers.set(name, h),
  } as unknown as McpServer;
  registerMailAttachmentToDriveTools(withPersonaCapabilityGate(capturing), client, testConfig, {
    getAccessToken: async () => "t",
  });
  const h = handlers.get("save_attachment_to_drive");
  if (!h) throw new Error("save_attachment_to_drive not registered");
  return h;
}

function okFetch(buffer: Buffer): FetchAttachmentContentResult {
  const meta: AttachmentMetadata = {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: "invoice.pdf",
    contentType: "application/pdf",
    size: buffer.length,
  };
  return { ok: true, meta, buffer };
}

beforeEach(() => {
  resetLoadedPersonaScopes();
  loadPersonaScopesFromFile(SCOPES_FILE);
  vi.clearAllMocks();
});

describe("save_attachment_to_drive end-to-end (FS1 pinning + FS2 capability)", () => {
  it("ferdinand, user_id absent → passes drive:write gate, uploads to KLAUS's pinned drive", async () => {
    mockFetch.mockResolvedValue(okFetch(Buffer.from("A".repeat(1024))));
    const spy = createSpyGraphClient();

    const result = await runWithIdentity({ personaKey: "ferdinand", sub: "f" }, () =>
      gatedHandler(spy.client)({
        message_id: "m1",
        attachment_id: "a1",
        folder_path: "/Invoices",
        confirm: true,
      }),
    );

    expect(result.isError).toBeUndefined();
    // Pinned: /me/drive became /users/<klaus>/drive, not /me/drive.
    expect(spy.api).toHaveBeenCalledWith(
      `/users/${KLAUS_ENC}/drive/root:/Invoices/invoice.pdf:/content`,
    );
    expect(spy.put).toHaveBeenCalledTimes(1);
  });

  it("conny (drive:read) → save_attachment_to_drive 403 at the gate, no fetch, no upload", async () => {
    const spy = createSpyGraphClient();
    const result = await runWithIdentity({ personaKey: "conny", sub: "c" }, () =>
      gatedHandler(spy.client)({ message_id: "m", attachment_id: "a", confirm: true }),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("drive:write");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(spy.api).not.toHaveBeenCalled();
  });
});
