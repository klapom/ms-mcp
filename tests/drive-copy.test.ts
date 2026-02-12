import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { CopyFileParams } from "../src/schemas/drive-write.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("copy_file", () => {
  describe("CopyFileParams schema", () => {
    it("should parse with required fields", () => {
      const result = CopyFileParams.parse({
        file_id: "file-001",
        destination_folder_id: "folder-002",
      });
      expect(result.file_id).toBe("file-001");
      expect(result.destination_folder_id).toBe("folder-002");
      expect(result.confirm).toBe(false);
    });

    it("should accept new_name", () => {
      const result = CopyFileParams.parse({
        file_id: "file-001",
        destination_folder_id: "folder-002",
        new_name: "copy-of-report.pdf",
      });
      expect(result.new_name).toBe("copy-of-report.pdf");
    });

    it("should reject empty file_id", () => {
      const result = CopyFileParams.safeParse({
        file_id: "",
        destination_folder_id: "folder-002",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should copy file (202 async)", async () => {
      const result = await client.api("/me/drive/items/file-001/copy").post({
        parentReference: { id: "folder-002" },
      });
      // 202 returns null body
      expect(result).toBeNull();
    });

    it("should copy with new name", async () => {
      const result = await client.api("/me/drive/items/file-001/copy").post({
        parentReference: { id: "folder-002" },
        name: "copy-report.pdf",
      });
      expect(result).toBeNull();
    });

    it("should get item metadata for preview", async () => {
      const item = (await client.api("/me/drive/items/file-001").select("id,name").get()) as Record<
        string,
        unknown
      >;
      expect(item.name).toBeDefined();
    });
  });
});
