import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { UpdateEventParams } from "../src/schemas/calendar-write.js";

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

describe("update_event", () => {
  describe("UpdateEventParams schema", () => {
    it("should parse with event_id only (handler validates fields)", () => {
      const result = UpdateEventParams.parse({ event_id: "evt-001" });
      expect(result.event_id).toBe("evt-001");
      expect(result.confirm).toBe(false);
    });

    it("should parse with subject update", () => {
      const result = UpdateEventParams.parse({
        event_id: "evt-001",
        subject: "Updated Subject",
        confirm: true,
      });
      expect(result.subject).toBe("Updated Subject");
    });

    it("should parse with multiple fields", () => {
      const result = UpdateEventParams.parse({
        event_id: "evt-001",
        subject: "New Title",
        location: "Room B",
        importance: "high",
        start: { dateTime: "2026-02-16T10:00:00", timeZone: "Europe/Berlin" },
      });
      expect(result.location).toBe("Room B");
      expect(result.start?.dateTime).toBe("2026-02-16T10:00:00");
    });

    it("should reject empty event_id", () => {
      const result = UpdateEventParams.safeParse({ event_id: "" });
      expect(result.success).toBe(false);
    });

    it("should reject missing event_id", () => {
      const result = UpdateEventParams.safeParse({ subject: "X" });
      expect(result.success).toBe(false);
    });

    it("should accept attendees update", () => {
      const result = UpdateEventParams.parse({
        event_id: "evt-001",
        attendees: [{ email: "new@example.com", type: "optional" }],
      });
      expect(result.attendees).toHaveLength(1);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should patch event with new subject", async () => {
      const result = (await client
        .api("/me/events/evt-001")
        .patch({ subject: "Patched" })) as Record<string, unknown>;

      expect(result.id).toBe("evt-001");
      expect(result.subject).toBe("Patched");
    });

    it("should return 404 for nonexistent event", async () => {
      const errorClient = createTestGraphClientWithErrorMapping();
      await expect(
        errorClient.api("/me/events/nonexistent").patch({ subject: "X" }),
      ).rejects.toThrow();
    });
  });
});
