import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { CreateEventParams } from "../src/schemas/calendar-write.js";

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

const validParams = {
  subject: "Sprint Review",
  start: { dateTime: "2026-02-15T10:00:00", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-02-15T11:00:00", timeZone: "Europe/Berlin" },
};

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe("create_event", () => {
  describe("CreateEventParams schema", () => {
    it("should parse with required fields only", () => {
      const result = CreateEventParams.parse(validParams);
      expect(result.subject).toBe("Sprint Review");
      expect(result.start.dateTime).toBe("2026-02-15T10:00:00");
      expect(result.confirm).toBe(false);
      expect(result.is_all_day).toBe(false);
      expect(result.is_online_meeting).toBe(false);
      expect(result.importance).toBe("normal");
      expect(result.sensitivity).toBe("normal");
      expect(result.show_as).toBe("busy");
      expect(result.body_type).toBe("text");
    });

    it("should parse with all optional fields", () => {
      const result = CreateEventParams.parse({
        ...validParams,
        location: "Conf Room A",
        body: "Agenda here",
        body_type: "html",
        attendees: [
          { email: "alice@example.com", name: "Alice", type: "required" },
          { email: "bob@example.com" },
        ],
        is_all_day: true,
        is_online_meeting: true,
        importance: "high",
        sensitivity: "private",
        show_as: "tentative",
        categories: ["Project-X"],
        reminder_minutes_before_start: 15,
        calendar_id: "cal-123",
        confirm: true,
        idempotency_key: "key-1",
        user_id: "user@example.com",
      });
      expect(result.location).toBe("Conf Room A");
      expect(result.attendees).toHaveLength(2);
      expect(result.attendees?.[1]?.type).toBe("required"); // default
      expect(result.categories).toEqual(["Project-X"]);
      expect(result.reminder_minutes_before_start).toBe(15);
    });

    it("should reject missing subject", () => {
      const result = CreateEventParams.safeParse({
        start: validParams.start,
        end: validParams.end,
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty subject", () => {
      const result = CreateEventParams.safeParse({ ...validParams, subject: "" });
      expect(result.success).toBe(false);
    });

    it("should reject invalid attendee email", () => {
      const result = CreateEventParams.safeParse({
        ...validParams,
        attendees: [{ email: "not-an-email" }],
      });
      expect(result.success).toBe(false);
    });

    it("should reject negative reminder", () => {
      const result = CreateEventParams.safeParse({
        ...validParams,
        reminder_minutes_before_start: -5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should create event on default calendar", async () => {
      const result = (await client.api("/me/events").post({
        subject: "Test Event",
        start: validParams.start,
        end: validParams.end,
      })) as Record<string, unknown>;

      expect(result.id).toBe("evt-new-001");
      expect(result.subject).toBe("Test Event");
    });

    it("should create event on specific calendar", async () => {
      const result = (await client
        .api("/me/calendars/cal-123/events")
        .post({ subject: "Cal Event" })) as Record<string, unknown>;

      expect(result.id).toBe("evt-cal-new");
    });

    it("should create event for multi-tenant user", async () => {
      const result = (await client
        .api("/users/user@tenant.com/events")
        .post({ subject: "MT Event" })) as Record<string, unknown>;

      expect(result.id).toBe("evt-mt-new");
    });
  });
});
