import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { SearchAllParams } from "../src/schemas/search-advanced.js";
import { server as mswServer } from "./mocks/server.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("search_all", () => {
  describe("SearchAllParams schema", () => {
    it("should parse with required query", () => {
      const result = SearchAllParams.parse({ query: "budget report" });
      expect(result.query).toBe("budget report");
      expect(result.entity_types).toBeUndefined();
    });

    it("should reject empty query", () => {
      expect(SearchAllParams.safeParse({ query: "" }).success).toBe(false);
    });

    it("should accept entity_types filter", () => {
      const result = SearchAllParams.parse({
        query: "test",
        entity_types: ["message", "event"],
      });
      expect(result.entity_types).toEqual(["message", "event"]);
    });

    it("should reject invalid entity type", () => {
      expect(SearchAllParams.safeParse({ query: "test", entity_types: ["invalid"] }).success).toBe(
        false,
      );
    });

    it("should accept from/size", () => {
      const result = SearchAllParams.parse({ query: "test", from: 0, size: 10 });
      expect(result.size).toBe(10);
    });

    it("should reject size > 25", () => {
      expect(SearchAllParams.safeParse({ query: "test", size: 26 }).success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should search across all entity types", async () => {
      const response = (await client.api("/search/query").post({
        requests: [
          { entityTypes: ["message"], query: { queryString: "budget" }, from: 0, size: 10 },
          { entityTypes: ["event"], query: { queryString: "budget" }, from: 0, size: 10 },
          { entityTypes: ["driveItem"], query: { queryString: "budget" }, from: 0, size: 10 },
          { entityTypes: ["person"], query: { queryString: "budget" }, from: 0, size: 10 },
          { entityTypes: ["chatMessage"], query: { queryString: "budget" }, from: 0, size: 10 },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      expect(value.length).toBe(5);
    });

    it("should search specific entity types only", async () => {
      const response = (await client.api("/search/query").post({
        requests: [
          { entityTypes: ["message"], query: { queryString: "project" }, from: 0, size: 10 },
          { entityTypes: ["event"], query: { queryString: "project" }, from: 0, size: 10 },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      expect(value.length).toBe(2);
    });

    it("should return empty results across all types", async () => {
      mswServer.use(
        http.post(`${GRAPH_BASE}/search/query`, () => {
          return HttpResponse.json({
            value: [
              { hits: [], total: 0, moreResultsAvailable: false },
              { hits: [], total: 0, moreResultsAvailable: false },
            ],
          });
        }),
      );

      const response = (await client.api("/search/query").post({
        requests: [
          { entityTypes: ["message"], query: { queryString: "nonexistent" } },
          { entityTypes: ["event"], query: { queryString: "nonexistent" } },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      for (const container of value) {
        expect(container.total).toBe(0);
      }
    });

    it("should handle 400 invalid query", async () => {
      try {
        await client.api("/search/query").post({
          requests: [{ entityTypes: ["message"], query: { queryString: "INVALID_KQL_SYNTAX!!!" } }],
        });
        expect.fail("Should have thrown");
      } catch (error) {
        const err = error as { statusCode: number };
        expect(err.statusCode).toBe(400);
      }
    });
  });
});
