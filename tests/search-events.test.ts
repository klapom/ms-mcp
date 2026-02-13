import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { SearchEventsParams } from "../src/schemas/search-advanced.js";
import { server as mswServer } from "./mocks/server.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const testConfig: Config = {
  limits: { maxItems: 100, maxBodyLength: 50000 },
  auth: { clientId: "test-client", tenantId: "test-tenant" },
  logging: { level: "silent" },
  cache: { tokenCachePath: "/tmp/test-cache.json" },
};

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

  // -----------------------------------------------------------------------
  // Tool handler tests
  // -----------------------------------------------------------------------
  describe("Tool handler", () => {
    it("should register and execute search_events tool", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerSearchEventsTools } = await import("../src/tools/search-events.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "search_events") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerSearchEventsTools(testServer, graphClient, testConfig);

      expect(capturedHandler).not.toBeNull();

      const result = await capturedHandler?.({ kql_query: 'subject:"sprint"' });
      expect(result).toBeDefined();
      expect(result?.content).toBeDefined();
    });

    it("should register without throwing", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerSearchEventsTools } = await import("../src/tools/search-events.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      expect(() => registerSearchEventsTools(testServer, graphClient, testConfig)).not.toThrow();
    });
  });
});
