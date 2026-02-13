import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { PollCopyStatusParams } from "../src/schemas/file-upload.js";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("poll_copy_status", () => {
  describe("PollCopyStatusParams schema", () => {
    it("should parse with required fields", () => {
      const result = PollCopyStatusParams.parse({
        monitor_url: "https://graph.microsoft.com/v1.0/me/drive/items/file-001/copy?$monitor",
      });
      expect(result.monitor_url).toBe(
        "https://graph.microsoft.com/v1.0/me/drive/items/file-001/copy?$monitor",
      );
    });

    it("should reject invalid URL", () => {
      const result = PollCopyStatusParams.safeParse({
        monitor_url: "not-a-url",
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing monitor_url", () => {
      const result = PollCopyStatusParams.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should poll in-progress copy operation", async () => {
      const result = (await client
        .api("/me/drive/items/file-001/copy?$monitor&status=inProgress&percentage=50")
        .get()) as Record<string, unknown>;

      expect(result.status).toBe("inProgress");
      expect(result.percentageComplete).toBe(50);
    });

    it("should poll completed copy operation", async () => {
      const result = (await client
        .api("/me/drive/items/file-001/copy?$monitor&status=completed")
        .get()) as Record<string, unknown>;

      expect(result.status).toBe("completed");
      expect(result.percentageComplete).toBe(100);
      expect(result.id).toBeDefined();
    });

    it("should handle failed copy operation", async () => {
      const result = (await client
        .api("/me/drive/items/file-001/copy?$monitor&status=failed")
        .get()) as Record<string, unknown>;

      expect(result.status).toBe("failed");
      const error = result.error as Record<string, unknown>;
      expect(error).toBeDefined();
    });

    it("should track progress over multiple polls", async () => {
      // First poll: 25%
      const result1 = (await client
        .api("/me/drive/items/file-001/copy?$monitor&status=inProgress&percentage=25")
        .get()) as Record<string, unknown>;
      expect(result1.percentageComplete).toBe(25);

      // Second poll: 75%
      const result2 = (await client
        .api("/me/drive/items/file-001/copy?$monitor&status=inProgress&percentage=75")
        .get()) as Record<string, unknown>;
      expect(result2.percentageComplete).toBe(75);

      // Final poll: completed
      const result3 = (await client
        .api("/me/drive/items/file-001/copy?$monitor&status=completed")
        .get()) as Record<string, unknown>;
      expect(result3.status).toBe("completed");
    });
  });
});
