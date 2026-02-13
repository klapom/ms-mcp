import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import { ListChatsParams } from "../src/schemas/teams.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("list_chats", () => {
  describe("ListChatsParams schema", () => {
    it("should parse with no params", () => {
      const result = ListChatsParams.parse({});
      expect(result.chat_type).toBeUndefined();
    });

    it("should parse with chat_type filter", () => {
      const result = ListChatsParams.parse({ chat_type: "oneOnOne" });
      expect(result.chat_type).toBe("oneOnOne");
    });

    it("should accept group chat type", () => {
      const result = ListChatsParams.parse({ chat_type: "group" });
      expect(result.chat_type).toBe("group");
    });

    it("should accept meeting chat type", () => {
      const result = ListChatsParams.parse({ chat_type: "meeting" });
      expect(result.chat_type).toBe("meeting");
    });

    it("should reject invalid chat_type", () => {
      const result = ListChatsParams.safeParse({ chat_type: "invalid" });
      expect(result.success).toBe(false);
    });

    it("should parse with pagination", () => {
      const result = ListChatsParams.parse({ top: 10, skip: 5 });
      expect(result.top).toBe(10);
    });
  });

  describe("Graph API integration", () => {
    it("should list all chats", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/me/chats").get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);
      expect(items[0]).toHaveProperty("chatType", "oneOnOne");
      expect(items[1]).toHaveProperty("topic", "Project Alpha");
    });

    it("should filter by chat type", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/me/chats")
        .filter("chatType eq 'oneOnOne'")
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(1);
      expect(items[0]).toHaveProperty("chatType", "oneOnOne");
    });
  });
});
