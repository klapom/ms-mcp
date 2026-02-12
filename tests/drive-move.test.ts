import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { MoveFileParams } from "../src/schemas/drive-write.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("move_file", () => {
  describe("MoveFileParams schema", () => {
    it("should parse with required fields", () => {
      const result = MoveFileParams.parse({
        file_id: "file-001",
        destination_folder_id: "folder-002",
      });
      expect(result.file_id).toBe("file-001");
      expect(result.destination_folder_id).toBe("folder-002");
      expect(result.confirm).toBe(false);
    });

    it("should accept new_name", () => {
      const result = MoveFileParams.parse({
        file_id: "file-001",
        destination_folder_id: "folder-002",
        new_name: "renamed.pdf",
      });
      expect(result.new_name).toBe("renamed.pdf");
    });

    it("should reject empty file_id", () => {
      const result = MoveFileParams.safeParse({
        file_id: "",
        destination_folder_id: "folder-002",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty destination_folder_id", () => {
      const result = MoveFileParams.safeParse({
        file_id: "file-001",
        destination_folder_id: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should move file via PATCH (200)", async () => {
      const result = (await client.api("/me/drive/items/file-001").patch({
        parentReference: { id: "folder-002" },
      })) as Record<string, unknown>;
      expect(result.id).toBe("file-001");
    });

    it("should move and rename file", async () => {
      const result = (await client.api("/me/drive/items/file-001").patch({
        parentReference: { id: "folder-002" },
        name: "renamed.pdf",
      })) as Record<string, unknown>;
      expect(result.name).toBe("renamed.pdf");
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
