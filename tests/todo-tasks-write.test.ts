import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { CreateTaskParams, DeleteTaskParams, UpdateTaskParams } from "../src/schemas/todo.js";

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

describe("create_task", () => {
  describe("CreateTaskParams schema", () => {
    it("should require list_id and title", () => {
      expect(() => CreateTaskParams.parse({})).toThrow();
      expect(() => CreateTaskParams.parse({ list_id: "l-1" })).toThrow();
    });

    it("should parse with required fields and defaults", () => {
      const result = CreateTaskParams.parse({ list_id: "l-1", title: "Test task" });
      expect(result.list_id).toBe("l-1");
      expect(result.title).toBe("Test task");
      expect(result.confirm).toBe(false);
      expect(result.importance).toBe("normal");
      expect(result.status).toBe("notStarted");
    });

    it("should accept all optional fields", () => {
      const result = CreateTaskParams.parse({
        list_id: "l-1",
        title: "Full task",
        body: { content: "Details here", content_type: "text" },
        due_date_time: { dateTime: "2026-02-20T17:00:00", timeZone: "Europe/Berlin" },
        reminder_date_time: { dateTime: "2026-02-20T09:00:00", timeZone: "Europe/Berlin" },
        start_date_time: { dateTime: "2026-02-15T08:00:00", timeZone: "Europe/Berlin" },
        importance: "high",
        status: "inProgress",
        categories: ["Work"],
        is_reminder_on: true,
        confirm: true,
        idempotency_key: "key-1",
      });
      expect(result.importance).toBe("high");
      expect(result.status).toBe("inProgress");
      expect(result.body?.content).toBe("Details here");
      expect(result.is_reminder_on).toBe(true);
    });

    it("should reject empty title", () => {
      expect(() => CreateTaskParams.parse({ list_id: "l-1", title: "" })).toThrow();
    });

    it("should accept body with default content_type", () => {
      const result = CreateTaskParams.parse({
        list_id: "l-1",
        title: "T",
        body: { content: "test" },
      });
      expect(result.body?.content_type).toBe("text");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should create a task", async () => {
      const result = (await client.api("/me/todo/lists/list-001/tasks").post({
        title: "New Task",
      })) as Record<string, unknown>;
      expect(result.id).toBe("task-new-001");
      expect(result.title).toBe("New Task");
    });
  });
});

describe("update_task", () => {
  describe("UpdateTaskParams schema", () => {
    it("should require list_id and task_id", () => {
      expect(() => UpdateTaskParams.parse({})).toThrow();
      expect(() => UpdateTaskParams.parse({ list_id: "l" })).toThrow();
    });

    it("should accept update fields", () => {
      const result = UpdateTaskParams.parse({
        list_id: "l-1",
        task_id: "t-1",
        title: "Updated",
        status: "completed",
        importance: "low",
        confirm: true,
      });
      expect(result.title).toBe("Updated");
      expect(result.status).toBe("completed");
    });

    it("should accept all status values", () => {
      for (const status of [
        "notStarted",
        "inProgress",
        "completed",
        "waitingOnOthers",
        "deferred",
      ] as const) {
        const result = UpdateTaskParams.parse({
          list_id: "l",
          task_id: "t",
          status,
        });
        expect(result.status).toBe(status);
      }
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should update a task", async () => {
      const result = (await client
        .api("/me/todo/lists/list-001/tasks/task-001")
        .patch({ status: "completed" })) as Record<string, unknown>;
      expect(result.id).toBe("task-001");
      expect(result.status).toBe("completed");
    });

    it("should fetch task for preview", async () => {
      const task = (await client.api("/me/todo/lists/list-001/tasks/task-001").get()) as Record<
        string,
        unknown
      >;
      expect(task.title).toBe("Review PR");
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 on update", async () => {
      try {
        await errorClient.api("/me/todo/lists/list-001/tasks/nonexistent").patch({ title: "X" });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});

describe("delete_task", () => {
  describe("DeleteTaskParams schema", () => {
    it("should require list_id and task_id", () => {
      expect(() => DeleteTaskParams.parse({})).toThrow();
    });

    it("should accept valid params", () => {
      const result = DeleteTaskParams.parse({
        list_id: "l-1",
        task_id: "t-1",
        confirm: true,
      });
      expect(result.list_id).toBe("l-1");
      expect(result.task_id).toBe("t-1");
    });
  });

  describe("Graph API integration", () => {
    let client: Client;

    beforeEach(() => {
      client = createTestGraphClient();
    });

    it("should delete a task (204)", async () => {
      await client.api("/me/todo/lists/list-001/tasks/task-001").delete();
    });
  });

  describe("error responses", () => {
    let errorClient: Client;

    beforeEach(() => {
      errorClient = createTestGraphClientWithErrorMapping();
    });

    it("should map 404 on delete", async () => {
      try {
        await errorClient.api("/me/todo/lists/list-001/tasks/nonexistent").delete();
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("code", "NotFoundError");
      }
    });
  });
});
