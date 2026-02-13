import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { GetMeetingTranscriptParams } from "../src/schemas/teams-meetings.js";

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

describe("get_meeting_transcript", () => {
  describe("GetMeetingTranscriptParams schema", () => {
    it("should require meeting_id", () => {
      const result = GetMeetingTranscriptParams.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should parse with meeting_id", () => {
      const result = GetMeetingTranscriptParams.parse({ meeting_id: "meeting-001" });
      expect(result.meeting_id).toBe("meeting-001");
      expect(result.format).toBe("text");
    });

    it("should accept format enum", () => {
      const result = GetMeetingTranscriptParams.parse({
        meeting_id: "m1",
        format: "vtt",
      });
      expect(result.format).toBe("vtt");
    });

    it("should reject invalid format", () => {
      const result = GetMeetingTranscriptParams.safeParse({
        meeting_id: "m1",
        format: "json",
      });
      expect(result.success).toBe(false);
    });

    it("should accept optional transcript_id", () => {
      const result = GetMeetingTranscriptParams.parse({
        meeting_id: "m1",
        transcript_id: "t1",
      });
      expect(result.transcript_id).toBe("t1");
    });
  });

  describe("Graph API integration", () => {
    it("should list transcripts for a meeting", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/me/onlineMeetings/meeting-001/transcripts")
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(1);
      expect(items[0]).toHaveProperty("id", "transcript-001");
      expect(items[0]).toHaveProperty("language", "en-US");
    });

    it("should get transcript content as VTT", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/me/onlineMeetings/meeting-001/transcripts/transcript-001/content")
        .get()) as string;
      expect(response).toContain("WEBVTT");
      expect(response).toContain("John Doe");
      expect(response).toContain("Jane Smith");
    });

    it("should return multiple transcripts", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/me/onlineMeetings/multi-transcript/transcripts")
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);
      expect(items[0]).toHaveProperty("language", "en-US");
      expect(items[1]).toHaveProperty("language", "de-DE");
    });

    it("should return empty for no transcripts", async () => {
      const client = createTestGraphClient();
      const response = (await client
        .api("/me/onlineMeetings/no-transcript/transcripts")
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(0);
    });

    it("should return 404 for nonexistent meeting", async () => {
      const client = createTestGraphClientWithErrorMapping();
      await expect(
        client.api("/me/onlineMeetings/nonexistent/transcripts").get(),
      ).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Tool handler tests
  // -----------------------------------------------------------------------
  describe("Tool handler", () => {
    it("should register and execute get_meeting_transcript tool", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerTeamsMeetingsTools } = await import("../src/tools/teams-meetings.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      let capturedHandler: ((params: unknown) => Promise<CallToolResult>) | null = null;
      const originalTool = testServer.tool.bind(testServer);
      testServer.tool = (name: string, description: string, schema: unknown, handler: unknown) => {
        if (name === "get_meeting_transcript") {
          capturedHandler = handler as (params: unknown) => Promise<CallToolResult>;
        }
        return originalTool(name, description, schema, handler);
      };

      registerTeamsMeetingsTools(testServer, graphClient, testConfig);

      expect(capturedHandler).not.toBeNull();

      const result = await capturedHandler?.({ meeting_id: "meeting-001" });
      expect(result).toBeDefined();
      expect(result?.content).toBeDefined();
    });

    it("should register without throwing", async () => {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerTeamsMeetingsTools } = await import("../src/tools/teams-meetings.js");

      const testServer = new McpServer({ name: "test", version: "0.0.1" });
      const graphClient = createTestGraphClient();

      expect(() => registerTeamsMeetingsTools(testServer, graphClient, testConfig)).not.toThrow();
    });
  });
});
