import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { DeleteEventParams } from "../src/schemas/calendar-write.js";

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

describe("delete_event", () => {
  describe("DeleteEventParams schema", () => {
    it("should parse with required fields", () => {
      const result = DeleteEventParams.parse({ event_id: "evt-001" });
      expect(result.event_id).toBe("evt-001");
      expect(result.confirm).toBe(false);
    });

    it("should accept calendar_id", () => {
      const result = DeleteEventParams.parse({
        event_id: "evt-001",
        calendar_id: "cal-123",
        confirm: true,
      });
      expect(result.calendar_id).toBe("cal-123");
    });

    it("should reject empty event_id", () => {
      const result = DeleteEventParams.safeParse({ event_id: "" });
      expect(result.success).toBe(false);
    });

    it("should reject missing event_id", () => {
      const result = DeleteEventParams.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should delete event successfully (204)", async () => {
      // Graph client .delete() returns undefined for 204
      const result = await client.api("/me/events/evt-001").delete();
      expect(result).toBeUndefined();
    });

    it("should return 404 for nonexistent event", async () => {
      const errorClient = createTestGraphClientWithErrorMapping();
      await expect(errorClient.api("/me/events/nonexistent").delete()).rejects.toThrow();
    });
  });
});
