import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config.js";
import { UploadFileParams } from "../src/schemas/drive-write.js";
import { registerDriveUploadTools } from "../src/tools/drive-upload.js";
import type { ToolResult } from "../src/types/tools.js";

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

/** Spy Graph client whose `.api()` records calls but never hits the network. */
function createSpyGraphClient() {
  const put = vi.fn().mockResolvedValue({ id: "id-1", name: "file.txt", webUrl: "https://web" });
  const header = vi.fn().mockReturnValue({ put });
  const api = vi.fn().mockReturnValue({ header });
  return { client: { api } as unknown as Client, api, header, put };
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

describe("upload_file", () => {
  describe("UploadFileParams schema", () => {
    it("should parse with required fields", () => {
      const result = UploadFileParams.parse({
        path: "/Documents/test.txt",
        content: Buffer.from("hello").toString("base64"),
      });
      expect(result.path).toBe("/Documents/test.txt");
      expect(result.confirm).toBe(false);
    });

    it("should reject empty path", () => {
      const result = UploadFileParams.safeParse({ path: "", content: "dGVzdA==" });
      expect(result.success).toBe(false);
    });

    it("should reject empty content", () => {
      const result = UploadFileParams.safeParse({ path: "/test.txt", content: "" });
      expect(result.success).toBe(false);
    });

    it("should accept idempotency_key", () => {
      const result = UploadFileParams.parse({
        path: "/test.txt",
        content: "dGVzdA==",
        idempotency_key: "key-123",
      });
      expect(result.idempotency_key).toBe("key-123");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should upload file via PUT (201)", async () => {
      const content = Buffer.from("hello world");
      const result = (await client
        .api("/me/drive/root:/Documents/test.txt:/content")
        .header("Content-Type", "application/octet-stream")
        .put(content)) as Record<string, unknown>;
      expect(result.id).toBeDefined();
      expect(result.name).toBeDefined();
    });
  });

  describe("path validation", () => {
    const content = Buffer.from("hello").toString("base64");

    function getHandler(client: Client): ToolHandler {
      const { server, handlers } = createCapturingServer();
      registerDriveUploadTools(server, client, testConfig);
      const handler = handlers.get("upload_file");
      if (!handler) throw new Error("upload_file not registered");
      return handler;
    }

    it("rejects a '..' traversal path before any Graph call", async () => {
      const { client, api } = createSpyGraphClient();
      const result = await getHandler(client)({ path: "/a/../b", content, confirm: true });

      expect(result.isError).toBe(true);
      expect(api).not.toHaveBeenCalled();
    });

    it("rejects a path-addressing ':' before any Graph call", async () => {
      const { client, api } = createSpyGraphClient();
      const result = await getHandler(client)({ path: "/a:b", content, confirm: true });

      expect(result.isError).toBe(true);
      expect(api).not.toHaveBeenCalled();
    });

    it("allows a safe path through to the Graph call", async () => {
      const { client, api } = createSpyGraphClient();
      const result = await getHandler(client)({
        path: "/Documents/ok.txt",
        content,
        confirm: true,
      });

      expect(result.isError).toBeUndefined();
      expect(api).toHaveBeenCalledTimes(1);
    });
  });
});
