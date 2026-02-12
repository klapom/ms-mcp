import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { CreateFolderParams } from "../src/schemas/drive-write.js";

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
});
