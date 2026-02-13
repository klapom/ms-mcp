import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { AdvancedSearchContactsParams } from "../src/schemas/search-advanced.js";
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

  // -----------------------------------------------------------------------
  // Tool handler tests
  // -----------------------------------------------------------------------
  describe("Tool handler", () => {
    it("should register and execute advanced_search_contacts tool", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerAdvancedSearchContactsTools } = await import(
        "../src/tools/search-contacts-advanced.js"
      );

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "advanced_search_contacts") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerAdvancedSearchContactsTools(testServer, graphClient, testConfig);

      expect(capturedHandler).not.toBeNull();

      const result = await capturedHandler?.({ kql_query: "displayName:john" });
      expect(result).toBeDefined();
      expect(result?.content).toBeDefined();
    });

    it("should register without throwing", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerAdvancedSearchContactsTools } = await import(
        "../src/tools/search-contacts-advanced.js"
      );

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      expect(() =>
        registerAdvancedSearchContactsTools(testServer, graphClient, testConfig),
      ).not.toThrow();
    });
  });
});
