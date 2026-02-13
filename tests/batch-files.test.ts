import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { BatchMoveFilesParams } from "../src/schemas/batch-operations.js";
import { executeBatch, summarizeBatchResult } from "../src/utils/batch.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("batch_move_files", () => {
  describe("BatchMoveFilesParams schema", () => {
    it("should accept valid params with file_ids array", () => {
      const result = BatchMoveFilesParams.safeParse({
        file_ids: ["file-1", "file-2"],
        destination_folder_id: "folder-dest",
        confirm: true,
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty file_ids", () => {
      const result = BatchMoveFilesParams.safeParse({
        file_ids: [],
        destination_folder_id: "folder-dest",
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should reject more than 20 file_ids", () => {
      const ids = Array.from({ length: 21 }, (_, i) => `file-${i}`);
      const result = BatchMoveFilesParams.safeParse({
        file_ids: ids,
        destination_folder_id: "folder-dest",
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should require destination_folder_id", () => {
      const result = BatchMoveFilesParams.safeParse({
        file_ids: ["file-1"],
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty destination_folder_id", () => {
      const result = BatchMoveFilesParams.safeParse({
        file_ids: ["file-1"],
        destination_folder_id: "",
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should default confirm to false", () => {
      const result = BatchMoveFilesParams.parse({
        file_ids: ["file-1"],
        destination_folder_id: "folder-dest",
      });
      expect(result.confirm).toBe(false);
    });

    it("should accept WriteParams fields", () => {
      const result = BatchMoveFilesParams.parse({
        file_ids: ["file-1"],
        destination_folder_id: "folder-dest",
        idempotency_key: "key-1",
        user_id: "user@example.com",
        confirm: true,
      });
      expect(result.idempotency_key).toBe("key-1");
      expect(result.user_id).toBe("user@example.com");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should move files successfully via $batch PATCH", async () => {
      const requests = ["file-1", "file-2", "file-3"].map((id, i) => ({
        id: String(i + 1),
        method: "PATCH" as const,
        url: `/me/drive/items/${id}`,
        headers: { "Content-Type": "application/json" },
        body: { parentReference: { id: "folder-dest" } },
      }));

      const result = await executeBatch(client, requests);
      expect(result.responses).toHaveLength(3);
      for (const r of result.responses) {
        expect(r.status).toBe(200);
      }
    });

    it("should handle partial success (some files not found)", async () => {
      const requests = [
        {
          id: "1",
          method: "PATCH" as const,
          url: "/me/drive/items/file-1",
          headers: { "Content-Type": "application/json" },
          body: { parentReference: { id: "folder-dest" } },
        },
        {
          id: "2",
          method: "PATCH" as const,
          url: "/me/drive/items/not-found-file",
          headers: { "Content-Type": "application/json" },
          body: { parentReference: { id: "folder-dest" } },
        },
      ];

      const result = await executeBatch(client, requests);
      const summary = summarizeBatchResult(result);
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(1);
    });

    it("should handle conflict errors", async () => {
      const requests = [
        {
          id: "1",
          method: "PATCH" as const,
          url: "/me/drive/items/conflict-file",
          headers: { "Content-Type": "application/json" },
          body: { parentReference: { id: "folder-dest" } },
        },
      ];

      const result = await executeBatch(client, requests);
      expect(result.responses[0].status).toBe(409);
    });

    it("should handle permission denied errors", async () => {
      const requests = [
        {
          id: "1",
          method: "PATCH" as const,
          url: "/me/drive/items/forbidden-file",
          headers: { "Content-Type": "application/json" },
          body: { parentReference: { id: "folder-dest" } },
        },
      ];

      const result = await executeBatch(client, requests);
      expect(result.responses[0].status).toBe(403);
    });
  });
});
