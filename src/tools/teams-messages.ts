import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { ListChannelMessagesParams } from "../schemas/teams.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { convertHtmlToText } from "../utils/html-convert.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";

const logger = createLogger("tools:teams-messages");

const MESSAGE_BODY_MAX = 500;

function formatMessage(item: Record<string, unknown>): string {
  const id = String(item.id ?? "");
  const created = String(item.createdDateTime ?? "");
  const from = extractSender(item.from);
  const importance = item.importance !== "normal" ? ` [${String(item.importance)}]` : "";
  const body = extractBody(item.body);
  return `[${created}] ${from}${importance}\n${body}\n  ID: ${id}`;
}

function extractSender(from: unknown): string {
  if (from && typeof from === "object") {
    const user = (from as Record<string, unknown>).user;
    if (user && typeof user === "object") {
      return String((user as Record<string, unknown>).displayName ?? "Unknown");
    }
  }
  return "Unknown";
}

function extractBody(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const contentType = String(b.contentType ?? "text");
    const content = String(b.content ?? "");
    if (contentType.toLowerCase() === "html") {
      return convertHtmlToText(content, MESSAGE_BODY_MAX);
    }
    return content.length > MESSAGE_BODY_MAX
      ? `${content.slice(0, MESSAGE_BODY_MAX)}... [truncated]`
      : content;
  }
  return "";
}

export function registerTeamsMessageTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_channel_messages",
    "List messages in a Teams channel. Returns sender, timestamp, importance, and body (truncated to 500 chars). Max 50 messages per page.",
    ListChannelMessagesParams.shape,
    async (params) => {
      try {
        const parsed = ListChannelMessagesParams.parse(params);
        const teamId = encodeGraphId(parsed.team_id);
        const channelId = encodeGraphId(parsed.channel_id);
        const url = `/teams/${teamId}/channels/${channelId}/messages`;

        const top = Math.min(parsed.top ?? config.limits.maxItems, 50);

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top,
          skip: parsed.skip,
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No messages found." }] };
        }

        const lines = page.items.map((item) => formatMessage(item));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} messages. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} messages.`;

        logger.info(
          { tool: "list_channel_messages", count: page.items.length },
          "list_channel_messages completed",
        );

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "list_channel_messages", status: error.httpStatus, code: error.code },
            "list_channel_messages failed",
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
