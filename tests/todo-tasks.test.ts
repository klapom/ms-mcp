import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { GetTaskParams, ListTasksParams } from "../src/schemas/todo.js";

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

describe("list_tasks", () => {
  describe("ListTasksParams schema", () => {
    it("should require list_id", () => {
      expect(() => ListTasksParams.parse({})).toThrow();
    });

    it("should accept list_id with optional params", () => {
      const result = ListTasksParams.parse({
        list_id: "list-001",
        top: 10,
        filter: "status eq 'notStarted'",
        orderby: "dueDateTime/dateTime asc",
      });
      expect(result.list_id).toBe("list-001");
      expect(result.filter).toBe("status eq 'notStarted'");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch tasks from a list", async () => {
      const response = (await client.api("/me/todo/lists/list-001/tasks").get()) as Record<
        string,
        unknown
      >;
      const items = response.value as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe("Review PR");
      expect(items[0].status).toBe("notStarted");
    });
  });
});

describe("get_task", () => {
  describe("GetTaskParams schema", () => {
    it("should require list_id and task_id", () => {
      expect(() => GetTaskParams.parse({})).toThrow();
      expect(() => GetTaskParams.parse({ list_id: "l-1" })).toThrow();
    });

    it("should accept valid params", () => {
      const result = GetTaskParams.parse({ list_id: "l-1", task_id: "t-1" });
      expect(result.list_id).toBe("l-1");
      expect(result.task_id).toBe("t-1");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should fetch single task with body", async () => {
      const task = (await client.api("/me/todo/lists/list-001/tasks/task-001").get()) as Record<
        string,
        unknown
      >;
      expect(task.title).toBe("Review PR");
      expect(task.importance).toBe("high");
      expect(task.isReminderOn).toBe(true);
      const body = task.body as Record<string, unknown>;
      expect(body.contentType).toBe("html");
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 to NotFoundError", async () => {
      try {
        await errorClient.api("/me/todo/lists/list-001/tasks/nonexistent").get();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});
