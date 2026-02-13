import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BatchDeleteEmailsParams,
  BatchFlagEmailsParams,
  BatchMoveEmailsParams,
} from "../src/schemas/batch-operations.js";
import { executeBatch } from "../src/utils/batch.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

// ---------------------------------------------------------------------------
// batch_move_emails
// ---------------------------------------------------------------------------

describe("batch_move_emails", () => {
  describe("BatchMoveEmailsParams schema", () => {
    it("should accept valid params with message_ids array", () => {
      const result = BatchMoveEmailsParams.safeParse({
        message_ids: ["msg-1", "msg-2", "msg-3"],
        destination_folder_id: "archive",
        confirm: true,
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty message_ids array", () => {
      const result = BatchMoveEmailsParams.safeParse({
        message_ids: [],
        destination_folder_id: "archive",
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should reject more than 20 message_ids", () => {
      const ids = Array.from({ length: 21 }, (_, i) => `msg-${i}`);
      const result = BatchMoveEmailsParams.safeParse({
        message_ids: ids,
        destination_folder_id: "archive",
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should require destination_folder_id", () => {
      const result = BatchMoveEmailsParams.safeParse({
        message_ids: ["msg-1"],
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty destination_folder_id", () => {
      const result = BatchMoveEmailsParams.safeParse({
        message_ids: ["msg-1"],
        destination_folder_id: "",
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should default confirm to false", () => {
      const result = BatchMoveEmailsParams.parse({
        message_ids: ["msg-1"],
        destination_folder_id: "archive",
      });
      expect(result.confirm).toBe(false);
    });

    it("should accept WriteParams fields", () => {
      const result = BatchMoveEmailsParams.parse({
        message_ids: ["msg-1"],
        destination_folder_id: "archive",
        idempotency_key: "key-1",
        user_id: "user@example.com",
        confirm: true,
      });
      expect(result.idempotency_key).toBe("key-1");
      expect(result.user_id).toBe("user@example.com");
    });

    it("should reject empty string in message_ids", () => {
      const result = BatchMoveEmailsParams.safeParse({
        message_ids: ["msg-1", ""],
        destination_folder_id: "archive",
        confirm: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should move 5 emails successfully via $batch", async () => {
      const ids = ["msg-1", "msg-2", "msg-3", "msg-4", "msg-5"];
      const requests = ids.map((id, i) => ({
        id: String(i + 1),
        method: "PATCH" as const,
        url: `/me/messages/${id}`,
        headers: { "Content-Type": "application/json" },
        body: { parentFolderId: "archive" },
      }));

      const result = await executeBatch(client, requests);
      expect(result.responses).toHaveLength(5);
      for (const r of result.responses) {
        expect(r.status).toBe(200);
      }
    });

    it("should handle partial success (some not found)", async () => {
      const requests = [
        {
          id: "1",
          method: "PATCH" as const,
          url: "/me/messages/msg-1",
          headers: { "Content-Type": "application/json" },
          body: { parentFolderId: "archive" },
        },
        {
          id: "2",
          method: "PATCH" as const,
          url: "/me/messages/not-found-msg",
          headers: { "Content-Type": "application/json" },
          body: { parentFolderId: "archive" },
        },
      ];

      const result = await executeBatch(client, requests);
      const success = result.responses.find((r) => r.id === "1");
      const failure = result.responses.find((r) => r.id === "2");
      expect(success?.status).toBe(200);
      expect(failure?.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// batch_delete_emails
// ---------------------------------------------------------------------------

describe("batch_delete_emails", () => {
  describe("BatchDeleteEmailsParams schema", () => {
    it("should accept valid params", () => {
      const result = BatchDeleteEmailsParams.safeParse({
        message_ids: ["msg-1", "msg-2"],
        confirm: true,
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty message_ids", () => {
      const result = BatchDeleteEmailsParams.safeParse({
        message_ids: [],
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should default confirm to false", () => {
      const result = BatchDeleteEmailsParams.parse({
        message_ids: ["msg-1"],
      });
      expect(result.confirm).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should delete emails successfully (204 responses)", async () => {
      const requests = ["msg-1", "msg-2", "msg-3"].map((id, i) => ({
        id: String(i + 1),
        method: "DELETE" as const,
        url: `/me/messages/${id}`,
      }));

      const result = await executeBatch(client, requests);
      for (const r of result.responses) {
        expect(r.status).toBe(204);
      }
    });

    it("should handle partial success on delete", async () => {
      const requests = [
        { id: "1", method: "DELETE" as const, url: "/me/messages/msg-1" },
        { id: "2", method: "DELETE" as const, url: "/me/messages/not-found-msg" },
      ];

      const result = await executeBatch(client, requests);
      expect(result.responses.find((r) => r.id === "1")?.status).toBe(204);
      expect(result.responses.find((r) => r.id === "2")?.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// batch_flag_emails
// ---------------------------------------------------------------------------

describe("batch_flag_emails", () => {
  describe("BatchFlagEmailsParams schema", () => {
    it("should accept valid params with flag_status", () => {
      const result = BatchFlagEmailsParams.safeParse({
        message_ids: ["msg-1", "msg-2"],
        flag_status: "flagged",
        confirm: true,
      });
      expect(result.success).toBe(true);
    });

    it("should require flag_status", () => {
      const result = BatchFlagEmailsParams.safeParse({
        message_ids: ["msg-1"],
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid flag_status", () => {
      const result = BatchFlagEmailsParams.safeParse({
        message_ids: ["msg-1"],
        flag_status: "invalid",
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should accept optional due_date", () => {
      const result = BatchFlagEmailsParams.safeParse({
        message_ids: ["msg-1"],
        flag_status: "flagged",
        due_date: "2026-03-01T12:00:00",
        confirm: true,
      });
      expect(result.success).toBe(true);
    });

    it("should accept all flag_status values", () => {
      for (const status of ["flagged", "complete", "notFlagged"]) {
        const result = BatchFlagEmailsParams.safeParse({
          message_ids: ["msg-1"],
          flag_status: status,
          confirm: true,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should flag emails successfully via $batch PATCH", async () => {
      const requests = ["msg-1", "msg-2"].map((id, i) => ({
        id: String(i + 1),
        method: "PATCH" as const,
        url: `/me/messages/${id}`,
        headers: { "Content-Type": "application/json" },
        body: { flag: { flagStatus: "flagged" } },
      }));

      const result = await executeBatch(client, requests);
      for (const r of result.responses) {
        expect(r.status).toBe(200);
      }
    });

    it("should handle partial failure when flagging", async () => {
      const requests = [
        {
          id: "1",
          method: "PATCH" as const,
          url: "/me/messages/msg-1",
          headers: { "Content-Type": "application/json" },
          body: { flag: { flagStatus: "flagged" } },
        },
        {
          id: "2",
          method: "PATCH" as const,
          url: "/me/messages/not-found-msg",
          headers: { "Content-Type": "application/json" },
          body: { flag: { flagStatus: "flagged" } },
        },
      ];

      const result = await executeBatch(client, requests);
      expect(result.responses.find((r) => r.id === "1")?.status).toBe(200);
      expect(result.responses.find((r) => r.id === "2")?.status).toBe(404);
    });
  });
});
