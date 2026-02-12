import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { CheckAvailabilityParams } from "../src/schemas/calendar-write.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

const validParams = {
  schedules: ["alice@example.com", "bob@example.com"],
  start: { dateTime: "2026-02-15T08:00:00", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-02-15T17:00:00", timeZone: "Europe/Berlin" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("check_availability", () => {
  describe("CheckAvailabilityParams schema", () => {
    it("should parse with required fields", () => {
      const result = CheckAvailabilityParams.parse(validParams);
      expect(result.schedules).toHaveLength(2);
      expect(result.availability_view_interval).toBe(30);
    });

    it("should accept custom interval", () => {
      const result = CheckAvailabilityParams.parse({
        ...validParams,
        availability_view_interval: 15,
      });
      expect(result.availability_view_interval).toBe(15);
    });

    it("should reject empty schedules", () => {
      const result = CheckAvailabilityParams.safeParse({
        ...validParams,
        schedules: [],
      });
      expect(result.success).toBe(false);
    });

    it("should reject more than 20 schedules", () => {
      const result = CheckAvailabilityParams.safeParse({
        ...validParams,
        schedules: Array.from({ length: 21 }, (_, i) => `user${i}@example.com`),
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid email in schedules", () => {
      const result = CheckAvailabilityParams.safeParse({
        ...validParams,
        schedules: ["not-an-email"],
      });
      expect(result.success).toBe(false);
    });

    it("should accept user_id for multi-tenant", () => {
      const result = CheckAvailabilityParams.parse({
        ...validParams,
        user_id: "admin@tenant.com",
      });
      expect(result.user_id).toBe("admin@tenant.com");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should get schedule data", async () => {
      const result = (await client.api("/me/calendar/getSchedule").post({
        schedules: validParams.schedules,
        startTime: validParams.start,
        endTime: validParams.end,
        availabilityViewInterval: 30,
      })) as Record<string, unknown>;

      const schedules = result.value as Array<Record<string, unknown>>;
      expect(schedules).toHaveLength(2);
      expect(schedules[0]?.scheduleId).toBe("alice@example.com");
      expect(schedules[0]?.availabilityView).toBe("0012200");
      expect(schedules[1]?.scheduleId).toBe("bob@example.com");
    });

    it("should work for multi-tenant", async () => {
      const result = (await client.api("/users/admin@tenant.com/calendar/getSchedule").post({
        schedules: ["alice@example.com"],
        startTime: validParams.start,
        endTime: validParams.end,
        availabilityViewInterval: 30,
      })) as Record<string, unknown>;

      const schedules = result.value as Array<Record<string, unknown>>;
      expect(schedules).toHaveLength(2);
    });
  });
});
