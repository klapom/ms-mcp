import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { TrackFileChangesParams } from "../src/schemas/files-delta.js";
import { server as mswServer } from "./mocks/server.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function createTestGraphClient(): Client {
  return Client.initWithMiddleware({
    middleware: new HTTPMessageHandler(),
    defaultVersion: "v1.0",
  });
}

describe("track_file_changes", () => {
  describe("TrackFileChangesParams schema", () => {
    it("should parse with no parameters (initial sync)", () => {
      const result = TrackFileChangesParams.parse({});
      expect(result.folder_id).toBeUndefined();
      expect(result.delta_token).toBeUndefined();
    });

    it("should parse with delta_token", () => {
      const result = TrackFileChangesParams.parse({ delta_token: "abc123" });
      expect(result.delta_token).toBe("abc123");
    });

    it("should parse with folder_id", () => {
      const result = TrackFileChangesParams.parse({ folder_id: "folder-xyz" });
      expect(result.folder_id).toBe("folder-xyz");
    });

    it("should parse with both folder_id and delta_token", () => {
      const result = TrackFileChangesParams.parse({ folder_id: "f1", delta_token: "t1" });
      expect(result.folder_id).toBe("f1");
      expect(result.delta_token).toBe("t1");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should return all items on initial sync (no token)", async () => {
      const response = (await client.api("/me/drive/root/delta").get()) as Record<string, unknown>;
      const items = response.value as unknown[];
      expect(items.length).toBe(3);
      expect(response["@odata.deltaLink"]).toBeDefined();
    });

    it("should return deltaLink with token", async () => {
      const response = (await client.api("/me/drive/root/delta").get()) as Record<string, unknown>;
      const deltaLink = response["@odata.deltaLink"] as string;
      expect(deltaLink).toContain("token=");
    });

    it("should return changes on incremental sync (with token)", async () => {
      const response = (await client.api("/me/drive/root/delta?token=some-token").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBe(2);

      // Should include new and deleted items
      const deleted = items.find((i) => i.deleted !== undefined);
      expect(deleted).toBeDefined();
      expect(deleted?.name).toBe("removed-file.txt");
    });

    it("should include added files in delta", async () => {
      const response = (await client.api("/me/drive/root/delta?token=some-token").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      const added = items.find((i) => i.deleted === undefined);
      expect(added).toBeDefined();
      expect(added?.name).toBe("new-document.docx");
    });

    it("should handle folder-specific delta", async () => {
      const response = (await client.api("/me/drive/items/folder-123/delta").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThan(0);
      expect(response["@odata.deltaLink"]).toBeDefined();
    });

    it("should return empty changes when no modifications", async () => {
      mswServer.use(
        http.get(`${GRAPH_BASE}/me/drive/root/delta`, () => {
          return HttpResponse.json({
            value: [],
            "@odata.deltaLink": `${GRAPH_BASE}/me/drive/root/delta?token=unchanged`,
          });
        }),
      );

      const response = (await client.api("/me/drive/root/delta?token=unchanged").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as unknown[];
      expect(items).toHaveLength(0);
    });

    it("should return 410 for expired token", async () => {
      try {
        await client.api("/me/drive/root/delta?token=expired-token").get();
        expect.fail("Should have thrown");
      } catch (error) {
        const err = error as { statusCode: number };
        expect(err.statusCode).toBe(410);
      }
    });
  });
});
