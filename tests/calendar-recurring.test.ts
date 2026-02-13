import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import {
  CreateRecurringEventParams,
  RecurrencePattern,
  RecurrenceRange,
  UpdateEventSeriesParams,
} from "../src/schemas/calendar-recurrence.js";

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

const validRecurrencePattern = {
  type: "weekly" as const,
  interval: 2,
  days_of_week: ["tuesday" as const, "thursday" as const],
};

const validRecurrenceRange = {
  type: "numbered" as const,
  start_date: "2026-02-15",
  number_of_occurrences: 10,
};

const validParams = {
  subject: "Sprint Planning",
  start: { dateTime: "2026-02-15T10:00:00", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-02-15T11:00:00", timeZone: "Europe/Berlin" },
  recurrence_pattern: validRecurrencePattern,
  recurrence_range: validRecurrenceRange,
};

// ---------------------------------------------------------------------------
// Schema tests — create_recurring_event
// ---------------------------------------------------------------------------

describe("create_recurring_event", () => {
  describe("CreateRecurringEventParams schema", () => {
    it("should parse with required fields only", () => {
      const result = CreateRecurringEventParams.parse(validParams);
      expect(result.subject).toBe("Sprint Planning");
      expect(result.recurrence_pattern.type).toBe("weekly");
      expect(result.recurrence_range.type).toBe("numbered");
      expect(result.confirm).toBe(false);
      expect(result.body_type).toBe("text");
    });

    it("should parse with all optional fields", () => {
      const result = CreateRecurringEventParams.parse({
        ...validParams,
        location: "Conf Room A",
        body: "Agenda here",
        body_type: "html",
        attendees: [{ email: "alice@example.com", name: "Alice" }],
        is_reminder_on: true,
        reminder_minutes_before_start: 15,
        is_online_meeting: true,
        confirm: true,
        idempotency_key: "key-1",
      });
      expect(result.location).toBe("Conf Room A");
      expect(result.attendees).toHaveLength(1);
      expect(result.is_online_meeting).toBe(true);
    });

    it("should reject missing subject", () => {
      const result = CreateRecurringEventParams.safeParse({
        start: validParams.start,
        end: validParams.end,
        recurrence_pattern: validRecurrencePattern,
        recurrence_range: validRecurrenceRange,
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty subject", () => {
      const result = CreateRecurringEventParams.safeParse({ ...validParams, subject: "" });
      expect(result.success).toBe(false);
    });

    it("should reject invalid attendee email", () => {
      const result = CreateRecurringEventParams.safeParse({
        ...validParams,
        attendees: [{ email: "not-an-email" }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("RecurrencePattern schema", () => {
    it("should parse daily pattern", () => {
      const result = RecurrencePattern.parse({ type: "daily", interval: 1 });
      expect(result.type).toBe("daily");
      expect(result.interval).toBe(1);
      expect(result.first_day_of_week).toBe("monday");
    });

    it("should parse weekly pattern with days", () => {
      const result = RecurrencePattern.parse({
        type: "weekly",
        interval: 2,
        days_of_week: ["monday", "wednesday", "friday"],
      });
      expect(result.days_of_week).toHaveLength(3);
    });

    it("should parse absoluteMonthly pattern", () => {
      const result = RecurrencePattern.parse({
        type: "absoluteMonthly",
        interval: 1,
        day_of_month: 15,
      });
      expect(result.day_of_month).toBe(15);
    });

    it("should parse absoluteYearly pattern", () => {
      const result = RecurrencePattern.parse({
        type: "absoluteYearly",
        interval: 1,
        day_of_month: 14,
        month: 2,
      });
      expect(result.month).toBe(2);
      expect(result.day_of_month).toBe(14);
    });

    it("should parse relativeMonthly pattern with index", () => {
      const result = RecurrencePattern.parse({
        type: "relativeMonthly",
        interval: 1,
        days_of_week: ["monday"],
        index: "first",
      });
      expect(result.index).toBe("first");
    });

    it("should reject invalid type", () => {
      const result = RecurrencePattern.safeParse({ type: "biweekly", interval: 1 });
      expect(result.success).toBe(false);
    });

    it("should reject interval > 99", () => {
      const result = RecurrencePattern.safeParse({ type: "daily", interval: 100 });
      expect(result.success).toBe(false);
    });

    it("should reject interval < 1", () => {
      const result = RecurrencePattern.safeParse({ type: "daily", interval: 0 });
      expect(result.success).toBe(false);
    });
  });

  describe("RecurrenceRange schema", () => {
    it("should parse endDate range", () => {
      const result = RecurrenceRange.parse({
        type: "endDate",
        start_date: "2026-02-15",
        end_date: "2026-12-31",
      });
      expect(result.type).toBe("endDate");
      expect(result.end_date).toBe("2026-12-31");
    });

    it("should parse noEnd range", () => {
      const result = RecurrenceRange.parse({
        type: "noEnd",
        start_date: "2026-02-15",
      });
      expect(result.type).toBe("noEnd");
    });

    it("should parse numbered range", () => {
      const result = RecurrenceRange.parse({
        type: "numbered",
        start_date: "2026-02-15",
        number_of_occurrences: 10,
      });
      expect(result.number_of_occurrences).toBe(10);
    });

    it("should reject invalid range type", () => {
      const result = RecurrenceRange.safeParse({ type: "infinite", start_date: "2026-02-15" });
      expect(result.success).toBe(false);
    });

    it("should reject occurrences > 999", () => {
      const result = RecurrenceRange.safeParse({
        type: "numbered",
        start_date: "2026-02-15",
        number_of_occurrences: 1000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should create daily recurring event", async () => {
      const result = (await client.api("/me/events").post({
        subject: "Daily Standup",
        start: validParams.start,
        end: validParams.end,
        recurrence: {
          pattern: { type: "daily", interval: 1 },
          range: { type: "endDate", startDate: "2026-02-15", endDate: "2026-02-28" },
        },
      })) as Record<string, unknown>;

      expect(result.id).toBeDefined();
      expect(result.subject).toBe("Daily Standup");
    });

    it("should create weekly recurring event", async () => {
      const result = (await client.api("/me/events").post({
        subject: "Sprint Planning",
        start: validParams.start,
        end: validParams.end,
        recurrence: {
          pattern: { type: "weekly", interval: 2, daysOfWeek: ["tuesday", "thursday"] },
          range: { type: "numbered", startDate: "2026-02-15", numberOfOccurrences: 10 },
        },
      })) as Record<string, unknown>;

      expect(result.id).toBeDefined();
      expect(result.subject).toBe("Sprint Planning");
    });

    it("should create monthly recurring event", async () => {
      const result = (await client.api("/me/events").post({
        subject: "Monthly Review",
        recurrence: {
          pattern: { type: "absoluteMonthly", interval: 1, dayOfMonth: 1 },
          range: { type: "noEnd", startDate: "2026-02-01" },
        },
      })) as Record<string, unknown>;

      expect(result.id).toBeDefined();
      expect(result.subject).toBe("Monthly Review");
    });

    it("should create yearly recurring event", async () => {
      const result = (await client.api("/me/events").post({
        subject: "Anniversary",
        recurrence: {
          pattern: { type: "absoluteYearly", interval: 1, dayOfMonth: 14, month: 2 },
          range: { type: "numbered", startDate: "2026-02-14", numberOfOccurrences: 5 },
        },
      })) as Record<string, unknown>;

      expect(result.id).toBeDefined();
      expect(result.subject).toBe("Anniversary");
    });
  });
});

// ---------------------------------------------------------------------------
// Schema tests — update_event_series
// ---------------------------------------------------------------------------

describe("update_event_series", () => {
  describe("UpdateEventSeriesParams schema", () => {
    it("should parse with series_master_id and subject", () => {
      const result = UpdateEventSeriesParams.parse({
        series_master_id: "evt-recurring-001",
        subject: "New Subject",
      });
      expect(result.series_master_id).toBe("evt-recurring-001");
      expect(result.subject).toBe("New Subject");
      expect(result.confirm).toBe(false);
    });

    it("should reject missing series_master_id", () => {
      const result = UpdateEventSeriesParams.safeParse({ subject: "Test" });
      expect(result.success).toBe(false);
    });

    it("should reject empty series_master_id", () => {
      const result = UpdateEventSeriesParams.safeParse({
        series_master_id: "",
        subject: "Test",
      });
      expect(result.success).toBe(false);
    });

    it("should parse with recurrence_pattern update", () => {
      const result = UpdateEventSeriesParams.parse({
        series_master_id: "evt-001",
        recurrence_pattern: { type: "daily", interval: 1 },
      });
      expect(result.recurrence_pattern?.type).toBe("daily");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should update series subject", async () => {
      const result = (await client
        .api("/me/events/evt-recurring-001")
        .patch({ subject: "Updated Sprint Planning" })) as Record<string, unknown>;

      expect(result.subject).toBe("Updated Sprint Planning");
    });

    it("should update series time", async () => {
      const newStart = { dateTime: "2026-02-15T14:00:00", timeZone: "Europe/Berlin" };
      const newEnd = { dateTime: "2026-02-15T15:00:00", timeZone: "Europe/Berlin" };

      const result = (await client
        .api("/me/events/evt-recurring-001")
        .patch({ start: newStart, end: newEnd })) as Record<string, unknown>;

      expect(result.id).toBe("evt-recurring-001");
    });

    it("should return 404 for nonexistent series", async () => {
      const errClient = createTestGraphClientWithErrorMapping();
      try {
        await errClient.api("/me/events/nonexistent").patch({ subject: "Test" });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});
