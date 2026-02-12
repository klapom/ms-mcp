import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { UploadFileParams } from "../src/schemas/drive-write.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
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
});
