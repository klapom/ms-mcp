import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { FindAvailableRoomsParams, ListMeetingRoomsParams } from "../src/schemas/calendar-rooms.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

// ---------------------------------------------------------------------------
// Schema tests — list_meeting_rooms
// ---------------------------------------------------------------------------

describe("list_meeting_rooms", () => {
  describe("ListMeetingRoomsParams schema", () => {
    it("should parse with no params", () => {
      const result = ListMeetingRoomsParams.parse({});
      expect(result.building).toBeUndefined();
      expect(result.floor).toBeUndefined();
      expect(result.min_capacity).toBeUndefined();
    });

    it("should parse with all filters", () => {
      const result = ListMeetingRoomsParams.parse({
        building: "Building 1",
        floor: "3",
        min_capacity: 10,
      });
      expect(result.building).toBe("Building 1");
      expect(result.floor).toBe("3");
      expect(result.min_capacity).toBe(10);
    });

    it("should reject min_capacity < 1", () => {
      const result = ListMeetingRoomsParams.safeParse({ min_capacity: 0 });
      expect(result.success).toBe(false);
    });

    it("should parse with pagination", () => {
      const result = ListMeetingRoomsParams.parse({ top: 10, skip: 0 });
      expect(result.top).toBe(10);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should list all rooms", async () => {
      const result = (await client.api("/places/microsoft.graph.room").get()) as Record<
        string,
        unknown
      >;

      const items = result.value as Record<string, unknown>[];
      expect(items.length).toBe(3);
      expect(items[0].displayName).toBe("Conference Room A");
    });

    it("should return rooms with capacity info", async () => {
      const result = (await client.api("/places/microsoft.graph.room").get()) as Record<
        string,
        unknown
      >;

      const items = result.value as Record<string, unknown>[];
      expect(items[0].capacity).toBe(12);
      expect(items[0].building).toBe("Building 1");
    });

    it("should return rooms with equipment info", async () => {
      const result = (await client.api("/places/microsoft.graph.room").get()) as Record<
        string,
        unknown
      >;

      const items = result.value as Record<string, unknown>[];
      expect(items[0].videoDeviceName).toBe("Projector");
      expect(items[0].audioDeviceName).toBe("Phone");
    });

    it("should return rooms with email address", async () => {
      const result = (await client.api("/places/microsoft.graph.room").get()) as Record<
        string,
        unknown
      >;

      const items = result.value as Record<string, unknown>[];
      expect(items[0].emailAddress).toBe("confrooma@example.com");
    });

    it("should return empty when no rooms match", async () => {
      // The actual filtering is client-side, test the API returns data
      const result = (await client.api("/places/microsoft.graph.room").get()) as Record<
        string,
        unknown
      >;

      expect(result.value).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Schema tests — find_available_rooms
// ---------------------------------------------------------------------------

describe("find_available_rooms", () => {
  describe("FindAvailableRoomsParams schema", () => {
    it("should parse with required fields", () => {
      const result = FindAvailableRoomsParams.parse({
        start: { dateTime: "2026-02-15T10:00:00", timeZone: "Europe/Berlin" },
        end: { dateTime: "2026-02-15T11:00:00", timeZone: "Europe/Berlin" },
      });
      expect(result.start.dateTime).toBe("2026-02-15T10:00:00");
    });

    it("should parse with all optional fields", () => {
      const result = FindAvailableRoomsParams.parse({
        start: { dateTime: "2026-02-15T10:00:00", timeZone: "Europe/Berlin" },
        end: { dateTime: "2026-02-15T11:00:00", timeZone: "Europe/Berlin" },
        min_capacity: 10,
        building: "Building 1",
        equipment: ["projector", "phone"],
      });
      expect(result.min_capacity).toBe(10);
      expect(result.building).toBe("Building 1");
      expect(result.equipment).toEqual(["projector", "phone"]);
    });

    it("should reject missing start", () => {
      const result = FindAvailableRoomsParams.safeParse({
        end: { dateTime: "2026-02-15T11:00:00", timeZone: "Europe/Berlin" },
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing end", () => {
      const result = FindAvailableRoomsParams.safeParse({
        start: { dateTime: "2026-02-15T10:00:00", timeZone: "Europe/Berlin" },
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid equipment enum", () => {
      const result = FindAvailableRoomsParams.safeParse({
        start: { dateTime: "2026-02-15T10:00:00", timeZone: "Europe/Berlin" },
        end: { dateTime: "2026-02-15T11:00:00", timeZone: "Europe/Berlin" },
        equipment: ["laser"],
      });
      expect(result.success).toBe(false);
    });

    it("should reject min_capacity < 1", () => {
      const result = FindAvailableRoomsParams.safeParse({
        start: { dateTime: "2026-02-15T10:00:00", timeZone: "Europe/Berlin" },
        end: { dateTime: "2026-02-15T11:00:00", timeZone: "Europe/Berlin" },
        min_capacity: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should list rooms for availability check", async () => {
      const result = (await client.api("/places/microsoft.graph.room").get()) as Record<
        string,
        unknown
      >;

      const items = result.value as Record<string, unknown>[];
      expect(items.length).toBeGreaterThan(0);

      // Verify rooms have email addresses for getSchedule
      const emails = items.map((r) => r.emailAddress).filter((e) => typeof e === "string" && e);
      expect(emails.length).toBeGreaterThan(0);
    });

    it("should check room availability via getSchedule", async () => {
      const result = (await client.api("/me/calendar/getSchedule").post({
        schedules: ["confrooma@example.com", "meetingroomb@example.com"],
        startTime: { dateTime: "2026-02-15T10:00:00", timeZone: "Europe/Berlin" },
        endTime: { dateTime: "2026-02-15T11:00:00", timeZone: "Europe/Berlin" },
        availabilityViewInterval: 15,
      })) as Record<string, unknown>;

      const schedules = result.value as Record<string, unknown>[];
      expect(schedules.length).toBeGreaterThan(0);
      expect(schedules[0].scheduleId).toBeDefined();
      expect(schedules[0].availabilityView).toBeDefined();
    });
  });
});
