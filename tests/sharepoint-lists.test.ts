import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ListListItemsParams, ListSiteListsParams } from "../src/schemas/sharepoint.js";

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

describe("list_site_lists", () => {
  describe("ListSiteListsParams schema", () => {
    it("should parse with required fields", () => {
      const result = ListSiteListsParams.parse({ site_id: "site-001" });
      expect(result.site_id).toBe("site-001");
      expect(result.include_hidden).toBe(false);
    });

    it("should parse with include_hidden", () => {
      const result = ListSiteListsParams.parse({ site_id: "s1", include_hidden: true });
      expect(result.include_hidden).toBe(true);
    });

    it("should reject missing site_id", () => {
      const result = ListSiteListsParams.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject empty site_id", () => {
      const result = ListSiteListsParams.safeParse({ site_id: "" });
      expect(result.success).toBe(false);
    });

    it("should parse with pagination", () => {
      const result = ListSiteListsParams.parse({ site_id: "s1", top: 50 });
      expect(result.top).toBe(50);
    });
  });

  describe("Graph API integration", () => {
    it("should list non-hidden lists", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/sites/site-001/lists")
        .filter("list/hidden eq false")
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(1);
      expect(items[0]).toHaveProperty("displayName", "Tasks");
    });

    it("should list all lists including hidden", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/sites/site-001/lists").get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);
    });

    it("should return 404 for nonexistent site", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(client.api("/sites/nonexistent/lists").get()).rejects.toThrow();
    });
  });
});

describe("list_list_items", () => {
  describe("ListListItemsParams schema", () => {
    it("should parse with required fields", () => {
      const result = ListListItemsParams.parse({ site_id: "s1", list_id: "l1" });
      expect(result.site_id).toBe("s1");
      expect(result.list_id).toBe("l1");
    });

    it("should parse with filter and orderby", () => {
      const result = ListListItemsParams.parse({
        site_id: "s1",
        list_id: "l1",
        filter: "fields/Status eq 'Active'",
        orderby: "fields/Title asc",
      });
      expect(result.filter).toBe("fields/Status eq 'Active'");
    });

    it("should reject missing site_id", () => {
      const result = ListListItemsParams.safeParse({ list_id: "l1" });
      expect(result.success).toBe(false);
    });

    it("should reject missing list_id", () => {
      const result = ListListItemsParams.safeParse({ site_id: "s1" });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    it("should list items with expand fields", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/sites/site-001/lists/list-001/items")
        .query({ $expand: "fields" })
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);
      expect(items[0]).toHaveProperty("id", "item-001");
    });

    it("should return 404 for nonexistent list", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(client.api("/sites/site-001/lists/nonexistent/items").get()).rejects.toThrow();
    });
  });
});
