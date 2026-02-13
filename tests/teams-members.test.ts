import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ListTeamMembersParams } from "../src/schemas/teams-members.js";

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

describe("list_team_members", () => {
  describe("ListTeamMembersParams schema", () => {
    it("should require team_id", () => {
      const result = ListTeamMembersParams.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should parse with team_id", () => {
      const result = ListTeamMembersParams.parse({ team_id: "team-001" });
      expect(result.team_id).toBe("team-001");
      expect(result.role).toBe("all");
    });

    it("should accept role filter", () => {
      for (const role of ["owner", "member", "guest", "all"]) {
        const result = ListTeamMembersParams.parse({ team_id: "t1", role });
        expect(result.role).toBe(role);
      }
    });

    it("should reject invalid role", () => {
      const result = ListTeamMembersParams.safeParse({ team_id: "t1", role: "admin" });
      expect(result.success).toBe(false);
    });

    it("should accept pagination params", () => {
      const result = ListTeamMembersParams.parse({ team_id: "t1", top: 10, skip: 5 });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });
  });

  describe("Graph API integration", () => {
    it("should list all members", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/teams/team-001/members").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(3);
      expect(items[0]).toHaveProperty("displayName", "Alice Admin");
      expect(items[0]).toHaveProperty("roles", ["owner"]);
    });

    it("should include member role info", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/teams/team-001/members").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;

      // Owner
      expect(items[0].roles).toEqual(["owner"]);
      // Member (empty roles)
      expect(items[1].roles).toEqual([]);
      // Guest
      expect(items[2].roles).toEqual(["guest"]);
    });

    it("should return 404 for nonexistent team", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(client.api("/teams/nonexistent/members").get()).rejects.toThrow();
    });
  });
});
