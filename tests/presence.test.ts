/**
 * Tests for Presence Tools (Sprint 9.4)
 */

import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import {
  GetMyPresenceParams,
  GetPresenceParams,
  SetStatusMessageParams,
} from "../src/schemas/presence.js";

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

describe("get_my_presence", () => {
  describe("GetMyPresenceParams schema", () => {
    it("should parse with no parameters", () => {
      const result = GetMyPresenceParams.parse({});
      expect(result.user_id).toBeUndefined();
    });

    it("should parse with user_id", () => {
      const result = GetMyPresenceParams.parse({
        user_id: "user@example.com",
      });
      expect(result.user_id).toBe("user@example.com");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should retrieve current user presence", async () => {
      const result = (await client.api("/me/presence").get()) as Record<string, unknown>;

      expect(result.availability).toBe("Available");
      expect(result.activity).toBe("Available");
    });

    it("should retrieve specific user presence", async () => {
      const result = (await client.api("/users/user1@example.com/presence").get()) as Record<
        string,
        unknown
      >;

      expect(result.availability).toBe("Available");
    });
  });
});

describe("get_presence", () => {
  describe("GetPresenceParams schema", () => {
    it("should require user_id", () => {
      expect(() => GetPresenceParams.parse({})).toThrow();
    });

    it("should reject empty user_id", () => {
      expect(() => GetPresenceParams.parse({ user_id: "" })).toThrow();
    });

    it("should parse valid user_id", () => {
      const result = GetPresenceParams.parse({
        user_id: "user@example.com",
      });
      expect(result.user_id).toBe("user@example.com");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should retrieve user presence by ID", async () => {
      const result = (await client.api("/users/user1@example.com/presence").get()) as Record<
        string,
        unknown
      >;

      expect(result.id).toBe("user1@example.com");
      expect(result.availability).toBeDefined();
    });

    it("should handle user without status message", async () => {
      const result = (await client.api("/users/user2@example.com/presence").get()) as Record<
        string,
        unknown
      >;

      expect(result.availability).toBe("Busy");
      expect(result.activity).toBe("InACall");
    });
  });
});

describe("set_status_message", () => {
  describe("SetStatusMessageParams schema", () => {
    it("should parse with defaults", () => {
      const result = SetStatusMessageParams.parse({});
      expect(result.confirm).toBe(false);
      expect(result.message).toBeUndefined();
      expect(result.expires_at).toBeUndefined();
    });

    it("should parse with message and expiration", () => {
      const result = SetStatusMessageParams.parse({
        message: "Working from home",
        expires_at: "2026-02-20T17:00:00Z",
        confirm: true,
        idempotency_key: "test-key",
      });

      expect(result.message).toBe("Working from home");
      expect(result.expires_at).toBe("2026-02-20T17:00:00Z");
      expect(result.confirm).toBe(true);
      expect(result.idempotency_key).toBe("test-key");
    });

    it("should reject message longer than 280 chars", () => {
      expect(() =>
        SetStatusMessageParams.parse({
          message: "a".repeat(281),
        }),
      ).toThrow();
    });

    it("should reject invalid datetime format", () => {
      expect(() =>
        SetStatusMessageParams.parse({
          expires_at: "not-a-date",
        }),
      ).toThrow();
    });

    it("should accept valid ISO 8601 datetime", () => {
      const result = SetStatusMessageParams.parse({
        expires_at: "2026-02-20T17:00:00Z",
      });
      expect(result.expires_at).toBe("2026-02-20T17:00:00Z");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should set status message", async () => {
      const result = await client.api("/me/presence/setStatusMessage").post({
        statusMessage: {
          message: {
            content: "In a meeting",
            contentType: "text",
          },
          expiresAt: "2026-02-20T17:00:00Z",
        },
      });

      expect(result).toBeNull();
    });

    it("should clear status message (empty body)", async () => {
      const result = await client.api("/me/presence/setStatusMessage").post({
        statusMessage: {},
      });

      expect(result).toBeNull();
    });
  });
});
