import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { GetTodoListParams, ListTodoListsParams } from "../schemas/todo.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { shapeListResponse } from "../utils/response-shaper.js";

const logger = createLogger("tools:todo-lists");

function formatListSummary(list: Record<string, unknown>): string {
  const name = String(list.displayName ?? "(unnamed)");
  const wellknown =
    typeof list.wellknownListName === "string" && list.wellknownListName !== "none"
      ? ` (${list.wellknownListName})`
      : "";
  const shared = list.isShared === true ? " [shared]" : "";
  const id = String(list.id ?? "");
  return `${name}${wellknown}${shared} | ID: ${id}`;
}

function formatListDetail(list: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`Name: ${String(list.displayName ?? "(unnamed)")}`);
  if (typeof list.wellknownListName === "string" && list.wellknownListName !== "none") {
    lines.push(`Well-known name: ${list.wellknownListName}`);
  }
  lines.push(`Owner: ${list.isOwner === true ? "Yes" : "No"}`);
  lines.push(`Shared: ${list.isShared === true ? "Yes" : "No"}`);
  lines.push(`ID: ${String(list.id ?? "")}`);
  return lines.join("\n");
}

export function registerTodoListTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_todo_lists",
    "List all Microsoft To Do task lists. Returns list name, type (defaultList, flaggedEmails), and sharing status.",
    ListTodoListsParams.shape,
    async (params) => {
      try {
        const parsed = ListTodoListsParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/todo/lists`;

        // Note: /me/todo/lists does NOT support $select query parameter
        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No To Do lists found."
            : [...items.map(formatListSummary), "", paginationHint].join("\n");

        logger.info({ tool: "list_todo_lists", count: items.length }, "list_todo_lists completed");
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
    "get_todo_list",
    "Get details of a single Microsoft To Do list including name, owner, and sharing status.",
    GetTodoListParams.shape,
    async (params) => {
      try {
        const parsed = GetTodoListParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/todo/lists/${parsed.list_id}`;

        // Note: /me/todo/lists/{id} endpoint does support $select, but we omit it for consistency
        const list = (await graphClient.api(url).get()) as Record<string, unknown>;

        const text = formatListDetail(list);
        logger.info({ tool: "get_todo_list" }, "get_todo_list completed");
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
