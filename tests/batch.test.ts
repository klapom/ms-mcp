import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { describe, expect, it } from "vitest";
import {
  type GraphBatchRequest,
  type GraphBatchResult,
  buildBatchRequest,
  executeBatch,
  formatBatchSummary,
  summarizeBatchResult,
} from "../src/utils/batch.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("batch utility", () => {
  describe("buildBatchRequest", () => {
    it("should create valid structure with requests array", () => {
      const requests: GraphBatchRequest[] = [
        { id: "1", method: "GET", url: "/me/messages/msg-1" },
        { id: "2", method: "DELETE", url: "/me/messages/msg-2" },
      ];
      const result = buildBatchRequest(requests);
      expect(result).toEqual({ requests });
    });

    it("should reject more than 20 requests", () => {
      const requests: GraphBatchRequest[] = Array.from({ length: 21 }, (_, i) => ({
        id: String(i + 1),
        method: "GET" as const,
        url: `/me/messages/msg-${i}`,
      }));
      expect(() => buildBatchRequest(requests)).toThrow("max 20 requests");
    });

    it("should accept exactly 20 requests", () => {
      const requests: GraphBatchRequest[] = Array.from({ length: 20 }, (_, i) => ({
        id: String(i + 1),
        method: "GET" as const,
        url: `/me/messages/msg-${i}`,
      }));
      expect(() => buildBatchRequest(requests)).not.toThrow();
    });
  });

  describe("executeBatch", () => {
    it("should make POST /$batch call and return responses", async () => {
      const client = createTestGraphClient();
      const requests: GraphBatchRequest[] = [
        { id: "1", method: "DELETE", url: "/me/messages/msg-1" },
      ];
      const result = await executeBatch(client, requests);
      expect(result).toHaveProperty("responses");
      expect(Array.isArray(result.responses)).toBe(true);
    });

    it("should return correct response for each request", async () => {
      const client = createTestGraphClient();
      const requests: GraphBatchRequest[] = [
        { id: "1", method: "DELETE", url: "/me/messages/msg-1" },
        { id: "2", method: "DELETE", url: "/me/messages/not-found-msg" },
      ];
      const result = await executeBatch(client, requests);
      expect(result.responses).toHaveLength(2);

      const success = result.responses.find((r) => r.id === "1");
      const failure = result.responses.find((r) => r.id === "2");
      expect(success?.status).toBe(204);
      expect(failure?.status).toBe(404);
    });
  });

  describe("summarizeBatchResult", () => {
    it("should count successes (2xx status)", () => {
      const result: GraphBatchResult = {
        responses: [
          { id: "1", status: 200 },
          { id: "2", status: 204 },
          { id: "3", status: 200 },
        ],
      };
      const summary = summarizeBatchResult(result);
      expect(summary.successCount).toBe(3);
      expect(summary.failureCount).toBe(0);
      expect(summary.failures).toHaveLength(0);
    });

    it("should count failures (4xx/5xx)", () => {
      const result: GraphBatchResult = {
        responses: [
          { id: "1", status: 200 },
          { id: "2", status: 404, body: { error: { message: "Not found" } } },
          { id: "3", status: 403, body: { error: { message: "Forbidden" } } },
        ],
      };
      const summary = summarizeBatchResult(result);
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(2);
      expect(summary.failures).toEqual([
        { id: "2", status: 404, error: "Not found" },
        { id: "3", status: 403, error: "Forbidden" },
      ]);
    });

    it("should extract error messages from response body", () => {
      const result: GraphBatchResult = {
        responses: [{ id: "1", status: 500, body: { error: { message: "Internal error" } } }],
      };
      const summary = summarizeBatchResult(result);
      expect(summary.failures[0].error).toBe("Internal error");
    });

    it("should handle empty responses array", () => {
      const result: GraphBatchResult = { responses: [] };
      const summary = summarizeBatchResult(result);
      expect(summary.successCount).toBe(0);
      expect(summary.failureCount).toBe(0);
    });

    it("should handle missing error body", () => {
      const result: GraphBatchResult = {
        responses: [{ id: "1", status: 500 }],
      };
      const summary = summarizeBatchResult(result);
      expect(summary.failures[0].error).toBeUndefined();
    });
  });

  describe("formatBatchSummary", () => {
    it("should format all-success summary", () => {
      const text = formatBatchSummary(
        { successCount: 5, failureCount: 0, failures: [] },
        "moved",
        "failed",
      );
      expect(text).toContain("5 moved");
      expect(text).toContain("0 failed");
    });

    it("should format partial success with failure details", () => {
      const text = formatBatchSummary(
        {
          successCount: 3,
          failureCount: 2,
          failures: [
            { id: "4", status: 404, error: "Not found" },
            { id: "5", status: 403 },
          ],
        },
        "deleted",
        "failed",
      );
      expect(text).toContain("3 deleted");
      expect(text).toContain("2 failed");
      expect(text).toContain("404");
      expect(text).toContain("Not found");
    });
  });
});
