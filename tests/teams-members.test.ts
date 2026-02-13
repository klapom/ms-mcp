import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ListTeamMembersParams } from "../src/schemas/teams-members.js";

const testConfig: Config = {
  limits: { maxItems: 100, maxBodyLength: 50000 },
  auth: { clientId: "test-client", tenantId: "test-tenant" },
  logging: { level: "silent" },
  cache: { tokenCachePath: "/tmp/test-cache.json" },
};

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

  // -----------------------------------------------------------------------
  // Tool handler tests
  // -----------------------------------------------------------------------
  describe("Tool handler", () => {
    it("should register and execute list_team_members tool", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerTeamsMembersTools } = await import("../src/tools/teams-members.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "list_team_members") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerTeamsMembersTools(testServer, graphClient, testConfig);

      expect(capturedHandler).not.toBeNull();

      const result = await capturedHandler?.({ team_id: "team-001" });
      expect(result).toBeDefined();
      expect(result?.content).toBeDefined();
    });

    it("should register without throwing", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerTeamsMembersTools } = await import("../src/tools/teams-members.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      expect(() => registerTeamsMembersTools(testServer, graphClient, testConfig)).not.toThrow();
    });
  });
});
