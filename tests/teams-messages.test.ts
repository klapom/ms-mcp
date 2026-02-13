import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ListChannelMessagesParams } from "../src/schemas/teams.js";

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

describe("list_channel_messages", () => {
  describe("ListChannelMessagesParams schema", () => {
    it("should parse with required fields", () => {
      const result = ListChannelMessagesParams.parse({
        team_id: "team-001",
        channel_id: "channel-001",
      });
      expect(result.team_id).toBe("team-001");
      expect(result.channel_id).toBe("channel-001");
    });

    it("should reject missing team_id", () => {
      const result = ListChannelMessagesParams.safeParse({ channel_id: "ch1" });
      expect(result.success).toBe(false);
    });

    it("should reject missing channel_id", () => {
      const result = ListChannelMessagesParams.safeParse({ team_id: "t1" });
      expect(result.success).toBe(false);
    });

    it("should reject empty team_id", () => {
      const result = ListChannelMessagesParams.safeParse({ team_id: "", channel_id: "ch1" });
      expect(result.success).toBe(false);
    });

    it("should parse with pagination", () => {
      const result = ListChannelMessagesParams.parse({
        team_id: "t1",
        channel_id: "ch1",
        top: 50,
        skip: 10,
      });
      expect(result.top).toBe(50);
      expect(result.skip).toBe(10);
    });
  });

  describe("Graph API integration", () => {
    it("should list channel messages", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/teams/team-001/channels/channel-001/messages")
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);
      expect(items[0]).toHaveProperty("id", "msg-001");
      expect(items[1]).toHaveProperty("importance", "high");
    });

    it("should return 404 for nonexistent channel", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(
        client.api("/teams/team-001/channels/nonexistent/messages").get(),
      ).rejects.toThrow();
    });
  });
});
