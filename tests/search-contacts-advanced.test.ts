import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { AdvancedSearchContactsParams } from "../src/schemas/search-advanced.js";
import { server as mswServer } from "./mocks/server.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("advanced_search_contacts", () => {
  describe("AdvancedSearchContactsParams schema", () => {
    it("should parse with required kql_query", () => {
      const result = AdvancedSearchContactsParams.parse({ kql_query: "displayName:john" });
      expect(result.kql_query).toBe("displayName:john");
    });

    it("should reject empty kql_query", () => {
      expect(AdvancedSearchContactsParams.safeParse({ kql_query: "" }).success).toBe(false);
    });

    it("should reject kql_query exceeding 500 chars", () => {
      expect(AdvancedSearchContactsParams.safeParse({ kql_query: "a".repeat(501) }).success).toBe(
        false,
      );
    });

    it("should accept from/size", () => {
      const result = AdvancedSearchContactsParams.parse({ kql_query: "test", from: 0, size: 10 });
      expect(result.from).toBe(0);
      expect(result.size).toBe(10);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should search contacts with displayName KQL", async () => {
      const response = (await client.api("/search/query").post({
        requests: [
          {
            entityTypes: ["person"],
            query: { queryString: "displayName:john" },
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

    it("should return contact with email and company", async () => {
      const response = (await client.api("/search/query").post({
        requests: [
          {
            entityTypes: ["person"],
            query: { queryString: "companyName:Pommer" },
            from: 0,
            size: 25,
          },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      const hits = value[0].hits as Array<Record<string, unknown>>;
      const resource = hits[0].resource as Record<string, unknown>;
      expect(resource.displayName).toBe("John Developer");
      expect(resource.companyName).toBe("Pommer IT");
    });

    it("should return empty results", async () => {
      mswServer.use(
        http.post(`${GRAPH_BASE}/search/query`, () => {
          return HttpResponse.json({
            value: [{ hits: [], total: 0, moreResultsAvailable: false }],
          });
        }),
      );

      const response = (await client.api("/search/query").post({
        requests: [
          { entityTypes: ["person"], query: { queryString: "nonexistent" }, from: 0, size: 25 },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      expect(value[0].total).toBe(0);
    });

    it("should handle 401 unauthorized", async () => {
      mswServer.use(
        http.post(`${GRAPH_BASE}/search/query`, () => {
          return HttpResponse.json(
            { error: { code: "InvalidAuthenticationToken", message: "Token expired" } },
            { status: 401 },
          );
        }),
      );

      try {
        await client.api("/search/query").post({
          requests: [{ entityTypes: ["person"], query: { queryString: "test" } }],
        });
        expect.fail("Should have thrown");
      } catch (error) {
        const err = error as { statusCode: number };
        expect(err.statusCode).toBe(401);
      }
    });
  });
});
