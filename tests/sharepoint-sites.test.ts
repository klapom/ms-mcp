import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import {
  GetSiteParams,
  ListSiteDrivesParams,
  SearchSitesParams,
} from "../src/schemas/sharepoint.js";

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

describe("search_sites", () => {
  describe("SearchSitesParams schema", () => {
    it("should parse with query", () => {
      const result = SearchSitesParams.parse({ query: "engineering" });
      expect(result.query).toBe("engineering");
    });

    it("should reject empty query", () => {
      const result = SearchSitesParams.safeParse({ query: "" });
      expect(result.success).toBe(false);
    });

    it("should reject query > 200 chars", () => {
      const result = SearchSitesParams.safeParse({ query: "a".repeat(201) });
      expect(result.success).toBe(false);
    });

    it("should parse with pagination", () => {
      const result = SearchSitesParams.parse({ query: "test", top: 10 });
      expect(result.top).toBe(10);
    });
  });

  describe("Graph API integration", () => {
    it("should search sites", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/sites")
        .query({ search: "engineering" })
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);
      expect(items[0]).toHaveProperty("displayName", "Engineering Site");
    });

    it("should return empty for no results", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/sites")
        .query({ search: "nonexistent" })
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(0);
    });
  });
});

describe("get_site", () => {
  describe("GetSiteParams schema", () => {
    it("should parse with site_id", () => {
      const result = GetSiteParams.parse({ site_id: "site-001" });
      expect(result.site_id).toBe("site-001");
    });

    it("should parse with hostname + site_path", () => {
      const result = GetSiteParams.parse({
        hostname: "contoso.sharepoint.com",
        site_path: "/sites/engineering",
      });
      expect(result.hostname).toBe("contoso.sharepoint.com");
      expect(result.site_path).toBe("/sites/engineering");
    });

    it("should reject empty site_id", () => {
      const result = GetSiteParams.safeParse({ site_id: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    it("should get site by ID", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/sites/site-001").get()) as Record<string, unknown>;
      expect(response).toHaveProperty("displayName", "Engineering Site");
    });

    it("should return 404 for nonexistent site", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(client.api("/sites/nonexistent").get()).rejects.toThrow();
    });
  });
});

describe("list_site_drives", () => {
  describe("ListSiteDrivesParams schema", () => {
    it("should parse with site_id", () => {
      const result = ListSiteDrivesParams.parse({ site_id: "site-001" });
      expect(result.site_id).toBe("site-001");
    });

    it("should reject empty site_id", () => {
      const result = ListSiteDrivesParams.safeParse({ site_id: "" });
      expect(result.success).toBe(false);
    });

    it("should reject missing site_id", () => {
      const result = ListSiteDrivesParams.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    it("should list site drives", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/sites/site-001/drives").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);
      expect(items[0]).toHaveProperty("name", "Documents");
      expect(items[0]).toHaveProperty("driveType", "documentLibrary");
    });

    it("should return 404 for nonexistent site", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(client.api("/sites/nonexistent/drives").get()).rejects.toThrow();
    });
  });
});
