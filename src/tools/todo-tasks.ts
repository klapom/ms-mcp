import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { GetTaskParams, ListTasksParams } from "../schemas/todo.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { convertHtmlToText } from "../utils/html-convert.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:todo-tasks");

function formatTaskSummary(t: Record<string, unknown>): string {
  const title = String(t.title ?? "(untitled)");
  const status = String(t.status ?? "notStarted");
  const importance = String(t.importance ?? "normal");
  const due = formatDueDate(t.dueDateTime);
  const dueStr = due ? ` | Due: ${due}` : "";
  const importanceStr = importance === "high" ? " [!]" : "";
  const statusIcon = status === "completed" ? "[x]" : "[ ]";
  const id = String(t.id ?? "");
  return `${statusIcon}${importanceStr} ${title}${dueStr}\n  ID: ${id}`;
}

function formatDueDate(dueDateTime: unknown): string {
  if (!isRecordObject(dueDateTime)) return "";
  return typeof dueDateTime.dateTime === "string" ? dueDateTime.dateTime : "";
}

function formatTaskDates(t: Record<string, unknown>, lines: string[]): void {
  const due = formatDueDate(t.dueDateTime);
  if (due) lines.push(`Due: ${due}`);
  const start = formatDueDate(t.startDateTime);
  if (start) lines.push(`Start: ${start}`);
  const completed = formatDueDate(t.completedDateTime);
  if (completed) lines.push(`Completed: ${completed}`);
  if (t.isReminderOn === true) {
    const reminder = formatDueDate(t.reminderDateTime);
    lines.push(`Reminder: ${reminder || "enabled"}`);
  }
}

function formatTaskBody(t: Record<string, unknown>, maxBodyLength: number, lines: string[]): void {
  if (isRecordObject(t.body) && typeof t.body.content === "string" && t.body.content) {
    const contentType = String(t.body.contentType ?? "text");
    const bodyText =
      contentType.toLowerCase() === "html"
        ? convertHtmlToText(t.body.content, maxBodyLength)
        : t.body.content;
    if (bodyText.trim()) lines.push(`\nBody:\n${bodyText}`);
  }
}

function formatTaskDetail(t: Record<string, unknown>, maxBodyLength: number): string {
  const lines: string[] = [];
  lines.push(`Title: ${String(t.title ?? "(untitled)")}`);
  lines.push(`Status: ${String(t.status ?? "notStarted")}`);
  lines.push(`Importance: ${String(t.importance ?? "normal")}`);

  formatTaskDates(t, lines);
  formatTaskBody(t, maxBodyLength, lines);

  if (Array.isArray(t.categories) && t.categories.length > 0) {
    lines.push(`Categories: ${t.categories.join(", ")}`);
  }

  if (t.createdDateTime) lines.push(`Created: ${t.createdDateTime}`);
  if (t.lastModifiedDateTime) lines.push(`Modified: ${t.lastModifiedDateTime}`);
  lines.push(`ID: ${String(t.id ?? "")}`);
  return lines.join("\n");
}

export function registerTodoTaskTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_tasks",
    "List tasks in a Microsoft To Do list. Returns title, status, due date, and importance. Supports $filter and $orderby.",
    ListTasksParams.shape,
    async (params) => {
      try {
        const parsed = ListTasksParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/todo/lists/${encodeGraphId(parsed.list_id)}/tasks`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.task),
          filter: parsed.filter,
          orderby: parsed.orderby,
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No tasks found."
            : [...items.map(formatTaskSummary), "", paginationHint].join("\n");

        logger.info({ tool: "list_tasks", count: items.length }, "list_tasks completed");
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        if (error instanceof McpToolError) {
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
    "get_task",
    "Get full details of a single task including body, dates, reminder, and categories. Body HTML is converted to plain text.",
    GetTaskParams.shape,
    async (params) => {
      try {
        const parsed = GetTaskParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/todo/lists/${encodeGraphId(parsed.list_id)}/tasks/${encodeGraphId(parsed.task_id)}`;

        const task = (await graphClient
          .api(url)
          .select(buildSelectParam(DEFAULT_SELECT.taskDetail))
          .get()) as Record<string, unknown>;

        const text = formatTaskDetail(task, config.limits.maxBodyLength);
        logger.info({ tool: "get_task" }, "get_task completed");
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        if (error instanceof McpToolError) {
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
