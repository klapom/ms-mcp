import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { convert } from "html-to-text";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { resolveUserPath } from "../src/schemas/common.js";
import { ReadEmailParams } from "../src/schemas/mail.js";
import { DEFAULT_SELECT, buildSelectParam, truncateBody } from "../src/utils/response-shaper.js";

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

describe("read_email", () => {
  // Schema tests
  describe("ReadEmailParams schema", () => {
    it("should parse with required message_id only", () => {
      const result = ReadEmailParams.parse({ message_id: "msg-001" });
      expect(result.message_id).toBe("msg-001");
      expect(result.format).toBe("text"); // default
      expect(result.max_body_length).toBeUndefined();
      expect(result.include_internet_headers).toBe(false); // default
    });

    it("should parse with all parameters", () => {
      const result = ReadEmailParams.parse({
        message_id: "msg-001",
        format: "html",
        max_body_length: 10000,
        include_internet_headers: true,
        user_id: "user@example.com",
      });
      expect(result.format).toBe("html");
      expect(result.max_body_length).toBe(10000);
      expect(result.include_internet_headers).toBe(true);
      expect(result.user_id).toBe("user@example.com");
    });

    it("should reject empty message_id", () => {
      const result = ReadEmailParams.safeParse({ message_id: "" });
      expect(result.success).toBe(false);
    });

    it("should reject missing message_id", () => {
      const result = ReadEmailParams.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject max_body_length over 50000", () => {
      const result = ReadEmailParams.safeParse({ message_id: "x", max_body_length: 50001 });
      expect(result.success).toBe(false);
    });

    it("should reject max_body_length of 0", () => {
      const result = ReadEmailParams.safeParse({ message_id: "x", max_body_length: 0 });
      expect(result.success).toBe(false);
    });

    it("should reject non-integer max_body_length", () => {
      const result = ReadEmailParams.safeParse({ message_id: "x", max_body_length: 3.5 });
      expect(result.success).toBe(false);
    });

    it("should accept max_body_length at boundary (50000)", () => {
      const result = ReadEmailParams.safeParse({ message_id: "x", max_body_length: 50000 });
      expect(result.success).toBe(true);
    });

    it("should reject invalid format", () => {
      const result = ReadEmailParams.safeParse({ message_id: "x", format: "markdown" });
      expect(result.success).toBe(false);
    });
  });

  // Graph API integration tests (MSW-backed)
  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch a plain text email by ID", async () => {
      const response = await client
        .api("/me/messages/text-msg")
        .select(buildSelectParam(DEFAULT_SELECT.mailDetail))
        .get();

      expect(response).toHaveProperty("id", "text-msg");
      expect(response).toHaveProperty("subject", "Plain Text Email");
      expect(response.body.contentType).toBe("text");
      expect(response.body.content).toBe("This is a plain text email body.");
      expect(response.hasAttachments).toBe(true);
      expect(response.importance).toBe("high");
      expect(response.isRead).toBe(false);
    });

    it("should fetch an HTML email by ID", async () => {
      const response = await client
        .api("/me/messages/html-msg")
        .select(buildSelectParam(DEFAULT_SELECT.mailDetail))
        .get();

      expect(response).toHaveProperty("id", "html-msg");
      expect(response.body.contentType).toBe("html");
      expect(response.body.content).toContain("<h1>Hello</h1>");
      expect(response.body.content).toContain("<a href=");
      expect(response.body.content).toContain("<table>");
    });

    it("should handle email with empty body", async () => {
      const response = await client.api("/me/messages/empty-body-msg").get();

      expect(response.body.content).toBe("");
    });

    it("should include internet message headers when requested", async () => {
      const response = await client
        .api("/me/messages/headers-msg")
        .select(buildSelectParam([...DEFAULT_SELECT.mailDetail, "internetMessageHeaders"]))
        .get();

      expect(response.internetMessageHeaders).toHaveLength(3);
      expect(response.internetMessageHeaders[0]).toEqual({
        name: "Message-ID",
        value: "<msg004@example.com>",
      });
    });

    it("should resolve multi-tenant path", async () => {
      const userId = "admin@contoso.com";
      const userPath = resolveUserPath(userId);
      const response = await client.api(`${userPath}/messages/mt-msg-001`).get();

      expect(response).toHaveProperty("id", "mt-msg-001");
      expect(response.subject).toContain("Multi-tenant");
    });
  });

  // Error responses
  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 for nonexistent message to NotFoundError", async () => {
      try {
        await errorClient.api("/me/messages/nonexistent-msg").get();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
        expect(e).toHaveProperty("message", expect.stringContaining("not found"));
      }
    });
  });

  // HTML to Text conversion
  describe("HTML to text conversion", () => {
    it("should convert simple HTML to text", () => {
      const html = "<p>Hello World</p>";
      const text = convert(html, { wordwrap: 120 });
      expect(text).toContain("Hello World");
    });

    it("should convert links", () => {
      const html = '<p>Visit <a href="https://example.com">Example</a></p>';
      const text = convert(html, {
        wordwrap: 120,
        selectors: [{ selector: "a", options: { hideLinkHrefIfSameAsText: true } }],
      });
      expect(text).toContain("Example");
      expect(text).toContain("https://example.com");
    });

    it("should convert tables", () => {
      const html = "<table><tr><td>Cell 1</td><td>Cell 2</td></tr></table>";
      const text = convert(html, { wordwrap: 120 });
      expect(text).toContain("Cell 1");
      expect(text).toContain("Cell 2");
    });

    it("should handle empty HTML", () => {
      const html = "<html><body></body></html>";
      const text = convert(html, { wordwrap: 120 });
      expect(text.trim()).toBe("");
    });

    it("should handle Outlook-style HTML", () => {
      const html =
        '<div dir="ltr"><div class="gmail_default"><span style="font-size:small">Text content</span></div></div>';
      const text = convert(html, { wordwrap: 120 });
      expect(text).toContain("Text content");
    });
  });

  // Truncation
  describe("body truncation", () => {
    it("should truncate long body", () => {
      const longBody = "A".repeat(10000);
      const truncated = truncateBody(longBody, 500);
      expect(truncated.length).toBeLessThanOrEqual(500);
      expect(truncated).toContain("[truncated]");
    });

    it("should not truncate short body", () => {
      const shortBody = "Short text";
      const result = truncateBody(shortBody, 500);
      expect(result).toBe(shortBody);
    });

    it("should handle max_body_length=50000 for full body", () => {
      const body = "B".repeat(10000);
      const result = truncateBody(body, 50000);
      expect(result).toBe(body); // Not truncated
    });
  });

  // DEFAULT_SELECT
  describe("DEFAULT_SELECT.mailDetail", () => {
    it("should contain extended field list", () => {
      expect(DEFAULT_SELECT.mailDetail).toBeDefined();
      expect(DEFAULT_SELECT.mailDetail).toContain("body");
      expect(DEFAULT_SELECT.mailDetail).toContain("toRecipients");
      expect(DEFAULT_SELECT.mailDetail).toContain("ccRecipients");
      expect(DEFAULT_SELECT.mailDetail).toContain("bccRecipients");
      expect(DEFAULT_SELECT.mailDetail).toContain("conversationId");
      expect(DEFAULT_SELECT.mailDetail).toContain("internetMessageId");
      expect(DEFAULT_SELECT.mailDetail).toContain("parentFolderId");
      expect(DEFAULT_SELECT.mailDetail).toContain("replyTo");
    });

    it("should contain more fields than mail select", () => {
      expect(DEFAULT_SELECT.mailDetail.length).toBeGreaterThan(DEFAULT_SELECT.mail.length);
    });
  });
});
