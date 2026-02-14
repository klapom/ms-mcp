import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { GetPageContentParams, ListPagesParams } from "../src/schemas/onenote.js";

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

describe("list_pages", () => {
  describe("ListPagesParams schema", () => {
    it("should require section_id", () => {
      expect(() => ListPagesParams.parse({})).toThrow();
    });

    it("should accept valid section_id", () => {
      const result = ListPagesParams.parse({ section_id: "section-1" });
      expect(result.section_id).toBe("section-1");
    });

    it("should reject empty section_id", () => {
      expect(() => ListPagesParams.parse({ section_id: "" })).toThrow();
    });

    it("should accept pagination params", () => {
      const result = ListPagesParams.parse({
        section_id: "section-1",
        top: 10,
        skip: 5,
      });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });

    it("should accept user_id", () => {
      const result = ListPagesParams.parse({
        section_id: "section-1",
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

    it("should fetch pages for a section", async () => {
      const response = (await client.api("/me/onenote/sections/section-1/pages").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items).toHaveLength(3);
      expect(items[0].title).toBe("Meeting Notes 2024-02-15");
      expect(items[1].title).toBe("Project Brainstorming");
    });

    it("should support pagination with $top", async () => {
      const response = (await client
        .api("/me/onenote/sections/section-1/pages")
        .top(2)
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBeLessThanOrEqual(2);
    });
  });

  describe("Error handling", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClientWithErrorMapping();
    });

    it("should handle section not found", async () => {
      await expect(
        client.api("/me/onenote/sections/not-found-section/pages").get(),
      ).rejects.toThrow();
    });
  });
});

describe("get_page_content", () => {
  describe("GetPageContentParams schema", () => {
    it("should require page_id", () => {
      expect(() => GetPageContentParams.parse({})).toThrow();
    });

    it("should accept valid page_id", () => {
      const result = GetPageContentParams.parse({ page_id: "page-1" });
      expect(result.page_id).toBe("page-1");
    });

    it("should reject empty page_id", () => {
      expect(() => GetPageContentParams.parse({ page_id: "" })).toThrow();
    });

    it("should default include_images to false", () => {
      const result = GetPageContentParams.parse({ page_id: "page-1" });
      expect(result.include_images).toBe(false);
    });

    it("should accept include_images true", () => {
      const result = GetPageContentParams.parse({
        page_id: "page-1",
        include_images: true,
      });
      expect(result.include_images).toBe(true);
    });

    it("should accept user_id", () => {
      const result = GetPageContentParams.parse({
        page_id: "page-1",
        user_id: "user@example.com",
      });
      expect(result.user_id).toBe("user@example.com");
    });
  });

  // Note: HTML content retrieval is tested in E2E tests
  // MSW doesn't properly mock HTML responses from Graph API

  describe("Error handling", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClientWithErrorMapping();
    });

    it("should handle page not found", async () => {
      await expect(client.api("/me/onenote/pages/not-found-page/content").get()).rejects.toThrow();
    });
  });
});
