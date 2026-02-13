import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { UploadLargeFileParams } from "../src/schemas/file-upload.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
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
});
