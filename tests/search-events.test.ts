import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { SearchEventsParams } from "../src/schemas/search-advanced.js";
import { server as mswServer } from "./mocks/server.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("search_events", () => {
  describe("SearchEventsParams schema", () => {
    it("should parse with required kql_query", () => {
      const result = SearchEventsParams.parse({ kql_query: 'subject:"sprint"' });
      expect(result.kql_query).toBe('subject:"sprint"');
    });

    it("should reject empty kql_query", () => {
      expect(SearchEventsParams.safeParse({ kql_query: "" }).success).toBe(false);
    });

    it("should accept from/size", () => {
      const result = SearchEventsParams.parse({ kql_query: "test", from: 5, size: 10 });
      expect(result.from).toBe(5);
      expect(result.size).toBe(10);
    });

    it("should reject size > 50", () => {
      expect(SearchEventsParams.safeParse({ kql_query: "test", size: 51 }).success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should search events with subject KQL", async () => {
      const response = (await client.api("/search/query").post({
        requests: [
          { entityTypes: ["event"], query: { queryString: 'subject:"sprint"' }, from: 0, size: 25 },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      expect(value).toHaveLength(1);
      const hits = value[0].hits as unknown[];
      expect(hits.length).toBeGreaterThan(0);
    });

    it("should return event with location and time", async () => {
      const response = (await client.api("/search/query").post({
        requests: [
          {
            entityTypes: ["event"],
            query: { queryString: "location:conference" },
            from: 0,
            size: 25,
          },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      const hits = value[0].hits as Array<Record<string, unknown>>;
      const resource = hits[0].resource as Record<string, unknown>;
      expect(resource).toHaveProperty("subject");
      expect(resource).toHaveProperty("location");
      expect(resource).toHaveProperty("start");
      expect(resource).toHaveProperty("end");
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
          { entityTypes: ["event"], query: { queryString: "nonexistent" }, from: 0, size: 25 },
        ],
      })) as Record<string, unknown>;

      const value = response.value as Array<Record<string, unknown>>;
      expect(value[0].total).toBe(0);
    });

    it("should handle 403 insufficient permissions", async () => {
      mswServer.use(
        http.post(`${GRAPH_BASE}/search/query`, () => {
          return HttpResponse.json(
            { error: { code: "Authorization_RequestDenied", message: "Insufficient privileges" } },
            { status: 403 },
          );
        }),
      );

      try {
        await client.api("/search/query").post({
          requests: [{ entityTypes: ["event"], query: { queryString: "test" } }],
        });
        expect.fail("Should have thrown");
      } catch (error) {
        const err = error as { statusCode: number };
        expect(err.statusCode).toBe(403);
      }
    });
  });
});
