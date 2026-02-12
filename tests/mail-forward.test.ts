import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { resolveUserPath } from "../src/schemas/common.js";
import { ForwardEmailParams } from "../src/schemas/mail.js";
import { toRecipients } from "../src/utils/recipients.js";
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

describe("forward_email", () => {
  // -----------------------------------------------------------------------
  // Schema tests
  // -----------------------------------------------------------------------
  describe("ForwardEmailParams schema", () => {
    it("should parse with required fields only", () => {
      const result = ForwardEmailParams.parse({
        message_id: "msg-001",
        to: ["forward@example.com"],
      });
      expect(result.message_id).toBe("msg-001");
      expect(result.to).toEqual(["forward@example.com"]);
      expect(result.comment).toBeUndefined();
      expect(result.confirm).toBe(false);
    });

    it("should parse with all parameters", () => {
      const result = ForwardEmailParams.parse({
        message_id: "msg-001",
        to: ["a@example.com", "b@example.com"],
        comment: "FYI, see below.",
        confirm: true,
        idempotency_key: "fwd-key-1",
        user_id: "user@example.com",
      });
      expect(result.to).toHaveLength(2);
      expect(result.comment).toBe("FYI, see below.");
      expect(result.confirm).toBe(true);
      expect(result.idempotency_key).toBe("fwd-key-1");
      expect(result.user_id).toBe("user@example.com");
    });

    it("should reject empty message_id", () => {
      const result = ForwardEmailParams.safeParse({
        message_id: "",
        to: ["a@b.com"],
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing to", () => {
      const result = ForwardEmailParams.safeParse({ message_id: "msg-001" });
      expect(result.success).toBe(false);
    });

    it("should reject empty to array", () => {
      const result = ForwardEmailParams.safeParse({
        message_id: "msg-001",
        to: [],
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid email in to", () => {
      const result = ForwardEmailParams.safeParse({
        message_id: "msg-001",
        to: ["not-an-email"],
      });
      expect(result.success).toBe(false);
    });

    it("should reject comment over 100000 chars", () => {
      const result = ForwardEmailParams.safeParse({
        message_id: "msg-001",
        to: ["a@b.com"],
        comment: "A".repeat(100_001),
      });
      expect(result.success).toBe(false);
    });

    it("should accept missing comment (optional)", () => {
      const result = ForwardEmailParams.safeParse({
        message_id: "msg-001",
        to: ["a@b.com"],
      });
      expect(result.success).toBe(true);
    });

    it("should have WriteParams fields (idempotency_key, confirm)", () => {
      const result = ForwardEmailParams.parse({
        message_id: "msg-001",
        to: ["a@b.com"],
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

    it("should forward an email (202)", async () => {
      const response = await client.api("/me/messages/msg-001/forward").post({
        toRecipients: toRecipients(["forward@example.com"]),
      });
      expect(response).toBeNull();
    });

    it("should forward with comment", async () => {
      const response = await client.api("/me/messages/msg-001/forward").post({
        comment: "FYI",
        toRecipients: toRecipients(["forward@example.com"]),
      });
      expect(response).toBeNull();
    });

    it("should forward to multiple recipients", async () => {
      const response = await client.api("/me/messages/msg-001/forward").post({
        toRecipients: toRecipients(["a@example.com", "b@example.com"]),
      });
      expect(response).toBeNull();
    });

    it("should forward via multi-tenant path", async () => {
      const userPath = resolveUserPath("user@tenant.com");
      const response = await client.api(`${userPath}/messages/msg-001/forward`).post({
        toRecipients: toRecipients(["forward@example.com"]),
      });
      expect(response).toBeNull();
    });

    it("should fetch original message for preview context", async () => {
      const response = await client
        .api("/me/messages/msg-001")
        .select("subject,from,hasAttachments")
        .get();
      expect(response).toHaveProperty("subject");
      expect(response).toHaveProperty("from");
      expect(response).toHaveProperty("hasAttachments");
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
        await errorClient.api("/me/messages/nonexistent/forward").post({
          toRecipients: toRecipients(["forward@example.com"]),
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });

    it("should map 403 for missing Mail.Send to AuthError", async () => {
      try {
        await errorClient.api("/me/messages/forbidden-msg/forward").post({
          toRecipients: toRecipients(["forward@example.com"]),
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "AuthError");
      }
    });

    it("should map 400 for invalid recipients to ValidationError", async () => {
      try {
        await errorClient.api("/me/messages/msg-001/forward").post({
          toRecipients: toRecipients(["trigger_400@example.com"]),
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "ValidationError");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Request body capture
  // -----------------------------------------------------------------------
  describe("request body construction", () => {
    let client: Client;
    let capturedBody: Record<string, unknown> | null;

    beforeEach(() => {
      client = createTestGraphClient();
      capturedBody = null;

      mswServer.use(
        http.post(
          "https://graph.microsoft.com/v1.0/me/messages/:messageId/forward",
          async ({ request }) => {
            capturedBody = (await request.json()) as Record<string, unknown>;
            return new HttpResponse(null, { status: 202 });
          },
        ),
      );
    });

    it("should send forward with toRecipients and comment", async () => {
      await client.api("/me/messages/msg-001/forward").post({
        comment: "FYI",
        toRecipients: toRecipients(["a@example.com"]),
      });
      expect(capturedBody).toEqual({
        comment: "FYI",
        toRecipients: [{ emailAddress: { address: "a@example.com" } }],
      });
    });

    it("should send forward without comment", async () => {
      await client.api("/me/messages/msg-001/forward").post({
        toRecipients: toRecipients(["a@example.com", "b@example.com"]),
      });
      expect(capturedBody).toEqual({
        toRecipients: [
          { emailAddress: { address: "a@example.com" } },
          { emailAddress: { address: "b@example.com" } },
        ],
      });
    });
  });
});
