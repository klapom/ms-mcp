import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ListChatMessagesParams, SendChatMessageParams } from "../src/schemas/teams.js";

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

describe("list_chat_messages", () => {
  describe("ListChatMessagesParams schema", () => {
    it("should parse with required fields", () => {
      const result = ListChatMessagesParams.parse({ chat_id: "chat-001" });
      expect(result.chat_id).toBe("chat-001");
    });

    it("should reject empty chat_id", () => {
      const result = ListChatMessagesParams.safeParse({ chat_id: "" });
      expect(result.success).toBe(false);
    });

    it("should reject missing chat_id", () => {
      const result = ListChatMessagesParams.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should parse with pagination", () => {
      const result = ListChatMessagesParams.parse({ chat_id: "c1", top: 30 });
      expect(result.top).toBe(30);
    });
  });

  describe("Graph API integration", () => {
    it("should list chat messages", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/me/chats/chat-001/messages").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);
      expect(items[0]).toHaveProperty("id", "cmsg-001");
    });

    it("should return 404 for nonexistent chat", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(client.api("/me/chats/nonexistent/messages").get()).rejects.toThrow();
    });
  });
});

describe("send_chat_message", () => {
  describe("SendChatMessageParams schema", () => {
    it("should parse with required fields", () => {
      const result = SendChatMessageParams.parse({
        chat_id: "chat-001",
        content: "Hello!",
      });
      expect(result.chat_id).toBe("chat-001");
      expect(result.content_type).toBe("text");
      expect(result.confirm).toBe(false);
    });

    it("should parse with all fields", () => {
      const result = SendChatMessageParams.parse({
        chat_id: "c1",
        content: "<b>Bold</b>",
        content_type: "html",
        confirm: true,
        idempotency_key: "key-1",
      });
      expect(result.content_type).toBe("html");
      expect(result.confirm).toBe(true);
    });

    it("should reject empty content", () => {
      const result = SendChatMessageParams.safeParse({ chat_id: "c1", content: "" });
      expect(result.success).toBe(false);
    });

    it("should reject missing chat_id", () => {
      const result = SendChatMessageParams.safeParse({ content: "Hi" });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    it("should send a chat message", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/me/chats/chat-001/messages").post({
        body: { contentType: "text", content: "Hello" },
      })) as Record<string, unknown>;
      expect(response).toHaveProperty("id", "new-cmsg-001");
    });

    it("should return 404 for nonexistent chat", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(
        client.api("/me/chats/nonexistent/messages").post({
          body: { contentType: "text", content: "test" },
        }),
      ).rejects.toThrow();
    });
  });
});
