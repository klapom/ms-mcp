import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { RespondToEventParams } from "../src/schemas/calendar-write.js";
import { ValidationError } from "../src/utils/errors.js";

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

describe("respond_to_event", () => {
  describe("RespondToEventParams schema", () => {
    it("should parse with required fields", () => {
      const result = RespondToEventParams.parse({
        event_id: "evt-001",
        action: "accept",
      });
      expect(result.event_id).toBe("evt-001");
      expect(result.action).toBe("accept");
      expect(result.send_response).toBe(true);
      expect(result.confirm).toBe(false);
    });

    it("should accept all actions", () => {
      for (const action of ["accept", "decline", "tentativelyAccept"] as const) {
        const result = RespondToEventParams.parse({ event_id: "evt-001", action });
        expect(result.action).toBe(action);
      }
    });

    it("should accept optional comment", () => {
      const result = RespondToEventParams.parse({
        event_id: "evt-001",
        action: "decline",
        comment: "Cannot attend",
      });
      expect(result.comment).toBe("Cannot attend");
    });

    it("should reject comment over 1000 chars", () => {
      const result = RespondToEventParams.safeParse({
        event_id: "evt-001",
        action: "accept",
        comment: "x".repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid action", () => {
      const result = RespondToEventParams.safeParse({
        event_id: "evt-001",
        action: "maybe",
      });
      expect(result.success).toBe(false);
    });

    it("should allow send_response=false", () => {
      const result = RespondToEventParams.parse({
        event_id: "evt-001",
        action: "accept",
        send_response: false,
      });
      expect(result.send_response).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should accept event (202)", async () => {
      const result = await client.api("/me/events/evt-001/accept").post({ sendResponse: true });
      expect(result).toBeNull();
    });

    it("should decline event (202)", async () => {
      const result = await client
        .api("/me/events/evt-001/decline")
        .post({ sendResponse: true, comment: "Sorry" });
      expect(result).toBeNull();
    });

    it("should tentatively accept event (202)", async () => {
      const result = await client
        .api("/me/events/evt-001/tentativelyAccept")
        .post({ sendResponse: true });
      expect(result).toBeNull();
    });

    it("should return 403 for organizer event", async () => {
      const errorClient = createTestGraphClientWithErrorMapping();
      await expect(
        errorClient.api("/me/events/organizer-evt/accept").post({ sendResponse: true }),
      ).rejects.toThrow();
    });
  });

  describe("isOrganizer guard", () => {
    it("should detect isOrganizer from GET event (preview precondition)", async () => {
      const client = createTestGraphClient();
      // The default detailEvent in MSW has isOrganizer: true
      const event = (await client.api("/me/events/evt-001").get()) as Record<string, unknown>;
      expect(event.isOrganizer).toBe(true);
    });

    it("should construct ValidationError for organizer", () => {
      const error = new ValidationError(
        "Sie sind der Organisator dieses Events und können nicht antworten.",
      );
      expect(error.httpStatus).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
    });
  });
});
