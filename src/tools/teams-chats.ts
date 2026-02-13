import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { ListChatsParams } from "../schemas/teams.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";

const logger = createLogger("tools:teams-chats");

function formatChat(item: Record<string, unknown>): string {
  const id = String(item.id ?? "");
  const chatType = String(item.chatType ?? "");
  const topic = item.topic ? String(item.topic) : "(no topic)";
  const updated = String(item.lastUpdatedDateTime ?? "");
  const url = item.webUrl ? `\n  URL: ${String(item.webUrl)}` : "";
  return `[${chatType}] ${topic} | ${updated}\n  ID: ${id}${url}`;
}

export function registerTeamsChatsTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_chats",
    "List chats the current user is part of. Optionally filter by chat type (oneOnOne, group, meeting). Returns topic, type, last updated, and web URL.",
    ListChatsParams.shape,
    async (params) => {
      try {
        const parsed = ListChatsParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/chats`;

        const filter = parsed.chat_type ? `chatType eq '${parsed.chat_type}'` : undefined;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.chat),
          filter,
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No chats found." }] };
        }

        const lines = page.items.map((item) => formatChat(item));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} chats. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} chats.`;

        logger.info({ tool: "list_chats", count: page.items.length }, "list_chats completed");

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "list_chats", status: error.httpStatus, code: error.code },
            "list_chats failed",
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
