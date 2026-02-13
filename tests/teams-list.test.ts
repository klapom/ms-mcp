import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ListChannelsParams, ListTeamsParams } from "../src/schemas/teams.js";

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

describe("list_teams", () => {
  describe("ListTeamsParams schema", () => {
    it("should parse with no params", () => {
      const result = ListTeamsParams.parse({});
      expect(result.top).toBeUndefined();
      expect(result.skip).toBeUndefined();
    });

    it("should parse with pagination", () => {
      const result = ListTeamsParams.parse({ top: 10, skip: 5 });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });

    it("should reject top > 100", () => {
      const result = ListTeamsParams.safeParse({ top: 101 });
      expect(result.success).toBe(false);
    });

    it("should accept user_id", () => {
      const result = ListTeamsParams.parse({ user_id: "admin@tenant.com" });
      expect(result.user_id).toBe("admin@tenant.com");
    });
  });

  describe("Graph API integration", () => {
    it("should list joined teams", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/me/joinedTeams").get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);
      expect(items[0]).toHaveProperty("displayName", "Engineering");
      expect(items[1]).toHaveProperty("isArchived", true);
    });

    it("should work for multi-tenant", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/users/admin@tenant.com/joinedTeams").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(1);
      expect(items[0]).toHaveProperty("displayName", "MT Team");
    });
  });
});

describe("list_channels", () => {
  describe("ListChannelsParams schema", () => {
    it("should parse with team_id", () => {
      const result = ListChannelsParams.parse({ team_id: "team-001" });
      expect(result.team_id).toBe("team-001");
    });

    it("should reject empty team_id", () => {
      const result = ListChannelsParams.safeParse({ team_id: "" });
      expect(result.success).toBe(false);
    });

    it("should reject missing team_id", () => {
      const result = ListChannelsParams.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should parse with pagination", () => {
      const result = ListChannelsParams.parse({ team_id: "t1", top: 20, skip: 10 });
      expect(result.top).toBe(20);
      expect(result.skip).toBe(10);
    });
  });

  describe("Graph API integration", () => {
    it("should list channels for a team", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/teams/team-001/channels").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);
      expect(items[0]).toHaveProperty("displayName", "General");
      expect(items[1]).toHaveProperty("membershipType", "private");
    });

    it("should return 404 for nonexistent team", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(client.api("/teams/nonexistent/channels").get()).rejects.toThrow();
    });
  });
});
