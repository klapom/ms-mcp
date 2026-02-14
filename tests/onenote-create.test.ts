import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { CreatePageParams } from "../src/schemas/onenote.js";

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

describe("create_page", () => {
  describe("CreatePageParams schema", () => {
    it("should require section_id", () => {
      expect(() =>
        CreatePageParams.parse({
          title: "Test",
          content: "<p>Content</p>",
        }),
      ).toThrow();
    });

    it("should require title", () => {
      expect(() =>
        CreatePageParams.parse({
          section_id: "section-1",
          content: "<p>Content</p>",
        }),
      ).toThrow();
    });

    it("should require content", () => {
      expect(() =>
        CreatePageParams.parse({
          section_id: "section-1",
          title: "Test",
        }),
      ).toThrow();
    });

    it("should accept valid parameters", () => {
      const result = CreatePageParams.parse({
        section_id: "section-1",
        title: "New Page",
        content: "<p>Hello World</p>",
      });
      expect(result.section_id).toBe("section-1");
      expect(result.title).toBe("New Page");
      expect(result.content).toBe("<p>Hello World</p>");
    });

    it("should reject empty section_id", () => {
      expect(() =>
        CreatePageParams.parse({
          section_id: "",
          title: "Test",
          content: "<p>Content</p>",
        }),
      ).toThrow();
    });

    it("should reject empty title", () => {
      expect(() =>
        CreatePageParams.parse({
          section_id: "section-1",
          title: "",
          content: "<p>Content</p>",
        }),
      ).toThrow();
    });

    it("should reject title over 255 chars", () => {
      const longTitle = "a".repeat(256);
      expect(() =>
        CreatePageParams.parse({
          section_id: "section-1",
          title: longTitle,
          content: "<p>Content</p>",
        }),
      ).toThrow();
    });

    it("should reject empty content", () => {
      expect(() =>
        CreatePageParams.parse({
          section_id: "section-1",
          title: "Test",
          content: "",
        }),
      ).toThrow();
    });

    it("should accept confirm parameter", () => {
      const result = CreatePageParams.parse({
        section_id: "section-1",
        title: "Test",
        content: "<p>Content</p>",
        confirm: true,
      });
      expect(result.confirm).toBe(true);
    });

    it("should accept idempotency_key parameter", () => {
      const result = CreatePageParams.parse({
        section_id: "section-1",
        title: "Test",
        content: "<p>Content</p>",
        idempotency_key: "key-123",
      });
      expect(result.idempotency_key).toBe("key-123");
    });

    it("should accept user_id parameter", () => {
      const result = CreatePageParams.parse({
        section_id: "section-1",
        title: "Test",
        content: "<p>Content</p>",
        user_id: "user@example.com",
      });
      expect(result.user_id).toBe("user@example.com");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should create a page with HTML content", async () => {
      const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <title>Test Page</title>
  </head>
  <body>
    <p>Test content</p>
  </body>
</html>`;

      const response = (await client
        .api("/me/onenote/sections/section-1/pages")
        .header("Content-Type", "text/html")
        .post(htmlContent)) as Record<string, unknown>;

      expect(response).toBeDefined();
      expect(response.id).toBe("new-page-123");
      expect(response.title).toBeDefined();
    });
  });

  describe("Error handling", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClientWithErrorMapping();
    });

    it("should handle section not found", async () => {
      const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <title>Test</title>
  </head>
  <body>
    <p>Content</p>
  </body>
</html>`;

      await expect(
        client
          .api("/me/onenote/sections/not-found-section/pages")
          .header("Content-Type", "text/html")
          .post(htmlContent),
      ).rejects.toThrow();
    });
  });
});
