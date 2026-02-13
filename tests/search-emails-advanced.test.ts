import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { AdvancedSearchEmailsParams } from "../src/schemas/search-advanced.js";
import { server as mswServer } from "./mocks/server.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

const testConfig: Config = {
  limits: { maxItems: 100, maxBodyLength: 50000 },
  auth: { clientId: "test-client", tenantId: "test-tenant" },
  logging: { level: "silent" },
  cache: { tokenCachePath: "/tmp/test-cache.json" },
};

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

  // -----------------------------------------------------------------------
  // Tool handler tests
  // -----------------------------------------------------------------------
  describe("Tool handler", () => {
    it("should register and execute advanced_search_emails tool", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerAdvancedSearchEmailsTools } = await import(
        "../src/tools/search-emails-advanced.js"
      );

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      // Capture registered tool
      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "advanced_search_emails") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerAdvancedSearchEmailsTools(testServer, graphClient, testConfig);

      expect(capturedHandler).not.toBeNull();

      // Invoke the handler
      const result = await capturedHandler?.({ kql_query: "from:john@example.com" });
      expect(result).toBeDefined();
      expect(result?.content).toBeDefined();
      expect(result?.content[0]).toHaveProperty("type", "text");
      const text = (result?.content[0] as { text: string }).text;
      expect(text).toContain("Found");
      expect(text).toContain("email");
    });

    it("should handle search with no results", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerAdvancedSearchEmailsTools } = await import(
        "../src/tools/search-emails-advanced.js"
      );

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "advanced_search_emails") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerAdvancedSearchEmailsTools(testServer, graphClient, testConfig);

      // Override MSW to return empty results
      mswServer.use(
        http.post(`${GRAPH_BASE}/search/query`, () => {
          return HttpResponse.json({
            value: [{ hits: [], total: 0, moreResultsAvailable: false }],
          });
        }),
      );

      const result = await capturedHandler?.({ kql_query: "nonexistent_xyz" });
      expect(result?.content[0]).toHaveProperty("type", "text");
      const text = (result?.content[0] as { text: string }).text;
      expect(text).toContain("No results");
    });

    it("should handle search with pagination", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerAdvancedSearchEmailsTools } = await import(
        "../src/tools/search-emails-advanced.js"
      );

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "advanced_search_emails") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerAdvancedSearchEmailsTools(testServer, graphClient, testConfig);

      // Override MSW to return results with moreResultsAvailable
      mswServer.use(
        http.post(`${GRAPH_BASE}/search/query`, () => {
          return HttpResponse.json({
            value: [
              {
                hits: [
                  {
                    hitId: "msg-001",
                    rank: 1,
                    summary: "test summary",
                    resource: {
                      id: "msg-001",
                      subject: "Test Email",
                      from: { emailAddress: { name: "John", address: "john@example.com" } },
                      receivedDateTime: "2026-02-10T09:00:00Z",
                      bodyPreview: "Preview text",
                    },
                  },
                ],
                total: 100,
                moreResultsAvailable: true,
              },
            ],
          });
        }),
      );

      const result = await capturedHandler?.({ kql_query: "test", from: 0, size: 25 });
      const text = (result?.content[0] as { text: string }).text;
      expect(text).toContain("more available");
      expect(text).toContain("from: 25");
    });

    it("should handle Graph API errors", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerAdvancedSearchEmailsTools } = await import(
        "../src/tools/search-emails-advanced.js"
      );

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "advanced_search_emails") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerAdvancedSearchEmailsTools(testServer, graphClient, testConfig);

      // Trigger 400 error with invalid KQL - should throw
      await expect(capturedHandler?.({ kql_query: "INVALID_KQL_SYNTAX!!!" })).rejects.toThrow();
    });

    it("should handle sort options", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerAdvancedSearchEmailsTools } = await import(
        "../src/tools/search-emails-advanced.js"
      );

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "advanced_search_emails") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerAdvancedSearchEmailsTools(testServer, graphClient, testConfig);

      const result = await capturedHandler?.({
        kql_query: "test",
        sort: [{ property: "receivedDateTime", direction: "descending" }],
      });
      expect(result?.content).toBeDefined();
    });
  });
});
