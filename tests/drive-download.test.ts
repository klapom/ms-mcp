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

  describe("format=pdf (server-side conversion)", () => {
    function pdfClient(name: string, pdfBytes: Buffer) {
      const meta = {
        id: "id-doc",
        name,
        size: 2048,
        webUrl: "https://example/doc",
        file: {
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      };
      const get = vi.fn().mockResolvedValue(meta);
      const select = vi.fn().mockReturnValue({ get });
      async function* stream() {
        yield pdfBytes;
      }
      const getStream = vi.fn().mockResolvedValue(stream());
      const query = vi.fn();
      const api = vi.fn().mockReturnValue({ select, get, getStream, query });
      return { client: { api } as unknown as Client, api, query };
    }

    function handlerFor(client: Client): ToolHandler {
      const { server, handlers } = createCapturingServer();
      registerDriveDownloadTools(server, client, testConfig);
      const handler = handlers.get("download_file");
      if (!handler) throw new Error("download_file not registered");
      return handler;
    }

    it("accepts format 'pdf' and rejects other formats", () => {
      expect(DownloadFileParams.parse({ file_id: "x", format: "pdf" }).format).toBe("pdf");
      expect(DownloadFileParams.safeParse({ file_id: "x", format: "docx" }).success).toBe(false);
    });

    it("requests ?format=pdf and returns the PDF as base64 with PDF metadata", async () => {
      const pdf = Buffer.from("%PDF-1.7 test");
      const { client, api, query } = pdfClient("RE-2610002.docx", pdf);
      const result = await handlerFor(client)({ file_id: "id-doc", format: "pdf" });

      expect(result.isError).toBeUndefined();
      expect(api).toHaveBeenLastCalledWith("/me/drive/items/id-doc/content");
      expect(query).toHaveBeenCalledWith({ format: "pdf" });
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Name: RE-2610002.pdf");
      expect(text).toContain("MIME type: application/pdf");
      expect(text).toContain(pdf.toString("base64"));
    });

    it("keeps the path addressing for path-style file_id", async () => {
      const { client, api, query } = pdfClient("Muster.docx", Buffer.from("%PDF"));
      await handlerFor(client)({ file_id: "/Rechnungen/Muster.docx", format: "pdf" });

      expect(api).toHaveBeenLastCalledWith("/me/drive/root:/Rechnungen/Muster.docx:/content");
      expect(query).toHaveBeenCalledWith({ format: "pdf" });
    });

    it("does not add a query without format", async () => {
      const { client, query } = pdfClient("a.docx", Buffer.from("PK"));
      const result = await handlerFor(client)({ file_id: "id-doc" });

      expect(query).not.toHaveBeenCalled();
      expect((result.content[0] as { text: string }).text).toContain("Name: a.docx");
    });

    it("rejects a converted PDF above 10 MB", async () => {
      const { client } = pdfClient("big.pptx", Buffer.alloc(10 * 1024 * 1024 + 1));
      const result = await handlerFor(client)({ file_id: "id-doc", format: "pdf" });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain("Converted PDF too large");
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
