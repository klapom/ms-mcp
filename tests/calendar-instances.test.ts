import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ListEventInstancesParams } from "../src/schemas/calendar-recurrence.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

function createTestGraphClientWithErrorMapping(): Client {
  const errorMapping = new ErrorMappingMiddleware();
  const httpHandler = new HTTPMessageHandler();
  errorMapping.setNext(httpHandler);
  return Client.initWithMiddleware({
    middleware: errorMapping,
    defaultVersion: "v1.0",
  });
}

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe("list_event_instances", () => {
  describe("ListEventInstancesParams schema", () => {
    it("should parse with series_master_id only", () => {
      const result = ListEventInstancesParams.parse({
        series_master_id: "evt-recurring-001",
      });
      expect(result.series_master_id).toBe("evt-recurring-001");
    });

    it("should parse with date filters", () => {
      const result = ListEventInstancesParams.parse({
        series_master_id: "evt-recurring-001",
        start_date_time: "2026-02-15T00:00:00Z",
        end_date_time: "2026-03-15T00:00:00Z",
      });
      expect(result.start_date_time).toBe("2026-02-15T00:00:00Z");
      expect(result.end_date_time).toBe("2026-03-15T00:00:00Z");
    });

    it("should reject missing series_master_id", () => {
      const result = ListEventInstancesParams.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject empty series_master_id", () => {
      const result = ListEventInstancesParams.safeParse({ series_master_id: "" });
      expect(result.success).toBe(false);
    });

    it("should parse with pagination params", () => {
      const result = ListEventInstancesParams.parse({
        series_master_id: "evt-001",
        top: 10,
        skip: 5,
      });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should list all instances", async () => {
      const result = (await client.api("/me/events/evt-recurring-001/instances").get()) as Record<
        string,
        unknown
      >;

      const items = result.value as Record<string, unknown>[];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].subject).toBe("Sprint Planning");
    });

    it("should filter by start_date_time", async () => {
      const result = (await client
        .api("/me/events/evt-recurring-001/instances")
        .query({ startDateTime: "2026-03-01T00:00:00.0000000" })
        .get()) as Record<string, unknown>;

      const items = result.value as Record<string, unknown>[];
      expect(items.length).toBeGreaterThan(0);
    });

    it("should include exception instances", async () => {
      const result = (await client.api("/me/events/evt-recurring-001/instances").get()) as Record<
        string,
        unknown
      >;

      const items = result.value as Record<string, unknown>[];
      const exception = items.find((i) => i.type === "exception");
      expect(exception).toBeDefined();
      expect(exception?.subject).toBe("Sprint Planning (Special)");
    });

    it("should include cancelled instances", async () => {
      const result = (await client.api("/me/events/evt-recurring-001/instances").get()) as Record<
        string,
        unknown
      >;

      const items = result.value as Record<string, unknown>[];
      const cancelled = items.find((i) => i.isCancelled === true);
      expect(cancelled).toBeDefined();
    });

    it("should return 404 for nonexistent series", async () => {
      const errClient = createTestGraphClientWithErrorMapping();
      try {
        await errClient.api("/me/events/nonexistent/instances").get();
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toHaveProperty("code", "NotFoundError");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Tool handler tests
  // -----------------------------------------------------------------------
  describe("Tool handler", () => {
    it("should register and execute list_event_instances tool", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerCalendarInstancesTools } = await import("../src/tools/calendar-instances.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "list_event_instances") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerCalendarInstancesTools(testServer, graphClient, testConfig);

      expect(capturedHandler).not.toBeNull();

      const result = await capturedHandler?.({
        series_master_id: "evt-001",
        start_date_time: "2026-02-01T00:00:00",
        end_date_time: "2026-03-01T00:00:00",
      });
      expect(result).toBeDefined();
      expect(result?.content).toBeDefined();
    });

    it("should register without throwing", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerCalendarInstancesTools } = await import("../src/tools/calendar-instances.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      expect(() =>
        registerCalendarInstancesTools(testServer, graphClient, testConfig),
      ).not.toThrow();
    });
  });
});
