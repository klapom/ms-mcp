import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type {
  CreateTaskParamsType,
  DeleteTaskParamsType,
  UpdateTaskParamsType,
} from "../schemas/todo.js";
import { CreateTaskParams, DeleteTaskParams, UpdateTaskParams } from "../schemas/todo.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, ValidationError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";

const logger = createLogger("tools:todo-tasks-write");

const UPDATABLE_FIELDS = [
  "title",
  "body",
  "due_date_time",
  "reminder_date_time",
  "start_date_time",
  "importance",
  "status",
  "categories",
  "is_reminder_on",
] as const;

function buildTaskBody(
  parsed: CreateTaskParamsType | UpdateTaskParamsType,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if ("title" in parsed && parsed.title !== undefined) body.title = parsed.title;
  if (parsed.body !== undefined) {
    body.body = {
      content: parsed.body.content,
      contentType: parsed.body.content_type === "html" ? "html" : "text",
    };
  }
  if (parsed.due_date_time !== undefined) body.dueDateTime = parsed.due_date_time;
  if (parsed.reminder_date_time !== undefined) body.reminderDateTime = parsed.reminder_date_time;
  if (parsed.start_date_time !== undefined) body.startDateTime = parsed.start_date_time;
  if (parsed.importance !== undefined) body.importance = parsed.importance;
  if (parsed.status !== undefined) body.status = parsed.status;
  if (parsed.categories !== undefined) body.categories = parsed.categories;
  if (parsed.is_reminder_on !== undefined) body.isReminderOn = parsed.is_reminder_on;
  return body;
}

function buildCreatePreview(parsed: CreateTaskParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Create task", {
      Title: parsed.title,
      Status: parsed.status,
      Importance: parsed.importance,
      "Due date": parsed.due_date_time
        ? `${parsed.due_date_time.dateTime} (${parsed.due_date_time.timeZone})`
        : undefined,
      List: parsed.list_id,
    }),
  );
  if (preview) return { content: [{ type: "text", text: preview.message }] };
  return null;
}

async function executeCreate(
  graphClient: Client,
  parsed: CreateTaskParamsType,
  startTime: number,
): Promise<ToolResult> {
  const userPath = resolveUserPath(parsed.user_id);
  const url = `${userPath}/todo/lists/${encodeGraphId(parsed.list_id)}/tasks`;
  const requestBody = buildTaskBody(parsed);

  const result = (await graphClient.api(url).post(requestBody)) as Record<string, unknown>;

  logger.info(
    { tool: "create_task", status: 201, duration_ms: Date.now() - startTime },
    "create_task completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Task created successfully.\n\nID: ${result.id}\nTitle: ${result.title ?? parsed.title}`,
      },
    ],
  };
}

async function buildUpdatePreview(
  graphClient: Client,
  parsed: UpdateTaskParamsType,
  userPath: string,
): Promise<ToolResult> {
  const url = `${userPath}/todo/lists/${encodeGraphId(parsed.list_id)}/tasks/${encodeGraphId(parsed.task_id)}`;
  const current = (await graphClient
    .api(url)
    .select(buildSelectParam(DEFAULT_SELECT.task))
    .get()) as Record<string, unknown>;

  const details: Record<string, unknown> = {
    "Task ID": parsed.task_id,
    "Current title": current.title,
  };
  if (parsed.title !== undefined) details["New title"] = parsed.title;
  if (parsed.status !== undefined) details["New status"] = parsed.status;
  if (parsed.importance !== undefined) details["New importance"] = parsed.importance;
  if (parsed.due_date_time !== undefined)
    details["New due date"] = `${parsed.due_date_time.dateTime} (${parsed.due_date_time.timeZone})`;

  return { content: [{ type: "text", text: formatPreview("Update task", details) }] };
}

async function executeUpdate(
  graphClient: Client,
  parsed: UpdateTaskParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const url = `${userPath}/todo/lists/${encodeGraphId(parsed.list_id)}/tasks/${encodeGraphId(parsed.task_id)}`;
  const patchBody = buildTaskBody(parsed);

  const result = (await graphClient.api(url).patch(patchBody)) as Record<string, unknown>;

  logger.info(
    {
      tool: "update_task",
      fieldCount: Object.keys(patchBody).length,
      status: 200,
      duration_ms: Date.now() - startTime,
    },
    "update_task completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Task updated successfully.\n\nTitle: ${result.title ?? "(untitled)"}\nStatus: ${result.status ?? "unknown"}\nFields changed: ${Object.keys(patchBody).length}`,
      },
    ],
  };
}

