import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ListCalendarsParams } from "../src/schemas/calendar.js";
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
// list_calendars
// ---------------------------------------------------------------------------

describe("list_calendars", () => {
  describe("ListCalendarsParams schema", () => {
    it("should parse with no params (all defaults)", () => {
      const result = ListCalendarsParams.parse({});
      expect(result.user_id).toBeUndefined();
      expect(result.top).toBeUndefined();
      expect(result.skip).toBeUndefined();
    });

    it("should accept optional user_id", () => {
      const result = ListCalendarsParams.parse({ user_id: "user@tenant.com" });
      expect(result.user_id).toBe("user@tenant.com");
    });

    it("should accept pagination params", () => {
      const result = ListCalendarsParams.parse({ top: 10, skip: 5 });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should list multiple calendars", async () => {
      const response = (await client.api("/me/calendars").get()) as Record<string, unknown>;

      const calendars = response.value as Array<Record<string, unknown>>;
      expect(calendars).toHaveLength(3);
      expect(calendars[0]).toHaveProperty("name", "Calendar");
      expect(calendars[1]).toHaveProperty("name", "Project Calendar");
      expect(calendars[2]).toHaveProperty("name", "Team Calendar");
    });

    it("should identify default calendar", async () => {
      const response = (await client.api("/me/calendars").get()) as Record<string, unknown>;

      const calendars = response.value as Array<Record<string, unknown>>;
      const defaultCal = calendars.find((c) => c.isDefaultCalendar === true);
      expect(defaultCal).toBeDefined();
      expect(defaultCal).toHaveProperty("name", "Calendar");
    });

    it("should include owner information", async () => {
      const response = (await client.api("/me/calendars").get()) as Record<string, unknown>;

      const calendars = response.value as Array<Record<string, unknown>>;
      const owner = calendars[0].owner as Record<string, unknown>;
      expect(owner).toHaveProperty("address", "test@example.com");
    });

    it("should include permissions (canEdit, canShare)", async () => {
      const response = (await client.api("/me/calendars").get()) as Record<string, unknown>;

      const calendars = response.value as Array<Record<string, unknown>>;
      // Shared calendar is readOnly
      expect(calendars[2]).toHaveProperty("canEdit", false);
      expect(calendars[2]).toHaveProperty("canShare", false);
    });

    it("should list calendars via multi-tenant path", async () => {
      const userPath = resolveUserPath("user@tenant.com");
      const response = (await client.api(`${userPath}/calendars`).get()) as Record<string, unknown>;

      const calendars = response.value as Array<Record<string, unknown>>;
      expect(calendars).toHaveLength(1);
      expect(calendars[0]).toHaveProperty("id", "cal-mt-default");
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 for nonexistent calendar events", async () => {
      try {
        await errorClient.api("/me/calendars/nonexistent-cal/events").get();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});
