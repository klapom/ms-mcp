import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { GetCalendarViewParams } from "../src/schemas/calendar.js";
import { resolveUserPath } from "../src/schemas/common.js";

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
// get_calendar_view
// ---------------------------------------------------------------------------

describe("get_calendar_view", () => {
  describe("GetCalendarViewParams schema", () => {
    it("should parse with required fields", () => {
      const result = GetCalendarViewParams.parse({
        start_date_time: "2026-02-12T00:00:00Z",
        end_date_time: "2026-02-19T00:00:00Z",
      });
      expect(result.start_date_time).toBe("2026-02-12T00:00:00Z");
      expect(result.end_date_time).toBe("2026-02-19T00:00:00Z");
      expect(result.calendar_id).toBeUndefined();
    });

    it("should reject missing start_date_time", () => {
      expect(
        GetCalendarViewParams.safeParse({ end_date_time: "2026-02-19T00:00:00Z" }).success,
      ).toBe(false);
    });

    it("should reject missing end_date_time", () => {
      expect(
        GetCalendarViewParams.safeParse({ start_date_time: "2026-02-12T00:00:00Z" }).success,
      ).toBe(false);
    });

    it("should reject empty start_date_time", () => {
      expect(
        GetCalendarViewParams.safeParse({
          start_date_time: "",
          end_date_time: "2026-02-19T00:00:00Z",
        }).success,
      ).toBe(false);
    });

    it("should accept optional calendar_id", () => {
      const result = GetCalendarViewParams.parse({
        start_date_time: "2026-02-12T00:00:00Z",
        end_date_time: "2026-02-19T00:00:00Z",
        calendar_id: "cal-project",
      });
      expect(result.calendar_id).toBe("cal-project");
    });

    it("should accept pagination params", () => {
      const result = GetCalendarViewParams.parse({
        start_date_time: "2026-02-12T00:00:00Z",
        end_date_time: "2026-02-19T00:00:00Z",
        top: 50,
        skip: 10,
      });
      expect(result.top).toBe(50);
      expect(result.skip).toBe(10);
    });

    it("should reject non-ISO datetime for start_date_time", () => {
      expect(
        GetCalendarViewParams.safeParse({
          start_date_time: "not-a-date",
          end_date_time: "2026-02-19T00:00:00Z",
        }).success,
      ).toBe(false);
    });

    it("should reject non-ISO datetime for end_date_time", () => {
      expect(
        GetCalendarViewParams.safeParse({
          start_date_time: "2026-02-12T00:00:00Z",
          end_date_time: "2026-99-99",
        }).success,
      ).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should return events in time window", async () => {
      const response = (await client
        .api("/me/calendarView")
        .query({ startDateTime: "2026-02-12T00:00:00Z", endDateTime: "2026-02-19T00:00:00Z" })
        .get()) as Record<string, unknown>;

      const events = response.value as Array<Record<string, unknown>>;
      expect(events).toHaveLength(3);
    });

    it("should include recurring event occurrences", async () => {
      const response = (await client
        .api("/me/calendarView")
        .query({ startDateTime: "2026-02-12T00:00:00Z", endDateTime: "2026-02-19T00:00:00Z" })
        .get()) as Record<string, unknown>;

      const events = response.value as Array<Record<string, unknown>>;
      const recurring = events.find((e) => e.subject === "Daily Standup");
      expect(recurring).toBeDefined();
    });

    it("should get calendar view from specific calendar", async () => {
      const response = (await client
        .api("/me/calendars/cal-project/calendarView")
        .query({ startDateTime: "2026-02-12T00:00:00Z", endDateTime: "2026-02-19T00:00:00Z" })
        .get()) as Record<string, unknown>;

      const events = response.value as Array<Record<string, unknown>>;
      expect(events).toHaveLength(1);
      expect(events[0]).toHaveProperty("subject", "Sprint Review");
    });

    it("should get calendar view via multi-tenant path", async () => {
      const userPath = resolveUserPath("user@tenant.com");
      const response = (await client
        .api(`${userPath}/calendarView`)
        .query({ startDateTime: "2026-02-12T00:00:00Z", endDateTime: "2026-02-19T00:00:00Z" })
        .get()) as Record<string, unknown>;

      const events = response.value as Array<Record<string, unknown>>;
      expect(events).toHaveLength(1);
      expect(events[0]).toHaveProperty("subject", "MT Calendar View Event");
    });

    it("should pass pagination parameters in query", async () => {
      const response = (await client
        .api("/me/calendarView")
        .query({ startDateTime: "2026-02-12T00:00:00Z", endDateTime: "2026-02-19T00:00:00Z" })
        .top(2)
        .skip(1)
        .get()) as Record<string, unknown>;

      // Handler returns events regardless of top/skip (MSW doesn't filter)
      // This verifies the request is constructed correctly without errors
      const events = response.value as Array<Record<string, unknown>>;
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should return 400 for missing date parameters", async () => {
      try {
        await errorClient.api("/me/calendarView").get();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "ValidationError");
      }
    });
  });
});
