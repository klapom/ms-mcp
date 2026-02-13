import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { GetMeetingTranscriptParams } from "../src/schemas/teams-meetings.js";

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
});
