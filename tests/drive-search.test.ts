import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { SearchFilesParams } from "../src/schemas/files.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("search_files", () => {
  describe("SearchFilesParams schema", () => {
    it("should parse with required query", () => {
      const result = SearchFilesParams.parse({ query: "report" });
      expect(result.query).toBe("report");
    });

    it("should reject empty query", () => {
      const result = SearchFilesParams.safeParse({ query: "" });
      expect(result.success).toBe(false);
    });

    it("should reject query > 500 chars", () => {
      const result = SearchFilesParams.safeParse({ query: "x".repeat(501) });
      expect(result.success).toBe(false);
    });

    it("should accept pagination params", () => {
      const result = SearchFilesParams.parse({ query: "test", top: 10, skip: 5 });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should search files", async () => {
      const response = (await client.api("/me/drive/root/search(q='report')").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it("should return results with expected fields", async () => {
      const response = (await client.api("/me/drive/root/search(q='report')").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items[0]).toHaveProperty("id");
      expect(items[0]).toHaveProperty("name");
      expect(items[0]).toHaveProperty("size");
    });
  });
});
