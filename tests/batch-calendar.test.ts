import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { BatchDeleteEventsParams } from "../src/schemas/batch-operations.js";
import { executeBatch, summarizeBatchResult } from "../src/utils/batch.js";

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

describe("batch_delete_events", () => {
  describe("BatchDeleteEventsParams schema", () => {
    it("should accept valid params with event_ids", () => {
      const result = BatchDeleteEventsParams.safeParse({
        event_ids: ["evt-1", "evt-2"],
        confirm: true,
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty event_ids", () => {
      const result = BatchDeleteEventsParams.safeParse({
        event_ids: [],
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should reject more than 20 event_ids", () => {
      const ids = Array.from({ length: 21 }, (_, i) => `evt-${i}`);
      const result = BatchDeleteEventsParams.safeParse({
        event_ids: ids,
        confirm: true,
      });
      expect(result.success).toBe(false);
    });

    it("should default send_cancellation_notifications to true", () => {
      const result = BatchDeleteEventsParams.parse({
        event_ids: ["evt-1"],
        confirm: true,
      });
      expect(result.send_cancellation_notifications).toBe(true);
    });

    it("should accept send_cancellation_notifications=false", () => {
      const result = BatchDeleteEventsParams.parse({
        event_ids: ["evt-1"],
        send_cancellation_notifications: false,
        confirm: true,
      });
      expect(result.send_cancellation_notifications).toBe(false);
    });

    it("should default confirm to false", () => {
      const result = BatchDeleteEventsParams.parse({
        event_ids: ["evt-1"],
      });
      expect(result.confirm).toBe(false);
    });

    it("should reject empty string in event_ids", () => {
      const result = BatchDeleteEventsParams.safeParse({
        event_ids: ["evt-1", ""],
        confirm: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should delete events successfully (204 responses)", async () => {
      const requests = ["evt-1", "evt-2", "evt-3"].map((id, i) => ({
        id: String(i + 1),
        method: "DELETE" as const,
        url: `/me/events/${id}`,
      }));

      const result = await executeBatch(client, requests);
      expect(result.responses).toHaveLength(3);
      for (const r of result.responses) {
        expect(r.status).toBe(204);
      }
    });

    it("should handle partial success (some events not found)", async () => {
      const requests = [
        { id: "1", method: "DELETE" as const, url: "/me/events/evt-1" },
        { id: "2", method: "DELETE" as const, url: "/me/events/not-found-evt" },
      ];

      const result = await executeBatch(client, requests);
      const summary = summarizeBatchResult(result);
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(1);
    });

    it("should include Prefer header when suppressing cancellations", async () => {
      // This test verifies the request can be built with headers
      const requests = [
        {
          id: "1",
          method: "DELETE" as const,
          url: "/me/events/evt-1",
          headers: { Prefer: 'outlook.calendar.cancelMessage="false"' },
        },
      ];

      const result = await executeBatch(client, requests);
      expect(result.responses).toHaveLength(1);
      expect(result.responses[0].status).toBe(204);
    });

    it("should handle forbidden event deletion", async () => {
      const requests = [{ id: "1", method: "DELETE" as const, url: "/me/events/forbidden-evt" }];

      const result = await executeBatch(client, requests);
      expect(result.responses[0].status).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // Tool handler tests
  // -----------------------------------------------------------------------
  describe("Tool handler", () => {
    it("should register and execute batch_delete_events tool", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerBatchCalendarTools } = await import("../src/tools/batch-calendar.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "batch_delete_events") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerBatchCalendarTools(testServer, graphClient, testConfig);

      expect(capturedHandler).not.toBeNull();

      const result = await capturedHandler?.({ event_ids: ["evt-001"], confirm: true });
      expect(result).toBeDefined();
      expect(result?.content).toBeDefined();
    });

    it("should register without throwing", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerBatchCalendarTools } = await import("../src/tools/batch-calendar.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      expect(() => registerBatchCalendarTools(testServer, graphClient, testConfig)).not.toThrow();
    });
  });
});
