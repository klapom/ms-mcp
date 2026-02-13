import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { AttachReferenceParams } from "../src/schemas/file-upload.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("attach_reference", () => {
  describe("AttachReferenceParams schema", () => {
    it("should parse with required fields", () => {
      const result = AttachReferenceParams.parse({
        message_id: "msg-001",
        file_id: "file-001",
      });
      expect(result.message_id).toBe("msg-001");
      expect(result.file_id).toBe("file-001");
      expect(result.confirm).toBe(false);
      expect(result.permission_type).toBe("view");
    });

    it("should accept permission_type values", () => {
      const permissions = ["view", "edit"] as const;
      for (const permission of permissions) {
        const result = AttachReferenceParams.parse({
          message_id: "msg-001",
          file_id: "file-001",
          permission_type: permission,
        });
        expect(result.permission_type).toBe(permission);
      }
    });

    it("should accept optional name", () => {
      const result = AttachReferenceParams.parse({
        message_id: "msg-001",
        file_id: "file-001",
        name: "Shared Document",
      });
      expect(result.name).toBe("Shared Document");
    });

    it("should reject empty message_id", () => {
      const result = AttachReferenceParams.safeParse({
        message_id: "",
        file_id: "file-001",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty file_id", () => {
      const result = AttachReferenceParams.safeParse({
        message_id: "msg-001",
        file_id: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch file metadata", async () => {
      const file = (await client
        .api("/me/drive/items/file-001")
        .select("id,name,size")
        .get()) as Record<string, unknown>;
      expect(file.name).toBeDefined();
    });

    it("should create sharing link", async () => {
      const result = (await client.api("/me/drive/items/file-001/createLink").post({
        type: "view",
        scope: "organization",
      })) as Record<string, unknown>;

      expect(result.link).toBeDefined();
      const link = result.link as Record<string, unknown>;
      expect(link.webUrl).toBeDefined();
    });

    it("should create edit sharing link", async () => {
      const result = (await client.api("/me/drive/items/file-001/createLink").post({
        type: "edit",
        scope: "organization",
      })) as Record<string, unknown>;

      const link = result.link as Record<string, unknown>;
      expect(link.type).toBe("edit");
    });

    it("should attach referenceAttachment", async () => {
      const result = (await client.api("/me/messages/msg-draft-001/attachments").post({
        "@odata.type": "#microsoft.graph.referenceAttachment",
        name: "Shared File",
        sourceUrl: "https://onedrive.example.com/share/file-001",
        permission: "view",
        providerType: "oneDriveConsumer",
      })) as Record<string, unknown>;

      expect(result["@odata.type"]).toBe("#microsoft.graph.referenceAttachment");
      expect(result.id).toBeDefined();
    });
  });
});
