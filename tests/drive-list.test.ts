import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { GetRecentFilesParams, ListFilesParams } from "../src/schemas/files.js";

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
