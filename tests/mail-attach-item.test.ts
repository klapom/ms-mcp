import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { AttachItemParams } from "../src/schemas/file-upload.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("attach_item", () => {
  describe("AttachItemParams schema", () => {
    it("should parse with required fields", () => {
      const result = AttachItemParams.parse({
        message_id: "msg-001",
        item_type: "message",
        item_id: "item-001",
      });
      expect(result.message_id).toBe("msg-001");
      expect(result.item_type).toBe("message");
      expect(result.item_id).toBe("item-001");
      expect(result.confirm).toBe(false);
    });

    it("should accept valid item_type values", () => {
      const types = ["message", "event", "contact"] as const;
      for (const type of types) {
        const result = AttachItemParams.parse({
          message_id: "msg-001",
          item_type: type,
          item_id: "item-001",
        });
        expect(result.item_type).toBe(type);
      }
    });

    it("should accept optional name", () => {
      const result = AttachItemParams.parse({
        message_id: "msg-001",
        item_type: "message",
        item_id: "item-001",
        name: "Custom Name",
      });
      expect(result.name).toBe("Custom Name");
    });

    it("should reject invalid item_type", () => {
      const result = AttachItemParams.safeParse({
        message_id: "msg-001",
        item_type: "invalid",
        item_id: "item-001",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty message_id", () => {
      const result = AttachItemParams.safeParse({
        message_id: "",
        item_type: "message",
        item_id: "item-001",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty item_id", () => {
      const result = AttachItemParams.safeParse({
        message_id: "msg-001",
        item_type: "message",
        item_id: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch source message", async () => {
      // Use existing mock ID from mail.ts handlers
      const message = (await client.api("/me/messages/msg-001").get()) as Record<string, unknown>;
      expect(message.id).toBe("msg-001");
      expect(message.subject).toBeDefined();
    });

    it("should fetch source event", async () => {
      // Use existing mock ID from calendar.ts handlers
      const event = (await client.api("/me/events/evt-001").get()) as Record<string, unknown>;
      expect(event.id).toBe("evt-001");
      expect(event.subject).toBeDefined();
    });

    it("should fetch source contact", async () => {
      // Use existing mock ID from contacts.ts handlers
      const contact = (await client.api("/me/contacts/cnt-001").get()) as Record<string, unknown>;
      expect(contact.id).toBe("cnt-001");
      expect(contact.displayName).toBeDefined();
    });

    it("should attach itemAttachment", async () => {
      const result = (await client.api("/me/messages/msg-draft-001/attachments").post({
        "@odata.type": "#microsoft.graph.itemAttachment",
        name: "Embedded Email",
        item: {
          "@odata.type": "#microsoft.graph.message",
          subject: "Test Message",
        },
      })) as Record<string, unknown>;

      expect(result["@odata.type"]).toBe("#microsoft.graph.itemAttachment");
      expect(result.id).toBeDefined();
    });
  });
});
