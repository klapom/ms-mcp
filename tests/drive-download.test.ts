import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config.js";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { DownloadFileParams } from "../src/schemas/files.js";
import { buildDriveItemUrl, registerDriveDownloadTools } from "../src/tools/drive-download.js";
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
  const meta = { id: "id-1", name: "file.txt", size: 10, file: { mimeType: "text/plain" } };
  const get = vi.fn().mockResolvedValue(meta);
  const select = vi.fn().mockReturnValue({ get });
  async function* contentStream() {
    yield Buffer.from("hi");
  }
  const getStream = vi.fn().mockResolvedValue(contentStream());
  const api = vi.fn().mockReturnValue({ select, get, getStream });
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

describe("download_file", () => {
  describe("DownloadFileParams schema", () => {
    it("should parse with file_id", () => {
      const result = DownloadFileParams.parse({ file_id: "file-001" });
      expect(result.file_id).toBe("file-001");
    });

    it("should reject empty file_id", () => {
      const result = DownloadFileParams.safeParse({ file_id: "" });
      expect(result.success).toBe(false);
    });

    it("should accept user_id", () => {
      const result = DownloadFileParams.parse({
        file_id: "file-001",
        user_id: "admin@tenant.com",
      });
      expect(result.user_id).toBe("admin@tenant.com");
    });
  });

  describe("buildDriveItemUrl", () => {
    const drive = "/me/drive";

    it("addresses IDs via /items/<id>", () => {
      expect(buildDriveItemUrl(drive, "01ABC")).toBe("/me/drive/items/01ABC");
    });

    it("URL-encodes unsafe chars in IDs", () => {
      expect(buildDriveItemUrl(drive, "a+b/c=d")).toBe("/me/drive/items/a%2Bb%2Fc%3Dd");
    });

    it("addresses leading-slash values via /root:<path>", () => {
      expect(buildDriveItemUrl(drive, "/Brand/logo.svg")).toBe("/me/drive/root:/Brand/logo.svg");
    });

    it("strips trailing slashes on paths", () => {
      expect(buildDriveItemUrl(drive, "/Brand/")).toBe("/me/drive/root:/Brand");
    });
  });

  describe("path validation (path-style file_id)", () => {
    function getHandler(client: Client): ToolHandler {
      const { server, handlers } = createCapturingServer();
      registerDriveDownloadTools(server, client, testConfig);
      const handler = handlers.get("download_file");
      if (!handler) throw new Error("download_file not registered");
      return handler;
    }

    it("rejects a '..' traversal path before any Graph call", async () => {
      const { client, api } = createSpyGraphClient();
      const result = await getHandler(client)({ file_id: "/a/../b" });

      expect(result.isError).toBe(true);
      expect(api).not.toHaveBeenCalled();
    });

    it("rejects a percent-encoded traversal path before any Graph call", async () => {
      const { client, api } = createSpyGraphClient();
      const result = await getHandler(client)({ file_id: "/a/..%2Fb" });

      expect(result.isError).toBe(true);
      expect(api).not.toHaveBeenCalled();
    });

    it("allows a safe path through to the Graph call", async () => {
      const { client, api } = createSpyGraphClient();
      const result = await getHandler(client)({ file_id: "/Brand/logo.svg" });

      expect(result.isError).toBeUndefined();
      expect(api).toHaveBeenCalled();
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should get file metadata (step 1)", async () => {
      const meta = (await client
        .api("/me/drive/items/file-001")
        .select("id,name,size,webUrl,file,folder")
        .get()) as Record<string, unknown>;
      expect(meta.name).toBe("report.pdf");
      expect(meta.size).toBe(1048576);
    });

    it("should get text file metadata", async () => {
      const meta = (await client.api("/me/drive/items/file-002").get()) as Record<string, unknown>;
      expect(meta.name).toBe("notes.txt");
    });

    it("should download file content (step 2)", async () => {
      const response = await client.api("/me/drive/items/file-002/content").get();
      expect(response).toBeDefined();
    });

    it("should detect large file for size abort", async () => {
      const meta = (await client.api("/me/drive/items/file-large").get()) as Record<
        string,
        unknown
      >;
      expect(meta.size).toBe(15 * 1024 * 1024);
    });

    it("should detect folder for rejection", async () => {
      const meta = (await client.api("/me/drive/items/folder-001").get()) as Record<
        string,
        unknown
      >;
      expect(meta.folder).toBeDefined();
    });

    it("should return 404 for nonexistent file", async () => {
      const errorClient = createTestGraphClientWithErrorMapping();
      await expect(errorClient.api("/me/drive/items/nonexistent").get()).rejects.toThrow();
    });
  });
});
