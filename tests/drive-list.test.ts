import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config.js";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { GetRecentFilesParams, ListFilesParams } from "../src/schemas/files.js";
import { registerDriveListTools, resolveDriveListUrl } from "../src/tools/drive-list.js";
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
  const api = vi.fn();
  return { client: { api } as unknown as Client, api };
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

describe("list_files", () => {
  describe("ListFilesParams schema", () => {
    it("should parse with no params (root)", () => {
      const result = ListFilesParams.parse({});
      expect(result.folder_id).toBeUndefined();
      expect(result.path).toBeUndefined();
    });

    it("should parse with folder_id", () => {
      const result = ListFilesParams.parse({ folder_id: "folder-001" });
      expect(result.folder_id).toBe("folder-001");
    });

    it("should parse with path", () => {
      const result = ListFilesParams.parse({ path: "/Documents/Reports" });
      expect(result.path).toBe("/Documents/Reports");
    });

    it("should parse with pagination", () => {
      const result = ListFilesParams.parse({ top: 10, skip: 5 });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });

    it("should reject top > 100", () => {
      const result = ListFilesParams.safeParse({ top: 101 });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should list root children", async () => {
      const response = (await client.api("/me/drive/root/children").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0]).toHaveProperty("name");
    });

    it("should list folder children by ID", async () => {
      const response = (await client.api("/me/drive/items/folder-001/children").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it("should return 404 for nonexistent folder", async () => {
      const errorClient = createTestGraphClientWithErrorMapping();
      await expect(
        errorClient.api("/me/drive/items/nonexistent-folder/children").get(),
      ).rejects.toThrow();
    });

    it("should list recent files", async () => {
      const response = (await client.api("/me/drive/recent").get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it("should work for multi-tenant (list)", async () => {
      const response = (await client
        .api("/users/admin@tenant.com/drive/root/children")
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(1);
      expect(items[0]?.name).toBe("mt-report.pdf");
    });

    it("should work for multi-tenant (recent)", async () => {
      const response = (await client.api("/users/admin@tenant.com/drive/recent").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(1);
    });
  });

  describe("resolveDriveListUrl", () => {
    const drive = "/me/drive";

    it("returns root/children when path is omitted", () => {
      const parsed = ListFilesParams.parse({});
      expect(resolveDriveListUrl(drive, parsed)).toBe("/me/drive/root/children");
    });

    it("returns root/children when path is '/'", () => {
      const parsed = ListFilesParams.parse({ path: "/" });
      expect(resolveDriveListUrl(drive, parsed)).toBe("/me/drive/root/children");
    });

    it("returns root/children when path is empty string (via schema bypass)", () => {
      // Empty string is falsy; schema keeps it, builder falls back to root.
      const parsed = { path: "" } as unknown as ReturnType<typeof ListFilesParams.parse>;
      expect(resolveDriveListUrl(drive, parsed)).toBe("/me/drive/root/children");
    });

    it("builds /root:/<path>:/children with leading slash", () => {
      const parsed = ListFilesParams.parse({ path: "/Reports" });
      expect(resolveDriveListUrl(drive, parsed)).toBe("/me/drive/root:/Reports:/children");
    });

    it("builds /root:/<path>:/children without leading slash", () => {
      const parsed = ListFilesParams.parse({ path: "Reports/Q1" });
      expect(resolveDriveListUrl(drive, parsed)).toBe("/me/drive/root:/Reports/Q1:/children");
    });

    it("strips trailing slashes from path", () => {
      const parsed = ListFilesParams.parse({ path: "/Brand/Logos/" });
      expect(resolveDriveListUrl(drive, parsed)).toBe("/me/drive/root:/Brand/Logos:/children");
    });

    it("uses /items/<id>/children when folder_id is given", () => {
      const parsed = ListFilesParams.parse({ folder_id: "01ABC" });
      expect(resolveDriveListUrl(drive, parsed)).toBe("/me/drive/items/01ABC/children");
    });
  });

  describe("path validation (path)", () => {
    // Safe-path URL building is already covered by the resolveDriveListUrl block
    // above; these assert the traversal/injection guard now rejects unsafe paths
    // at the handler before any Graph call (folded in via normalizeDrivePath).
    function getHandler(client: Client): ToolHandler {
      const { server, handlers } = createCapturingServer();
      registerDriveListTools(server, client, testConfig);
      const handler = handlers.get("list_files");
      if (!handler) throw new Error("list_files not registered");
      return handler;
    }

    it("rejects a '..' traversal path before any Graph call", async () => {
      const { client, api } = createSpyGraphClient();
      const result = await getHandler(client)({ path: "/a/../b" });

      expect(result.isError).toBe(true);
      expect(api).not.toHaveBeenCalled();
    });

    it("rejects a path-addressing ':' before any Graph call", async () => {
      const { client, api } = createSpyGraphClient();
      const result = await getHandler(client)({ path: "/a:b" });

      expect(result.isError).toBe(true);
      expect(api).not.toHaveBeenCalled();
    });
  });

  describe("GetRecentFilesParams schema", () => {
    it("should parse with no params", () => {
      const result = GetRecentFilesParams.parse({});
      expect(result.top).toBeUndefined();
    });

    it("should parse with pagination", () => {
      const result = GetRecentFilesParams.parse({ top: 50, skip: 10 });
      expect(result.top).toBe(50);
      expect(result.skip).toBe(10);
    });
  });
});
