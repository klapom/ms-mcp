import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { DownloadFileParams } from "../src/schemas/files.js";

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
