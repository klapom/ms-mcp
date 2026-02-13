import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ShareCalendarParams } from "../src/schemas/calendar-sharing.js";

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
// Schema tests
// ---------------------------------------------------------------------------

describe("share_calendar", () => {
  describe("ShareCalendarParams schema", () => {
    it("should parse with required fields", () => {
      const result = ShareCalendarParams.parse({
        recipient_email: "john@example.com",
        role: "read",
      });
      expect(result.recipient_email).toBe("john@example.com");
      expect(result.role).toBe("read");
      expect(result.confirm).toBe(false);
      expect(result.send_invitation).toBe(true);
    });

    it("should parse all roles", () => {
      const roles = [
        "freeBusyRead",
        "limitedRead",
        "read",
        "write",
        "delegateWithoutPrivateEventAccess",
        "delegateWithPrivateEventAccess",
      ] as const;

      for (const role of roles) {
        const result = ShareCalendarParams.parse({
          recipient_email: "john@example.com",
          role,
        });
        expect(result.role).toBe(role);
      }
    });

    it("should reject invalid email", () => {
      const result = ShareCalendarParams.safeParse({
        recipient_email: "not-an-email",
        role: "read",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid role", () => {
      const result = ShareCalendarParams.safeParse({
        recipient_email: "john@example.com",
        role: "admin",
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing recipient_email", () => {
      const result = ShareCalendarParams.safeParse({ role: "read" });
      expect(result.success).toBe(false);
    });

    it("should parse with send_invitation false", () => {
      const result = ShareCalendarParams.parse({
        recipient_email: "john@example.com",
        role: "read",
        send_invitation: false,
      });
      expect(result.send_invitation).toBe(false);
    });

    it("should parse with idempotency_key", () => {
      const result = ShareCalendarParams.parse({
        recipient_email: "john@example.com",
        role: "write",
        idempotency_key: "share-key-1",
        confirm: true,
      });
      expect(result.idempotency_key).toBe("share-key-1");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should share with read permission", async () => {
      const result = (await client.api("/me/calendar/calendarPermissions").post({
        emailAddress: { address: "john@example.com", name: "John Doe" },
        role: "read",
      })) as Record<string, unknown>;

      expect(result.id).toBeDefined();
      expect(result.role).toBe("read");
    });

    it("should share with write permission", async () => {
      const result = (await client.api("/me/calendar/calendarPermissions").post({
        emailAddress: { address: "john@example.com" },
        role: "write",
      })) as Record<string, unknown>;

      expect(result.role).toBe("write");
    });

    it("should share with delegate permission", async () => {
      const result = (await client.api("/me/calendar/calendarPermissions").post({
        emailAddress: { address: "john@example.com" },
        role: "delegateWithPrivateEventAccess",
      })) as Record<string, unknown>;

      expect(result.role).toBe("delegateWithPrivateEventAccess");
    });

    it("should return permission ID", async () => {
      const result = (await client.api("/me/calendar/calendarPermissions").post({
        emailAddress: { address: "john@example.com" },
        role: "read",
      })) as Record<string, unknown>;

      expect(typeof result.id).toBe("string");
      expect(result.id).toBeTruthy();
    });
  });
});
