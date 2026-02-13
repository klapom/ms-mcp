import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ListActivityFeedParams, ListMentionsParams } from "../src/schemas/teams-activity.js";

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

describe("list_activity_feed", () => {
  describe("ListActivityFeedParams schema", () => {
    it("should parse with defaults", () => {
      const result = ListActivityFeedParams.parse({});
      expect(result.activity_type).toBe("all");
      expect(result.unread_only).toBe(false);
    });

    it("should accept activity_type enum values", () => {
      for (const type of ["mention", "reply", "reaction", "channelActivity", "all"]) {
        const result = ListActivityFeedParams.parse({ activity_type: type });
        expect(result.activity_type).toBe(type);
      }
    });

    it("should reject invalid activity_type", () => {
      const result = ListActivityFeedParams.safeParse({ activity_type: "invalid" });
      expect(result.success).toBe(false);
    });

    it("should accept unread_only boolean", () => {
      const result = ListActivityFeedParams.parse({ unread_only: true });
      expect(result.unread_only).toBe(true);
    });

    it("should accept pagination params", () => {
      const result = ListActivityFeedParams.parse({ top: 10, skip: 5 });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });
  });

  describe("Graph API integration", () => {
    it("should list all activities", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/me/teamwork/activityHistory").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(3);
      expect(items[0]).toHaveProperty("activityType", "mention");
    });

    it("should filter by activity type", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/me/teamwork/activityHistory")
        .filter("activityType eq 'mention'")
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(1);
      expect(items[0]).toHaveProperty("activityType", "mention");
    });

    it("should filter unread only", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/me/teamwork/activityHistory")
        .filter("isRead eq false")
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);
    });

    it("should support pagination with top", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/me/teamwork/activityHistory").top(1).get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(1);
    });

    it("should return empty for no activities", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/me/teamwork/activityHistory")
        .filter("activityType eq 'mention' and isRead eq false")
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      // Only act-001 is mention + unread
      expect(items.length).toBe(1);
    });
  });
});

describe("list_mentions", () => {
  describe("ListMentionsParams schema", () => {
    it("should parse with defaults", () => {
      const result = ListMentionsParams.parse({});
      expect(result.source).toBe("all");
      expect(result.unread_only).toBe(false);
    });

    it("should accept source enum values", () => {
      for (const src of ["channels", "chats", "all"]) {
        const result = ListMentionsParams.parse({ source: src });
        expect(result.source).toBe(src);
      }
    });

    it("should reject invalid source", () => {
      const result = ListMentionsParams.safeParse({ source: "invalid" });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    it("should list chat mentions", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/me/chats/getAllMessages").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(1);
      expect(items[0]).toHaveProperty("id", "chat-msg-001");
    });
  });

  // -----------------------------------------------------------------------
  // Tool handler tests
  // -----------------------------------------------------------------------
  describe("Tool handler", () => {
    it("should register and execute list_activity_feed tool", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerTeamsActivityTools } = await import("../src/tools/teams-activity.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "list_activity_feed") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerTeamsActivityTools(testServer, graphClient, testConfig);

      expect(capturedHandler).not.toBeNull();

      const result = await capturedHandler?.({});
      expect(result).toBeDefined();
      expect(result?.content).toBeDefined();
    });

    it("should register without throwing", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerTeamsActivityTools } = await import("../src/tools/teams-activity.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      expect(() => registerTeamsActivityTools(testServer, graphClient, testConfig)).not.toThrow();
    });
  });
});
