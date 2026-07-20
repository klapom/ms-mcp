import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config.js";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { CreateFolderParams } from "../src/schemas/drive-write.js";
import { registerDriveFolderTools } from "../src/tools/drive-folder.js";
import type { ToolResult } from "../src/types/tools.js";

const testConfig: Config = {
  limits: { maxItems: 100, maxBodyLength: 50000 },
  auth: { clientId: "test-client", tenantId: "test-tenant" },
  logging: { level: "silent" },
  cache: { tokenCachePath: "/tmp/test-cache.json" },
};

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

/** Spy Graph client whose `.api()` records calls but never hits the network. */
function createSpyGraphClient() {
  const post = vi.fn().mockResolvedValue({ id: "id-1", name: "Folder", webUrl: "https://web" });
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

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

function createTestGraphClientWithErrorMapping(): Client {
  const errorMapping = new ErrorMappingMiddleware();
  const httpHandler = new HTTPMessageHandler();
  errorMapping.setNext(httpHandler);
  return Client.initWithMiddleware({
    middleware: errorMapping,
    defaultVersion: "v1.0",
  });
}

describe("create_folder", () => {
  describe("CreateFolderParams schema", () => {
    it("should parse with name only (root)", () => {
      const result = CreateFolderParams.parse({ name: "New Folder" });
      expect(result.name).toBe("New Folder");
      expect(result.parent_id).toBeUndefined();
      expect(result.parent_path).toBeUndefined();
    });

    it("should parse with parent_id", () => {
      const result = CreateFolderParams.parse({ name: "Sub", parent_id: "folder-001" });
      expect(result.parent_id).toBe("folder-001");
    });

    it("should parse with parent_path", () => {
      const result = CreateFolderParams.parse({ name: "Sub", parent_path: "/Documents" });
      expect(result.parent_path).toBe("/Documents");
    });

    it("should reject empty name", () => {
      const result = CreateFolderParams.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });

    it("should accept confirm and idempotency_key", () => {
      const result = CreateFolderParams.parse({
        name: "Folder",
        confirm: true,
        idempotency_key: "key-1",
      });
      expect(result.confirm).toBe(true);
      expect(result.idempotency_key).toBe("key-1");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should create folder in root (201)", async () => {
      const result = (await client.api("/me/drive/root/children").post({
        name: "Test Folder",
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      })) as Record<string, unknown>;
      expect(result.id).toBeDefined();
      expect(result.name).toBe("Test Folder");
    });

    it("should create folder in parent by ID (201)", async () => {
      const result = (await client.api("/me/drive/items/folder-001/children").post({
        name: "SubFolder",
        folder: {},
      })) as Record<string, unknown>;
      expect(result.name).toBe("SubFolder");
    });

    it("should return 409 for existing folder name", async () => {
      const errorClient = createTestGraphClientWithErrorMapping();
      await expect(
        errorClient.api("/me/drive/root/children").post({
          name: "existing-folder",
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      ).rejects.toThrow();
    });
  });

  describe("path validation (parent_path)", () => {
    function getHandler(client: Client): ToolHandler {
      const { server, handlers } = createCapturingServer();
      registerDriveFolderTools(server, client, testConfig);
      const handler = handlers.get("create_folder");
      if (!handler) throw new Error("create_folder not registered");
      return handler;
    }

    it("rejects a '..' traversal parent_path before any Graph call", async () => {
      const { client, api } = createSpyGraphClient();
      const result = await getHandler(client)({
        name: "Sub",
        parent_path: "/a/../b",
        confirm: true,
      });

      expect(result.isError).toBe(true);
      expect(api).not.toHaveBeenCalled();
    });

    it("rejects a path-addressing ':' in parent_path before any Graph call", async () => {
      const { client, api } = createSpyGraphClient();
      const result = await getHandler(client)({
        name: "Sub",
        parent_path: "/a:b",
        confirm: true,
      });

      expect(result.isError).toBe(true);
      expect(api).not.toHaveBeenCalled();
    });

    it("allows a safe parent_path through to the Graph call", async () => {
      const { client, api } = createSpyGraphClient();
      const result = await getHandler(client)({
        name: "Sub",
        parent_path: "/Reports/2026",
        confirm: true,
      });

      expect(result.isError).toBeUndefined();
      expect(api).toHaveBeenCalledTimes(1);
    });
  });
});
