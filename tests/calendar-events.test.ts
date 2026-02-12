import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { GetEventParams, ListEventsParams } from "../src/schemas/calendar.js";
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
// list_events
// ---------------------------------------------------------------------------

describe("list_events", () => {
  describe("ListEventsParams schema", () => {
    it("should parse with no params (all defaults)", () => {
      const result = ListEventsParams.parse({});
      expect(result.calendar_id).toBeUndefined();
      expect(result.filter).toBeUndefined();
      expect(result.orderby).toBeUndefined();
    });

    it("should accept optional calendar_id", () => {
      const result = ListEventsParams.parse({ calendar_id: "cal-123" });
      expect(result.calendar_id).toBe("cal-123");
    });

    it("should accept filter and orderby", () => {
      const result = ListEventsParams.parse({
        filter: "start/dateTime ge '2026-02-01T00:00:00Z'",
        orderby: "start/dateTime desc",
      });
      expect(result.filter).toBe("start/dateTime ge '2026-02-01T00:00:00Z'");
      expect(result.orderby).toBe("start/dateTime desc");
    });

    it("should accept pagination params", () => {
      const result = ListEventsParams.parse({ top: 10, skip: 5 });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should list events from default calendar", async () => {
      const response = (await client.api("/me/events").get()) as Record<string, unknown>;

      const events = response.value as Array<Record<string, unknown>>;
      expect(events).toHaveLength(3);
      expect(events[0]).toHaveProperty("subject", "Team Meeting");
      expect(events[1]).toHaveProperty("subject", "Company Holiday");
      expect(events[2]).toHaveProperty("subject", "Cancelled Standup");
    });

    it("should include start/end dateTime", async () => {
      const response = (await client.api("/me/events").get()) as Record<string, unknown>;

      const events = response.value as Array<Record<string, unknown>>;
      const event = events[0] as Record<string, unknown>;
      const start = event.start as Record<string, unknown>;
      expect(start).toHaveProperty("dateTime");
      expect(start).toHaveProperty("timeZone", "Europe/Berlin");
    });

    it("should identify all-day event", async () => {
      const response = (await client.api("/me/events").get()) as Record<string, unknown>;

      const events = response.value as Array<Record<string, unknown>>;
      const allDay = events.find((e) => e.isAllDay === true);
      expect(allDay).toBeDefined();
      expect(allDay).toHaveProperty("subject", "Company Holiday");
    });

    it("should identify cancelled event", async () => {
      const response = (await client.api("/me/events").get()) as Record<string, unknown>;

      const events = response.value as Array<Record<string, unknown>>;
      const cancelled = events.find((e) => e.isCancelled === true);
      expect(cancelled).toBeDefined();
      expect(cancelled).toHaveProperty("subject", "Cancelled Standup");
    });

    it("should list events from specific calendar", async () => {
      const response = (await client.api("/me/calendars/cal-project/events").get()) as Record<
        string,
        unknown
      >;

      const events = response.value as Array<Record<string, unknown>>;
      expect(events).toHaveLength(2);
      expect(events[0]).toHaveProperty("subject", "Sprint Review");
    });

    it("should list events via multi-tenant path", async () => {
      const userPath = resolveUserPath("user@tenant.com");
      const response = (await client.api(`${userPath}/events`).get()) as Record<string, unknown>;

      const events = response.value as Array<Record<string, unknown>>;
      expect(events).toHaveLength(1);
      expect(events[0]).toHaveProperty("subject", "Multi-tenant Meeting");
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 for nonexistent calendar", async () => {
      try {
        await errorClient.api("/me/calendars/nonexistent-cal/events").get();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// get_event
// ---------------------------------------------------------------------------

describe("get_event", () => {
  describe("GetEventParams schema", () => {
    it("should parse with required fields", () => {
      const result = GetEventParams.parse({ event_id: "evt-001" });
      expect(result.event_id).toBe("evt-001");
      expect(result.calendar_id).toBeUndefined();
    });

    it("should reject empty event_id", () => {
      expect(GetEventParams.safeParse({ event_id: "" }).success).toBe(false);
    });

    it("should accept optional calendar_id", () => {
      const result = GetEventParams.parse({
        event_id: "evt-001",
        calendar_id: "cal-123",
      });
      expect(result.calendar_id).toBe("cal-123");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should get full event detail", async () => {
      const response = (await client.api("/me/events/evt-001").get()) as Record<string, unknown>;

      expect(response).toHaveProperty("subject", "Team Meeting");
      expect(response).toHaveProperty("body");
      expect(response).toHaveProperty("attendees");
    });

    it("should include attendees with response status", async () => {
      const response = (await client.api("/me/events/evt-001").get()) as Record<string, unknown>;

      const attendees = response.attendees as Array<Record<string, unknown>>;
      expect(attendees).toHaveLength(3);
      const alice = attendees[0];
      expect(alice).toHaveProperty("type", "required");
      const status = alice.status as Record<string, unknown>;
      expect(status).toHaveProperty("response", "accepted");
    });

    it("should include online meeting info", async () => {
      const response = (await client.api("/me/events/evt-001").get()) as Record<string, unknown>;

      expect(response).toHaveProperty("isOnlineMeeting", true);
      const onlineMeeting = response.onlineMeeting as Record<string, unknown>;
      expect(onlineMeeting).toHaveProperty("joinUrl");
    });

    it("should include categories", async () => {
      const response = (await client.api("/me/events/evt-001").get()) as Record<string, unknown>;

      const categories = response.categories as string[];
      expect(categories).toContain("Project-X");
      expect(categories).toContain("Weekly");
    });

    it("should include body content", async () => {
      const response = (await client.api("/me/events/evt-001").get()) as Record<string, unknown>;

      const body = response.body as Record<string, unknown>;
      expect(body).toHaveProperty("contentType", "html");
      expect(body.content).toContain("project timeline");
    });

    it("should get event from specific calendar", async () => {
      const response = (await client
        .api("/me/calendars/cal-project/events/evt-001")
        .get()) as Record<string, unknown>;

      expect(response).toHaveProperty("subject", "Calendar-Specific Event");
    });

    it("should get event via multi-tenant path", async () => {
      const userPath = resolveUserPath("user@tenant.com");
      const response = (await client.api(`${userPath}/events/evt-001`).get()) as Record<
        string,
        unknown
      >;

      expect(response).toHaveProperty("id", "mt-evt-001");
    });

    it("should handle encoded event IDs in URL", async () => {
      // encodeURIComponent("evt-001") = "evt-001" (no special chars, but tests the URL path)
      // Use a more realistic test: event ID with + character
      const response = (await client
        .api(`/me/events/${encodeURIComponent("evt-001")}`)
        .get()) as Record<string, unknown>;

      expect(response).toHaveProperty("subject", "Team Meeting");
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 for nonexistent event", async () => {
      try {
        await errorClient.api("/me/events/nonexistent").get();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});
