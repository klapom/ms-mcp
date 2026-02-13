import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ReplyToChannelMessageParams, SendChannelMessageParams } from "../src/schemas/teams.js";

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

describe("send_channel_message", () => {
  describe("SendChannelMessageParams schema", () => {
    it("should parse with required fields", () => {
      const result = SendChannelMessageParams.parse({
        team_id: "team-001",
        channel_id: "channel-001",
        content: "Hello!",
      });
      expect(result.team_id).toBe("team-001");
      expect(result.content_type).toBe("html");
      expect(result.importance).toBe("normal");
      expect(result.confirm).toBe(false);
    });

    it("should parse with all fields", () => {
      const result = SendChannelMessageParams.parse({
        team_id: "t1",
        channel_id: "ch1",
        content: "<b>Bold</b>",
        content_type: "text",
        importance: "urgent",
        confirm: true,
        idempotency_key: "key-1",
      });
      expect(result.content_type).toBe("text");
      expect(result.importance).toBe("urgent");
      expect(result.confirm).toBe(true);
      expect(result.idempotency_key).toBe("key-1");
    });

    it("should reject empty content", () => {
      const result = SendChannelMessageParams.safeParse({
        team_id: "t1",
        channel_id: "ch1",
        content: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing team_id", () => {
      const result = SendChannelMessageParams.safeParse({
        channel_id: "ch1",
        content: "Hi",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid importance", () => {
      const result = SendChannelMessageParams.safeParse({
        team_id: "t1",
        channel_id: "ch1",
        content: "Hi",
        importance: "critical",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    it("should send a channel message", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/teams/team-001/channels/channel-001/messages").post({
        body: { contentType: "html", content: "<p>Hello</p>" },
        importance: "normal",
      })) as Record<string, unknown>;
      expect(response).toHaveProperty("id", "new-msg-001");
    });

    it("should return 404 for nonexistent team", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(
        client.api("/teams/nonexistent/channels/ch1/messages").post({
          body: { contentType: "text", content: "test" },
        }),
      ).rejects.toThrow();
    });
  });
});

describe("reply_to_channel_message", () => {
  describe("ReplyToChannelMessageParams schema", () => {
    it("should parse with required fields", () => {
      const result = ReplyToChannelMessageParams.parse({
        team_id: "t1",
        channel_id: "ch1",
        message_id: "msg-001",
        content: "Reply text",
      });
      expect(result.message_id).toBe("msg-001");
      expect(result.content_type).toBe("html");
      expect(result.confirm).toBe(false);
    });

    it("should reject empty message_id", () => {
      const result = ReplyToChannelMessageParams.safeParse({
        team_id: "t1",
        channel_id: "ch1",
        message_id: "",
        content: "Reply",
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing content", () => {
      const result = ReplyToChannelMessageParams.safeParse({
        team_id: "t1",
        channel_id: "ch1",
        message_id: "m1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    it("should reply to a channel message", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/teams/team-001/channels/channel-001/messages/msg-001/replies")
        .post({
          body: { contentType: "text", content: "My reply" },
        })) as Record<string, unknown>;
      expect(response).toHaveProperty("id", "reply-001");
    });

    it("should return 404 for nonexistent message", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(
        client
          .api("/teams/team-001/channels/channel-001/messages/nonexistent/replies")
          .post({ body: { contentType: "text", content: "test" } }),
      ).rejects.toThrow();
    });
  });
});
