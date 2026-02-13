import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { GetTodoListParams, ListTodoListsParams } from "../src/schemas/todo.js";

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

describe("list_todo_lists", () => {
  describe("ListTodoListsParams schema", () => {
    it("should parse with defaults", () => {
      const result = ListTodoListsParams.parse({});
      expect(result.top).toBeUndefined();
      expect(result.skip).toBeUndefined();
    });

    it("should accept pagination params", () => {
      const result = ListTodoListsParams.parse({ top: 10, skip: 5 });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(5);
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch todo lists", async () => {
      const response = (await client.api("/me/todo/lists").get()) as Record<string, unknown>;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);
      expect(items[0].displayName).toBe("My Tasks");
      expect(items[0].wellknownListName).toBe("defaultList");
    });

    it("should support multi-tenant", async () => {
      const response = (await client.api("/users/user@example.com/todo/lists").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
    });
  });
});

describe("get_todo_list", () => {
  describe("GetTodoListParams schema", () => {
    it("should require list_id", () => {
      expect(() => GetTodoListParams.parse({})).toThrow();
    });

    it("should accept valid list_id", () => {
      const result = GetTodoListParams.parse({ list_id: "list-001" });
      expect(result.list_id).toBe("list-001");
    });

    it("should reject empty list_id", () => {
      expect(() => GetTodoListParams.parse({ list_id: "" })).toThrow();
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch single todo list", async () => {
      const list = (await client.api("/me/todo/lists/list-001").get()) as Record<string, unknown>;
      expect(list.displayName).toBe("My Tasks");
      expect(list.isOwner).toBe(true);
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 to NotFoundError", async () => {
      try {
        await errorClient.api("/me/todo/lists/nonexistent").get();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});