async function buildDeletePreview(
  graphClient: Client,
  parsed: DeleteTaskParamsType,
  userPath: string,
): Promise<ToolResult> {
  const url = `${userPath}/todo/lists/${encodeGraphId(parsed.list_id)}/tasks/${encodeGraphId(parsed.task_id)}`;
  const current = (await graphClient
    .api(url)
    .select(buildSelectParam(DEFAULT_SELECT.task))
    .get()) as Record<string, unknown>;

  return {
    content: [
      {
        type: "text",
        text: formatPreview("Delete task", {
          Title: current.title,
          Status: current.status,
        }),
      },
    ],
  };
}

async function executeDelete(
  graphClient: Client,
  parsed: DeleteTaskParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const url = `${userPath}/todo/lists/${encodeGraphId(parsed.list_id)}/tasks/${encodeGraphId(parsed.task_id)}`;
  await graphClient.api(url).delete();

  logger.info(
    { tool: "delete_task", status: 204, duration_ms: Date.now() - startTime },
    "delete_task completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Task deleted successfully.\n\nTask ID: ${parsed.task_id}\nTimestamp: ${new Date().toISOString()}`,
      },
    ],
  };
}

async function handleUpdateConfirmed(
  graphClient: Client,
  parsed: UpdateTaskParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  if (parsed.idempotency_key) {
    const cached = idempotencyCache.get("update_task", parsed.idempotency_key, parsed.user_id);
    if (cached !== undefined) return cached as ToolResult;
  }

  const result = await executeUpdate(graphClient, parsed, userPath, startTime);

  if (parsed.idempotency_key) {
    idempotencyCache.set("update_task", parsed.idempotency_key, result, parsed.user_id);
  }

  return result;
}

async function handleDeleteConfirmed(
  graphClient: Client,
  parsed: DeleteTaskParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  if (parsed.idempotency_key) {
    const cached = idempotencyCache.get("delete_task", parsed.idempotency_key, parsed.user_id);
    if (cached !== undefined) return cached as ToolResult;
  }

  const result = await executeDelete(graphClient, parsed, userPath, startTime);

  if (parsed.idempotency_key) {
    idempotencyCache.set("delete_task", parsed.idempotency_key, result, parsed.user_id);
  }

  return result;
}

export function registerTodoTaskWriteTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "create_task",
    "Create a new task in a Microsoft To Do list. Requires confirm=true to actually create — without it, returns a preview. Supports title, body, due date, reminder, importance, status, and categories. Use idempotency_key to prevent duplicate creates.",
    CreateTaskParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = CreateTaskParams.parse(params);

        const previewResult = buildCreatePreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "create_task",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeCreate(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("create_task", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "create_task",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "create_task failed",
          );
          return {
            content: [{ type: "text" as const, text: formatErrorForUser(error) }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );

  server.tool(
    "update_task",
    "Update an existing task in a Microsoft To Do list. Requires confirm=true to actually update — without it, fetches the current task and returns a preview. At least one updatable field must be provided. Use idempotency_key to prevent duplicate updates.",
    UpdateTaskParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = UpdateTaskParams.parse(params);

        if (!UPDATABLE_FIELDS.some((f) => parsed[f] !== undefined)) {
          throw new ValidationError("At least one updatable field must be provided.");
        }

        const userPath = resolveUserPath(parsed.user_id);

        if (!parsed.confirm) {
          return await buildUpdatePreview(graphClient, parsed, userPath);
        }

        return await handleUpdateConfirmed(graphClient, parsed, userPath, startTime);
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "update_task",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "update_task failed",
          );
          return {
            content: [{ type: "text" as const, text: formatErrorForUser(error) }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );

  server.tool(
    "delete_task",
    "Delete a task from a Microsoft To Do list. Requires confirm=true to actually delete — without it, fetches the task and returns a preview. Use idempotency_key to prevent duplicate deletes.",
    DeleteTaskParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = DeleteTaskParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        if (!parsed.confirm) {
          return await buildDeletePreview(graphClient, parsed, userPath);
        }

        return await handleDeleteConfirmed(graphClient, parsed, userPath, startTime);
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "delete_task",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "delete_task failed",
          );
          return {
            content: [{ type: "text" as const, text: formatErrorForUser(error) }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );
}
