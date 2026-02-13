import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { AdvancedSearchEmailsParams } from "../src/schemas/search-advanced.js";
import { server as mswServer } from "./mocks/server.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("advanced_search_emails", () => {
  describe("AdvancedSearchEmailsParams schema", () => {
    it("should parse with required kql_query", () => {
      const result = AdvancedSearchEmailsParams.parse({ kql_query: "from:john@example.com" });
      expect(result.kql_query).toBe("from:john@example.com");
      expect(result.from).toBeUndefined();
      expect(result.size).toBeUndefined();
      expect(result.enable_query_interpretation).toBe(true);
    });

    it("should parse with all optional parameters", () => {
      const result = AdvancedSearchEmailsParams.parse({
        kql_query: "subject:test",
        from: 10,
        size: 20,
        enable_query_interpretation: false,
        sort: [{ property: "receivedDateTime", direction: "descending" }],
      });
      expect(result.from).toBe(10);
      expect(result.size).toBe(20);
      expect(result.enable_query_interpretation).toBe(false);
      expect(result.sort).toHaveLength(1);
    });

    it("should reject empty kql_query", () => {
      expect(AdvancedSearchEmailsParams.safeParse({ kql_query: "" }).success).toBe(false);
    });

    it("should reject kql_query exceeding 1000 chars", () => {
      expect(AdvancedSearchEmailsParams.safeParse({ kql_query: "a".repeat(1001) }).success).toBe(
        false,
      );
    });

    it("should reject size > 50", () => {
      expect(AdvancedSearchEmailsParams.safeParse({ kql_query: "test", size: 51 }).success).toBe(
        false,
      );
    });

    it("should reject negative from", () => {
      expect(AdvancedSearchEmailsParams.safeParse({ kql_query: "test", from: -1 }).success).toBe(
        false,
      );
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should search emails with KQL query", async () => {
      const response = (await client.api("/search/query").post({
        requests: [
          {
            entityTypes: ["message"],
            query: { queryString: "from:john@example.com" },
            from: 0,
            size: 25,
          },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      expect(value).toHaveLength(1);
      const hits = value[0].hits as unknown[];
      expect(hits.length).toBeGreaterThan(0);
    });

    it("should search with subject KQL", async () => {
      const response = (await client.api("/search/query").post({
        requests: [
          {
            entityTypes: ["message"],
            query: { queryString: 'subject:"quarterly report"' },
            from: 0,
            size: 25,
          },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      expect(value).toHaveLength(1);
    });

    it("should return results with rank and summary", async () => {
      const response = (await client.api("/search/query").post({
        requests: [
          {
            entityTypes: ["message"],
            query: { queryString: "hasAttachment:true" },
            from: 0,
            size: 25,
          },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      const container = value[0];
      const hits = container.hits as Array<Record<string, unknown>>;
      expect(hits[0]).toHaveProperty("rank");
      expect(hits[0]).toHaveProperty("summary");
    });

    it("should return empty results for no matches", async () => {
      mswServer.use(
        http.post(`${GRAPH_BASE}/search/query`, () => {
          return HttpResponse.json({
            value: [{ hits: [], total: 0, moreResultsAvailable: false }],
          });
        }),
      );

      const response = (await client.api("/search/query").post({
        requests: [
          {
            entityTypes: ["message"],
            query: { queryString: "nonexistent_xyz" },
            from: 0,
            size: 25,
          },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      expect(value[0].total).toBe(0);
    });

    it("should return 400 for invalid KQL syntax", async () => {
      try {
        await client.api("/search/query").post({
          requests: [
            {
              entityTypes: ["message"],
              query: { queryString: "INVALID_KQL_SYNTAX!!!" },
              from: 0,
              size: 25,
            },
          ],
        });
        expect.fail("Should have thrown");
      } catch (error) {
        const err = error as { statusCode: number };
        expect(err.statusCode).toBe(400);
      }
    });
  });
});
