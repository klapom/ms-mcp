import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { GetFileMetadataParams } from "../src/schemas/files.js";

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

describe("get_file_metadata", () => {
  describe("GetFileMetadataParams schema", () => {
    it("should parse with file_id", () => {
      const result = GetFileMetadataParams.parse({ file_id: "file-001" });
      expect(result.file_id).toBe("file-001");
    });

    it("should reject empty file_id", () => {
      const result = GetFileMetadataParams.safeParse({ file_id: "" });
      expect(result.success).toBe(false);
    });

    it("should accept user_id", () => {
      const result = GetFileMetadataParams.parse({
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

    it("should get file metadata", async () => {
      const item = (await client.api("/me/drive/items/file-001").get()) as Record<string, unknown>;
      expect(item.name).toBe("report.pdf");
      expect(item.parentReference).toBeDefined();
      expect(item.lastModifiedBy).toBeDefined();
    });

    it("should get folder metadata", async () => {
      const item = (await client.api("/me/drive/items/folder-001").get()) as Record<
        string,
        unknown
      >;
      expect(item.folder).toBeDefined();
    });

    it("should get shared item metadata", async () => {
      const item = (await client.api("/me/drive/items/file-shared").get()) as Record<
        string,
        unknown
      >;
      expect(item.shared).toBeDefined();
    });

    it("should return 404 for nonexistent item", async () => {
      const errorClient = createTestGraphClientWithErrorMapping();
      await expect(errorClient.api("/me/drive/items/nonexistent").get()).rejects.toThrow();
    });
  });
});
