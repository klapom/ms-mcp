import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { resolveUserPath } from "../src/schemas/common.js";
import { SendEmailParams } from "../src/schemas/mail.js";
import { idempotencyCache } from "../src/utils/idempotency.js";
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

describe("send_email", () => {
  // -----------------------------------------------------------------------
  // Schema tests
  // -----------------------------------------------------------------------
  describe("SendEmailParams schema", () => {
    it("should parse with required fields only", () => {
      const result = SendEmailParams.parse({
        to: ["test@example.com"],
        subject: "Test",
        body: "Hello",
      });
      expect(result.to).toEqual(["test@example.com"]);
      expect(result.subject).toBe("Test");
      expect(result.body).toBe("Hello");
      expect(result.confirm).toBe(false);
      expect(result.body_type).toBe("text");
      expect(result.importance).toBe("normal");
      expect(result.save_to_sent_items).toBe(true);
    });

    it("should parse with all parameters", () => {
      const result = SendEmailParams.parse({
        to: ["to@example.com"],
        cc: ["cc@example.com"],
        bcc: ["bcc@example.com"],
        subject: "Full params",
        body: "<p>Hello</p>",
        body_type: "html",
        importance: "high",
        save_to_sent_items: false,
        confirm: true,
        idempotency_key: "key-123",
        user_id: "user@example.com",
      });
      expect(result.cc).toEqual(["cc@example.com"]);
      expect(result.bcc).toEqual(["bcc@example.com"]);
      expect(result.body_type).toBe("html");
      expect(result.importance).toBe("high");
      expect(result.save_to_sent_items).toBe(false);
      expect(result.confirm).toBe(true);
      expect(result.idempotency_key).toBe("key-123");
      expect(result.user_id).toBe("user@example.com");
    });

    it("should reject empty to array", () => {
      const result = SendEmailParams.safeParse({ to: [], subject: "X", body: "Y" });
      expect(result.success).toBe(false);
    });

    it("should reject missing to", () => {
      const result = SendEmailParams.safeParse({ subject: "X", body: "Y" });
      expect(result.success).toBe(false);
    });

    it("should reject empty subject", () => {
      const result = SendEmailParams.safeParse({
        to: ["a@b.com"],
        subject: "",
        body: "Y",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty body", () => {
      const result = SendEmailParams.safeParse({
        to: ["a@b.com"],
        subject: "X",
        body: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject body over 100000 chars", () => {
      const result = SendEmailParams.safeParse({
        to: ["a@b.com"],
        subject: "X",
        body: "A".repeat(100_001),
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid email in to", () => {
      const result = SendEmailParams.safeParse({
        to: ["not-an-email"],
        subject: "X",
        body: "Y",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid email in cc", () => {
      const result = SendEmailParams.safeParse({
        to: ["a@b.com"],
        cc: ["bad"],
        subject: "X",
        body: "Y",
      });
      expect(result.success).toBe(false);
    });

    it("should have WriteParams fields (idempotency_key, confirm)", () => {
      const result = SendEmailParams.parse({
        to: ["a@b.com"],
        subject: "X",
        body: "Y",
        idempotency_key: "k",
        confirm: true,
      });
      expect(result.idempotency_key).toBe("k");
      expect(result.confirm).toBe(true);
    });

    it("should accept subject at max length (255)", () => {
      const result = SendEmailParams.safeParse({
        to: ["a@b.com"],
        subject: "A".repeat(255),
        body: "Y",
      });
      expect(result.success).toBe(true);
    });

    it("should reject subject over 255 chars", () => {
      const result = SendEmailParams.safeParse({
        to: ["a@b.com"],
        subject: "A".repeat(256),
        body: "Y",
      });
      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // toRecipients utility
  // -----------------------------------------------------------------------
  describe("toRecipients utility", () => {
    it("should convert single email", () => {
      const result = toRecipients(["test@example.com"]);
      expect(result).toEqual([{ emailAddress: { address: "test@example.com" } }]);
    });

    it("should convert multiple emails", () => {
      const result = toRecipients(["a@b.com", "c@d.com"]);
      expect(result).toEqual([
        { emailAddress: { address: "a@b.com" } },
        { emailAddress: { address: "c@d.com" } },
      ]);
    });

    it("should return empty array for empty input", () => {
      expect(toRecipients([])).toEqual([]);
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

    it("should send email successfully (202)", async () => {
      const response = await client.api("/me/sendMail").post({
        message: {
          subject: "Test",
          body: { contentType: "Text", content: "Hello" },
          toRecipients: toRecipients(["test@example.com"]),
        },
        saveToSentItems: true,
      });
      // 202 with empty body — Graph client returns null
      expect(response).toBeNull();
    });

    it("should send email with HTML body type", async () => {
      const response = await client.api("/me/sendMail").post({
        message: {
          subject: "HTML Test",
          body: { contentType: "HTML", content: "<p>Hello</p>" },
          toRecipients: toRecipients(["test@example.com"]),
        },
        saveToSentItems: true,
      });
      expect(response).toBeNull();
    });

    it("should send email with CC and BCC", async () => {
      const response = await client.api("/me/sendMail").post({
        message: {
          subject: "CC BCC Test",
          body: { contentType: "Text", content: "Hello" },
          toRecipients: toRecipients(["to@example.com"]),
          ccRecipients: toRecipients(["cc@example.com"]),
          bccRecipients: toRecipients(["bcc@example.com"]),
        },
        saveToSentItems: true,
      });
      expect(response).toBeNull();
    });

    it("should send email with saveToSentItems=false", async () => {
      const response = await client.api("/me/sendMail").post({
        message: {
          subject: "No Sent Items",
          body: { contentType: "Text", content: "Hello" },
          toRecipients: toRecipients(["test@example.com"]),
        },
        saveToSentItems: false,
      });
      expect(response).toBeNull();
    });

    it("should send email with importance=high", async () => {
      const response = await client.api("/me/sendMail").post({
        message: {
          subject: "Important",
          body: { contentType: "Text", content: "Hello" },
          toRecipients: toRecipients(["test@example.com"]),
          importance: "high",
        },
        saveToSentItems: true,
      });
      expect(response).toBeNull();
    });

    it("should send email via multi-tenant path", async () => {
      const userPath = resolveUserPath("user@tenant.com");
      const response = await client.api(`${userPath}/sendMail`).post({
        message: {
          subject: "Multi-tenant",
          body: { contentType: "Text", content: "Hello" },
          toRecipients: toRecipients(["test@example.com"]),
        },
        saveToSentItems: true,
      });
      expect(response).toBeNull();
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

    it("should map 403 for missing Mail.Send to AuthError", async () => {
      try {
        await errorClient.api("/me/sendMail").post({
          message: {
            subject: "trigger_403",
            body: { contentType: "Text", content: "Test" },
            toRecipients: toRecipients(["test@example.com"]),
          },
          saveToSentItems: true,
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "AuthError");
      }
    });

    it("should map 400 for invalid recipients to ValidationError", async () => {
      try {
        await errorClient.api("/me/sendMail").post({
          message: {
            subject: "trigger_400",
            body: { contentType: "Text", content: "Test" },
            toRecipients: toRecipients(["test@example.com"]),
          },
          saveToSentItems: true,
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "ValidationError");
      }
    });

    it("should map 429 for rate limit to RateLimitError", async () => {
      try {
        await errorClient.api("/me/sendMail").post({
          message: {
            subject: "trigger_429",
            body: { contentType: "Text", content: "Test" },
            toRecipients: toRecipients(["test@example.com"]),
          },
          saveToSentItems: true,
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "RateLimitError");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------
  describe("idempotency", () => {
    afterEach(() => {
      idempotencyCache.cleanup();
    });

    it("should cache result with idempotency_key", () => {
      const result = { content: [{ type: "text" as const, text: "sent" }] };
      idempotencyCache.set("send_email", "test-key", result);
      expect(idempotencyCache.get("send_email", "test-key")).toEqual(result);
    });

    it("should return undefined for unknown key", () => {
      expect(idempotencyCache.get("send_email", "unknown")).toBeUndefined();
    });

    it("should not cross tool boundaries", () => {
      const result = { content: [{ type: "text" as const, text: "sent" }] };
      idempotencyCache.set("send_email", "key-1", result);
      expect(idempotencyCache.get("reply_email", "key-1")).toBeUndefined();
    });

    it("should expire after TTL", () => {
      vi.useFakeTimers();
      try {
        const result = { content: [{ type: "text" as const, text: "sent" }] };
        idempotencyCache.set("send_email", "expire-key", result);
        expect(idempotencyCache.get("send_email", "expire-key")).toEqual(result);

        // Advance past 10 minute TTL
        vi.advanceTimersByTime(11 * 60 * 1000);
        expect(idempotencyCache.get("send_email", "expire-key")).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // -----------------------------------------------------------------------
  // Confirmation pattern
  // -----------------------------------------------------------------------
  describe("confirmation pattern", () => {
    it("should verify checkConfirmation returns preview for destructive without confirm", async () => {
      const { checkConfirmation, formatPreview } = await import("../src/utils/confirmation.js");
      const result = checkConfirmation(
        "destructive",
        false,
        formatPreview("E-Mail senden", { An: "test@example.com", Betreff: "Test" }),
      );
      expect(result).not.toBeNull();
      expect(result?.isPreview).toBe(true);
      expect(result?.message).toContain("E-Mail senden");
      expect(result?.message).toContain("test@example.com");
    });

    it("should verify checkConfirmation returns null when confirmed", async () => {
      const { checkConfirmation } = await import("../src/utils/confirmation.js");
      const result = checkConfirmation("destructive", true, "preview");
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Request body construction (MSW capture)
  // -----------------------------------------------------------------------
  describe("request body construction", () => {
    let client: Client;
    let capturedBody: Record<string, unknown> | null;

    beforeEach(() => {
      client = createTestGraphClient();
      capturedBody = null;

      mswServer.use(
        http.post("https://graph.microsoft.com/v1.0/me/sendMail", async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return new HttpResponse(null, { status: 202 });
        }),
      );
    });

    it("should construct correct Graph API body for text email", async () => {
      await client.api("/me/sendMail").post({
        message: {
          subject: "Test Subject",
          body: { contentType: "Text", content: "Hello World" },
          toRecipients: toRecipients(["to@example.com"]),
          importance: "normal",
        },
        saveToSentItems: true,
      });

      expect(capturedBody).not.toBeNull();
      const msg = capturedBody?.message as Record<string, unknown>;
      expect(msg.subject).toBe("Test Subject");
      expect(msg.body).toEqual({ contentType: "Text", content: "Hello World" });
      expect(msg.toRecipients).toEqual([{ emailAddress: { address: "to@example.com" } }]);
      expect(msg.importance).toBe("normal");
      expect(capturedBody?.saveToSentItems).toBe(true);
    });

    it("should construct correct Graph API body for HTML email with CC/BCC", async () => {
      await client.api("/me/sendMail").post({
        message: {
          subject: "HTML Mail",
          body: { contentType: "HTML", content: "<p>Hello</p>" },
          toRecipients: toRecipients(["to@example.com"]),
          ccRecipients: toRecipients(["cc@example.com"]),
          bccRecipients: toRecipients(["bcc@example.com"]),
          importance: "high",
        },
        saveToSentItems: false,
      });

      expect(capturedBody).not.toBeNull();
      const msg = capturedBody?.message as Record<string, unknown>;
      expect(msg.body).toEqual({ contentType: "HTML", content: "<p>Hello</p>" });
      expect(msg.ccRecipients).toEqual([{ emailAddress: { address: "cc@example.com" } }]);
      expect(msg.bccRecipients).toEqual([{ emailAddress: { address: "bcc@example.com" } }]);
      expect(msg.importance).toBe("high");
      expect(capturedBody?.saveToSentItems).toBe(false);
    });
  });
});
