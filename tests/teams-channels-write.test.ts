import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { CreateChannelParams } from "../src/schemas/teams-write.js";

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

describe("create_channel", () => {
  describe("CreateChannelParams schema", () => {
    it("should require team_id and display_name", () => {
      const result = CreateChannelParams.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should parse with required fields", () => {
      const result = CreateChannelParams.parse({
        team_id: "team-001",
        display_name: "New Channel",
      });
      expect(result.team_id).toBe("team-001");
      expect(result.display_name).toBe("New Channel");
      expect(result.membership_type).toBe("standard");
      expect(result.confirm).toBe(false);
    });

    it("should accept membership_type enum", () => {
      const result = CreateChannelParams.parse({
        team_id: "t1",
        display_name: "Ch",
        membership_type: "private",
      });
      expect(result.membership_type).toBe("private");
    });

    it("should reject invalid membership_type", () => {
      const result = CreateChannelParams.safeParse({
        team_id: "t1",
        display_name: "Ch",
        membership_type: "shared",
      });
      expect(result.success).toBe(false);
    });

    it("should reject display_name > 50 chars", () => {
      const result = CreateChannelParams.safeParse({
        team_id: "t1",
        display_name: "A".repeat(51),
      });
      expect(result.success).toBe(false);
    });

    it("should accept optional description", () => {
      const result = CreateChannelParams.parse({
        team_id: "t1",
        display_name: "Ch",
        description: "A channel description",
      });
      expect(result.description).toBe("A channel description");
    });

    it("should accept optional owner_user_id", () => {
      const result = CreateChannelParams.parse({
        team_id: "t1",
        display_name: "Ch",
        owner_user_id: "user-001",
      });
      expect(result.owner_user_id).toBe("user-001");
    });
  });

  describe("Graph API integration", () => {
    it("should create a standard channel", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/teams/team-001/channels").post({
        displayName: "Q1 Planning",
        membershipType: "standard",
      })) as Record<string, unknown>;
      expect(response.id).toBe("new-channel-001");
      expect(response.displayName).toBe("Q1 Planning");
      expect(response.membershipType).toBe("standard");
      expect(response.webUrl).toBeDefined();
    });

    it("should create a private channel", async () => {
      const client = createTestGraphClient();
      const response = (await client.api("/teams/team-001/channels").post({
        displayName: "Private Discussion",
        membershipType: "private",
      })) as Record<string, unknown>;
      expect(response.id).toBe("new-channel-001");
      expect(response.membershipType).toBe("private");
    });

    it("should return 409 for duplicate channel name", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(
        client.api("/teams/team-001/channels").post({
          displayName: "Existing Channel",
          membershipType: "standard",
        }),
      ).rejects.toThrow();
    });

    it("should return 400 for invalid team_id", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(
        client.api("/teams/nonexistent/channels").post({
          displayName: "Test",
          membershipType: "standard",
        }),
      ).rejects.toThrow();
    });

    it("should return 403 for insufficient permissions", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(
        client.api("/teams/forbidden/channels").post({
          displayName: "Test",
          membershipType: "standard",
        }),
      ).rejects.toThrow();
    });
  });
});
