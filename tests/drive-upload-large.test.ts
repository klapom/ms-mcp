import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config.js";
import { UploadLargeFileParams } from "../src/schemas/file-upload.js";
import { registerDriveUploadLargeTools } from "../src/tools/drive-upload-large.js";
import type { ToolResult } from "../src/types/tools.js";

// Shared log spies so we can assert on what is emitted at each level. The
// factory returns the SAME object for every createLogger() call, funnelling
// all module loggers into one set of spies.
const logSpies = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../src/utils/logger.js", () => ({
  createLogger: () => logSpies,
  logger: logSpies,
}));

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

const testConfig: Config = {
  limits: { maxItems: 100, maxBodyLength: 50000 },
  auth: { clientId: "test-client", tenantId: "test-tenant" },
  logging: { level: "silent" },
  cache: { tokenCachePath: "/tmp/test-cache.json" },
};

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

/** Spy Graph client whose `.api().post()` records calls but never hits the network. */
function createSpyGraphClient(sessionUploadUrl: string) {
  const post = vi.fn().mockResolvedValue({
    uploadUrl: sessionUploadUrl,
    expirationDateTime: "2026-07-20T00:00:00Z",
  });
  const api = vi.fn().mockReturnValue({ post });
  return { client: { api } as unknown as Client, api, post };
}

/** Minimal MCP server that captures registered tool handlers by name. */
function createCapturingServer() {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _shape: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  return { server, handlers };
}

function getLargeUploadHandler(client: Client): ToolHandler {
  const { server, handlers } = createCapturingServer();
  registerDriveUploadLargeTools(server, client, testConfig);
  const handler = handlers.get("upload_large_file");
  if (!handler) throw new Error("upload_large_file not registered");
  return handler;
}

describe("upload_large_file", () => {
  describe("UploadLargeFileParams schema", () => {
    it("should parse with required fields", () => {
      const content = Buffer.from("test").toString("base64");
      const result = UploadLargeFileParams.parse({
        file_name: "test.pdf",
        content_bytes: content,
      });
      expect(result.file_name).toBe("test.pdf");
      expect(result.content_bytes).toBe(content);
      expect(result.confirm).toBe(false);
      expect(result.conflict_behavior).toBe("fail");
    });

    it("should accept conflict_behavior values", () => {
      const content = Buffer.from("test").toString("base64");
      const result = UploadLargeFileParams.parse({
        file_name: "test.pdf",
        content_bytes: content,
        conflict_behavior: "replace",
      });
      expect(result.conflict_behavior).toBe("replace");
    });

    it("should accept folder_id", () => {
      const content = Buffer.from("test").toString("base64");
      const result = UploadLargeFileParams.parse({
        file_name: "test.pdf",
        content_bytes: content,
        folder_id: "folder-123",
      });
      expect(result.folder_id).toBe("folder-123");
    });

    it("should reject empty file_name", () => {
      const content = Buffer.from("test").toString("base64");
      const result = UploadLargeFileParams.safeParse({
        file_name: "",
        content_bytes: content,
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty content_bytes", () => {
      const result = UploadLargeFileParams.safeParse({
        file_name: "test.pdf",
        content_bytes: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject file_name longer than 255 characters", () => {
      const content = Buffer.from("test").toString("base64");
      const longName = `${"x".repeat(300)}.pdf`;
      const result = UploadLargeFileParams.safeParse({
        file_name: longName,
        content_bytes: content,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should create upload session", async () => {
      const result = (await client.api("/me/drive/root:/video.mp4:/createUploadSession").post({
        item: { "@microsoft.graph.conflictBehavior": "fail" },
      })) as Record<string, unknown>;

      expect(result.uploadUrl).toBeDefined();
      expect(result.expirationDateTime).toBeDefined();
    });

    it("should create upload session with replace behavior", async () => {
      const result = (await client.api("/me/drive/root:/document.pdf:/createUploadSession").post({
        item: { "@microsoft.graph.conflictBehavior": "replace" },
      })) as Record<string, unknown>;

      expect(result.uploadUrl).toBeDefined();
    });

    it("should create upload session in specific folder", async () => {
      const result = (await client
        .api("/me/drive/items/folder-abc:/document.pdf:/createUploadSession")
        .post({
          item: { "@microsoft.graph.conflictBehavior": "fail" },
        })) as Record<string, unknown>;

      expect(result.uploadUrl).toBeDefined();
    });
  });

  describe("file name validation", () => {
    const content = Buffer.from("hello").toString("base64");

    it("rejects a ':' in file_name before any upload session is created", async () => {
      const { client, api } = createSpyGraphClient("https://upload.example/session");
      const result = await getLargeUploadHandler(client)({
        file_name: "x:y",
        content_bytes: content,
        confirm: true,
      });

      expect(result.isError).toBe(true);
      expect(api).not.toHaveBeenCalled();
    });
  });

  describe("upload session URL logging", () => {
    const preAuthUrl = "https://upload.example/session?token=PREAUTH-SECRET";

    beforeEach(() => {
      logSpies.info.mockClear();
      logSpies.warn.mockClear();
      logSpies.error.mockClear();
      logSpies.debug.mockClear();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("never logs the pre-authenticated uploadUrl at info level", async () => {
      const { client } = createSpyGraphClient(preAuthUrl);

      // Mock the chunk PUT so uploadAllChunks completes on the first chunk.
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id: "file-1",
          name: "big.bin",
          size: 5,
          webUrl: "https://web/big.bin",
        }),
      } as unknown as Response);
      vi.stubGlobal("fetch", fetchMock);

      const result = await getLargeUploadHandler(client)({
        file_name: "big.bin",
        content_bytes: Buffer.from("hello").toString("base64"),
        confirm: true,
      });

      expect(result.isError).toBeUndefined();
      expect(fetchMock).toHaveBeenCalled();

      const loggedAtInfoOrAbove = [
        ...logSpies.info.mock.calls,
        ...logSpies.warn.mock.calls,
        ...logSpies.error.mock.calls,
      ];
      expect(loggedAtInfoOrAbove.length).toBeGreaterThan(0);
      for (const call of loggedAtInfoOrAbove) {
        expect(JSON.stringify(call)).not.toContain(preAuthUrl);
      }
    });
  });
});
