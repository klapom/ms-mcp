import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { resolveUserPath } from "../src/schemas/common.js";
import { MoveEmailParams } from "../src/schemas/mail.js";
import { server as mswServer } from "./mocks/server.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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
// Tests
// ---------------------------------------------------------------------------

describe("move_email", () => {
  // -----------------------------------------------------------------------
  // Schema tests
  // -----------------------------------------------------------------------
  describe("MoveEmailParams schema", () => {
    it("should parse with required fields only", () => {
      const result = MoveEmailParams.parse({
        message_id: "msg-001",
        destination_folder: "archive",
      });
      expect(result.message_id).toBe("msg-001");
      expect(result.destination_folder).toBe("archive");
      expect(result.confirm).toBe(false);
      expect(result.dry_run).toBe(false);
    });

    it("should parse with all parameters", () => {
      const result = MoveEmailParams.parse({
        message_id: "msg-001",
        destination_folder: "archive",
        confirm: true,
        dry_run: false,
        idempotency_key: "move-key-1",
        user_id: "user@example.com",
      });
      expect(result.confirm).toBe(true);
      expect(result.dry_run).toBe(false);
      expect(result.idempotency_key).toBe("move-key-1");
      expect(result.user_id).toBe("user@example.com");
    });

    it("should reject empty message_id", () => {
      const result = MoveEmailParams.safeParse({
        message_id: "",
        destination_folder: "archive",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty destination_folder", () => {
      const result = MoveEmailParams.safeParse({
        message_id: "msg-001",
        destination_folder: "",
      });
      expect(result.success).toBe(false);
    });

    it("should have WriteParams fields (idempotency_key, confirm)", () => {
      const result = MoveEmailParams.parse({
        message_id: "msg-001",
        destination_folder: "archive",
        idempotency_key: "k",
        confirm: true,
      });
      expect(result.idempotency_key).toBe("k");
      expect(result.confirm).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Graph API integration tests (MSW-backed)
  // -----------------------------------------------------------------------
  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should move an email and return new ID (200)", async () => {
      const response = (await client.api("/me/messages/msg-001/move").post({
        destinationId: "archive",
      })) as Record<string, unknown>;
      expect(response).toHaveProperty("id", "new-msg-001");
      expect(response).toHaveProperty("parentFolderId", "archive");
    });

    it("should fetch message for preview context", async () => {
      const response = await client
        .api("/me/messages/msg-001")
        .select("subject,parentFolderId")
        .get();
      expect(response).toHaveProperty("subject");
      expect(response).toHaveProperty("parentFolderId");
    });

    it("should resolve folder name for preview", async () => {
      const response = await client.api("/me/mailFolders/inbox").select("displayName").get();
      expect(response).toHaveProperty("displayName", "Inbox");
    });

    it("should move via multi-tenant path", async () => {
      const userPath = resolveUserPath("user@tenant.com");
      const response = (await client.api(`${userPath}/messages/msg-001/move`).post({
        destinationId: "archive",
      })) as Record<string, unknown>;
      expect(response).toHaveProperty("id", "new-msg-001");
    });
  });

  // -----------------------------------------------------------------------
  // Error responses
  // -----------------------------------------------------------------------
  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 for nonexistent message to NotFoundError", async () => {
      try {
        await errorClient.api("/me/messages/nonexistent/move").post({
          destinationId: "archive",
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });

    it("should map 403 for missing Mail.ReadWrite to AuthError", async () => {
      try {
        await errorClient.api("/me/messages/forbidden-msg/move").post({
          destinationId: "archive",
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "AuthError");
      }
    });

    it("should map 400 for invalid folder to ValidationError", async () => {
      try {
        await errorClient.api("/me/messages/msg-001/move").post({
          destinationId: "invalid-folder",
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "ValidationError");
      }
    });
  });

  // -----------------------------------------------------------------------
  // dry_run logic
  // -----------------------------------------------------------------------
  describe("dry_run precedence", () => {
    it("should treat dry_run=true+confirm=true as preview", () => {
      const parsed = MoveEmailParams.parse({
        message_id: "msg-001",
        destination_folder: "archive",
        dry_run: true,
        confirm: true,
      });
      // dry_run overrides confirm → should preview
      expect(parsed.dry_run || !parsed.confirm).toBe(true);
    });

    it("should treat dry_run=true+confirm=false as preview", () => {
      const parsed = MoveEmailParams.parse({
        message_id: "msg-001",
        destination_folder: "archive",
        dry_run: true,
        confirm: false,
      });
      expect(parsed.dry_run || !parsed.confirm).toBe(true);
    });

    it("should treat dry_run=false+confirm=false as preview", () => {
      const parsed = MoveEmailParams.parse({
        message_id: "msg-001",
        destination_folder: "archive",
        dry_run: false,
        confirm: false,
      });
      expect(parsed.dry_run || !parsed.confirm).toBe(true);
    });

    it("should only execute when dry_run=false+confirm=true", () => {
      const parsed = MoveEmailParams.parse({
        message_id: "msg-001",
        destination_folder: "archive",
        dry_run: false,
        confirm: true,
      });
      expect(parsed.dry_run || !parsed.confirm).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Request body capture
  // -----------------------------------------------------------------------
  describe("request body construction", () => {
    let client: Client;
    let capturedBody: Record<string, unknown> | null;

    beforeEach(() => {
      client = createTestGraphClient();
      capturedBody = null;

      mswServer.use(
        http.post(
          "https://graph.microsoft.com/v1.0/me/messages/:messageId/move",
          async ({ request }) => {
            capturedBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json({
              id: "new-msg-captured",
              parentFolderId: "target",
            });
          },
        ),
      );
    });

    it("should send move with destinationId", async () => {
      await client.api("/me/messages/msg-001/move").post({
        destinationId: "archive",
      });
      expect(capturedBody).toEqual({ destinationId: "archive" });
    });
  });
});
