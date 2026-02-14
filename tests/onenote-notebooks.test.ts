import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ListNotebooksParams } from "../src/schemas/onenote.js";

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

describe("list_notebooks", () => {
  describe("ListNotebooksParams schema", () => {
    it("should parse with defaults", () => {
      const result = ListNotebooksParams.parse({});
      expect(result.top).toBeUndefined();
      expect(result.skip).toBeUndefined();
    });

    it("should accept pagination params", () => {
      const result = ListNotebooksParams.parse({ top: 10, skip: 5 });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });

    it("should reject negative top", () => {
      expect(() => ListNotebooksParams.parse({ top: -5 })).toThrow();
    });

    it("should reject negative skip", () => {
      expect(() => ListNotebooksParams.parse({ skip: -1 })).toThrow();
    });

    it("should accept user_id", () => {
      const result = ListNotebooksParams.parse({ user_id: "user@example.com" });
      expect(result.user_id).toBe("user@example.com");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch notebooks", async () => {
      const response = (await client.api("/me/onenote/notebooks").get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items).toHaveLength(3);
      expect(items[0].displayName).toBe("Personal Notes");
      expect(items[0].isDefault).toBe(true);
    });

    it("should support pagination with $top", async () => {
      const response = (await client.api("/me/onenote/notebooks").top(2).get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBeLessThanOrEqual(2);
    });
  });

  describe("Error handling", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClientWithErrorMapping();
    });

    it("should handle 404 errors", async () => {
      await expect(client.api("/users/not-found/onenote/notebooks").get()).rejects.toThrow();
    });
  });
});
