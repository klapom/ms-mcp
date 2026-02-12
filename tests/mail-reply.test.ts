import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { resolveUserPath } from "../src/schemas/common.js";
import { ReplyEmailParams } from "../src/schemas/mail.js";
import { server as mswServer } from "./mocks/server.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reply_email", () => {
  // -----------------------------------------------------------------------
  // Schema tests
  // -----------------------------------------------------------------------
  describe("ReplyEmailParams schema", () => {
    it("should parse with required fields only", () => {
      const result = ReplyEmailParams.parse({
        message_id: "msg-001",
        comment: "Thanks!",
      });
      expect(result.message_id).toBe("msg-001");
      expect(result.comment).toBe("Thanks!");
      expect(result.reply_all).toBe(false);
      expect(result.confirm).toBe(false);
    });

    it("should parse with all parameters", () => {
      const result = ReplyEmailParams.parse({
        message_id: "msg-001",
        comment: "Thanks everyone!",
        reply_all: true,
        confirm: true,
        idempotency_key: "reply-key-1",
        user_id: "user@example.com",
      });
      expect(result.reply_all).toBe(true);
      expect(result.confirm).toBe(true);
      expect(result.idempotency_key).toBe("reply-key-1");
      expect(result.user_id).toBe("user@example.com");
    });

    it("should reject empty message_id", () => {
      const result = ReplyEmailParams.safeParse({ message_id: "", comment: "X" });
      expect(result.success).toBe(false);
    });

    it("should reject missing message_id", () => {
      const result = ReplyEmailParams.safeParse({ comment: "X" });
      expect(result.success).toBe(false);
    });

    it("should reject empty comment", () => {
      const result = ReplyEmailParams.safeParse({
        message_id: "msg-001",
        comment: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject comment over 100000 chars", () => {
      const result = ReplyEmailParams.safeParse({
        message_id: "msg-001",
        comment: "A".repeat(100_001),
      });
      expect(result.success).toBe(false);
    });

    it("should have WriteParams fields (idempotency_key, confirm)", () => {
      const result = ReplyEmailParams.parse({
        message_id: "msg-001",
        comment: "X",
        idempotency_key: "k",
        confirm: true,
      });
      expect(result.idempotency_key).toBe("k");
      expect(result.confirm).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Graph API integration tests (MSW-backed)
  // -----------------------------------------------------------------------
  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should reply to an email (202)", async () => {
      const response = await client.api("/me/messages/msg-001/reply").post({ comment: "Thanks!" });
      expect(response).toBeNull();
    });

    it("should reply-all to an email (202)", async () => {
      const response = await client
        .api("/me/messages/msg-001/replyAll")
        .post({ comment: "Thanks everyone!" });
      expect(response).toBeNull();
    });

    it("should reply via multi-tenant path", async () => {
      const userPath = resolveUserPath("user@tenant.com");
      const response = await client
        .api(`${userPath}/messages/msg-001/reply`)
        .post({ comment: "Thanks!" });
      expect(response).toBeNull();
    });

    it("should fetch original message for preview context", async () => {
      const response = await client
        .api("/me/messages/msg-001")
        .select("subject,from,toRecipients,ccRecipients")
        .get();
      expect(response).toHaveProperty("subject");
      expect(response).toHaveProperty("from");
    });
  });

  // -----------------------------------------------------------------------
  // Error responses
  // -----------------------------------------------------------------------
  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 for nonexistent message to NotFoundError", async () => {
      try {
        await errorClient.api("/me/messages/nonexistent/reply").post({ comment: "Test" });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });

    it("should map 403 for missing Mail.Send to AuthError", async () => {
      try {
        await errorClient.api("/me/messages/forbidden-msg/reply").post({ comment: "Test" });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "AuthError");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Request body capture
  // -----------------------------------------------------------------------
  describe("request body construction", () => {
    let client: Client;
    let capturedBody: Record<string, unknown> | null;
    let capturedEndpoint: string;

    beforeEach(() => {
      client = createTestGraphClient();
      capturedBody = null;
      capturedEndpoint = "";

      mswServer.use(
        http.post(
          "https://graph.microsoft.com/v1.0/me/messages/:messageId/reply",
          async ({ request, params }) => {
            capturedBody = (await request.json()) as Record<string, unknown>;
            capturedEndpoint = `reply:${String(params.messageId)}`;
            return new HttpResponse(null, { status: 202 });
          },
        ),
        http.post(
          "https://graph.microsoft.com/v1.0/me/messages/:messageId/replyAll",
          async ({ request, params }) => {
            capturedBody = (await request.json()) as Record<string, unknown>;
            capturedEndpoint = `replyAll:${String(params.messageId)}`;
            return new HttpResponse(null, { status: 202 });
          },
        ),
      );
    });

    it("should send reply with comment", async () => {
      await client.api("/me/messages/msg-001/reply").post({ comment: "My reply" });
      expect(capturedBody).toEqual({ comment: "My reply" });
      expect(capturedEndpoint).toBe("reply:msg-001");
    });

    it("should send replyAll with comment", async () => {
      await client.api("/me/messages/msg-002/replyAll").post({ comment: "Reply all" });
      expect(capturedBody).toEqual({ comment: "Reply all" });
      expect(capturedEndpoint).toBe("replyAll:msg-002");
    });
  });
});
