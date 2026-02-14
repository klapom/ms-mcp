import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { ListSectionsParams } from "../src/schemas/onenote.js";

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

describe("list_sections", () => {
  describe("ListSectionsParams schema", () => {
    it("should require notebook_id", () => {
      expect(() => ListSectionsParams.parse({})).toThrow();
    });

    it("should accept valid notebook_id", () => {
      const result = ListSectionsParams.parse({ notebook_id: "notebook-1" });
      expect(result.notebook_id).toBe("notebook-1");
    });

    it("should reject empty notebook_id", () => {
      expect(() => ListSectionsParams.parse({ notebook_id: "" })).toThrow();
    });

    it("should accept pagination params", () => {
      const result = ListSectionsParams.parse({
        notebook_id: "notebook-1",
        top: 10,
        skip: 5,
      });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });

    it("should accept user_id", () => {
      const result = ListSectionsParams.parse({
        notebook_id: "notebook-1",
        user_id: "user@example.com",
      });
      expect(result.user_id).toBe("user@example.com");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch sections for a notebook", async () => {
      const response = (await client
        .api("/me/onenote/notebooks/notebook-1/sections")
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);
      expect(items[0].displayName).toBe("Quick Notes");
      expect(items[1].displayName).toBe("Project Ideas");
    });

    it("should support pagination with $top", async () => {
      const response = (await client
        .api("/me/onenote/notebooks/notebook-1/sections")
        .top(1)
        .get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items.length).toBeLessThanOrEqual(1);
    });
  });

  describe("Error handling", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClientWithErrorMapping();
    });

    it("should handle notebook not found", async () => {
      await expect(
        client.api("/me/onenote/notebooks/not-found-notebook/sections").get(),
      ).rejects.toThrow();
    });
  });
});
