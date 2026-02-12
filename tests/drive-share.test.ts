import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ShareFileParams } from "../src/schemas/drive-write.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("share_file", () => {
  describe("ShareFileParams schema", () => {
    it("should parse with required fields", () => {
      const result = ShareFileParams.parse({
        file_id: "file-001",
        link_type: "view",
        scope: "organization",
      });
      expect(result.file_id).toBe("file-001");
      expect(result.link_type).toBe("view");
      expect(result.scope).toBe("organization");
      expect(result.confirm).toBe(false);
    });

    it("should accept edit link type", () => {
      const result = ShareFileParams.parse({
        file_id: "file-001",
        link_type: "edit",
        scope: "organization",
      });
      expect(result.link_type).toBe("edit");
    });

    it("should accept anonymous scope", () => {
      const result = ShareFileParams.parse({
        file_id: "file-001",
        link_type: "view",
        scope: "anonymous",
      });
      expect(result.scope).toBe("anonymous");
    });

    it("should reject invalid link_type", () => {
      const result = ShareFileParams.safeParse({
        file_id: "file-001",
        link_type: "admin",
        scope: "organization",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid scope", () => {
      const result = ShareFileParams.safeParse({
        file_id: "file-001",
        link_type: "view",
        scope: "public",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty file_id", () => {
      const result = ShareFileParams.safeParse({
        file_id: "",
        link_type: "view",
        scope: "organization",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should create sharing link (200)", async () => {
      const result = (await client.api("/me/drive/items/file-001/createLink").post({
        type: "view",
        scope: "organization",
      })) as Record<string, unknown>;
      expect(result.link).toBeDefined();
      const link = result.link as Record<string, unknown>;
      expect(link.webUrl).toBeDefined();
    });

    it("should create edit link", async () => {
      const result = (await client.api("/me/drive/items/file-001/createLink").post({
        type: "edit",
        scope: "organization",
      })) as Record<string, unknown>;
      const link = result.link as Record<string, unknown>;
      expect(link.type).toBe("edit");
    });

    it("should create anonymous link", async () => {
      const result = (await client.api("/me/drive/items/file-001/createLink").post({
        type: "view",
        scope: "anonymous",
      })) as Record<string, unknown>;
      const link = result.link as Record<string, unknown>;
      expect(link.scope).toBe("anonymous");
    });
  });
});
