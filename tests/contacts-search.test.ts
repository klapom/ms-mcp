import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { SearchContactsParams } from "../src/schemas/contacts.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("search_contacts", () => {
  describe("SearchContactsParams schema", () => {
    it("should require query", () => {
      expect(() => SearchContactsParams.parse({})).toThrow();
    });

    it("should accept valid query", () => {
      const result = SearchContactsParams.parse({ query: "Alice" });
      expect(result.query).toBe("Alice");
    });

    it("should reject empty query", () => {
      expect(() => SearchContactsParams.parse({ query: "" })).toThrow();
    });

    it("should reject query > 200 chars", () => {
      expect(() => SearchContactsParams.parse({ query: "a".repeat(201) })).toThrow();
    });

    it("should accept with pagination", () => {
      const result = SearchContactsParams.parse({ query: "test", top: 10 });
      expect(result.top).toBe(10);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should search contacts with $search", async () => {
      const response = (await client
        .api("/me/contacts")
        .header("ConsistencyLevel", "eventual")
        .search('"Alice"')
        .query({ $count: "true" })
        .get()) as Record<string, unknown>;

      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThan(0);
      expect(response["@odata.count"]).toBe(1);
    });
  });
});
