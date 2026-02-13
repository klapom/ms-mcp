import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import {
  ListActivityFeedParams,
  type ListActivityFeedParamsType,
  ListMentionsParams,
  type ListMentionsParamsType,
} from "../schemas/teams-activity.js";
import type { ToolResult } from "../types/tools.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";

const logger = createLogger("tools:teams-activity");

const ACTIVITY_SELECT = "id,activityType,actor,createdDateTime,previewText,resourceLink";

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatActivity(item: Record<string, unknown>): string {
  const type = String(item.activityType ?? "unknown");
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const actor = item.actor as Record<string, unknown> | undefined;
  const user = actor?.user as Record<string, unknown> | undefined;
  const actorName = String(user?.displayName ?? "Unknown");
  const preview = item.previewText as Record<string, unknown> | undefined;
  const previewBody = String(preview?.content ?? "");
  const timestamp = item.createdDateTime ? formatRelativeTime(String(item.createdDateTime)) : "";
  const link = item.resourceLink ? `\n  Link: ${String(item.resourceLink)}` : "";

  return `[${label}] ${actorName}\n  "${previewBody}"\n  ${timestamp}${link}`;
}

function buildActivityFilter(parsed: ListActivityFeedParamsType): string | undefined {
  const filters: string[] = [];
  if (parsed.activity_type !== "all") {
    filters.push(`activityType eq '${parsed.activity_type}'`);
  }
  if (parsed.unread_only) {
    filters.push("isRead eq false");
  }
  return filters.length > 0 ? filters.join(" and ") : undefined;
}

function formatMention(item: Record<string, unknown>): string {
  const from = item.from as Record<string, unknown> | undefined;
  const user = from?.user as Record<string, unknown> | undefined;
  const senderName = String(user?.displayName ?? "Unknown");
  const body = item.body as Record<string, unknown> | undefined;
  const content = String(body?.content ?? "").slice(0, 200);
  const timestamp = item.createdDateTime ? formatRelativeTime(String(item.createdDateTime)) : "";
  const channel = item.channelIdentity as Record<string, unknown> | undefined;
  const channelName = channel ? ` in '${String(channel.channelId ?? "")}'` : "";
  const link = item.webUrl ? `\n  Link: ${String(item.webUrl)}` : "";

  return `@Mention: ${senderName}${channelName}\n  "${content}"\n  ${timestamp}${link}`;
}

export function registerTeamsActivityTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "list_activity_feed",
    "List Teams activity feed notifications (mentions, replies, reactions, channel activity). Filter by activity type or unread status.",
    ListActivityFeedParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = ListActivityFeedParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/teamwork/activityHistory`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? 25,
          skip: parsed.skip,
          select: ACTIVITY_SELECT,
          filter: buildActivityFilter(parsed),
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No activities found." }] };
        }

        const lines = page.items.map((item) => formatActivity(item));
        const total = page.totalCount ?? page.items.length;
        const hint = page.hasMore
          ? `\nShowing ${page.items.length} of ${total} activities. Use skip: ${(parsed.skip ?? 0) + page.items.length} for the next page.`
          : `\nShowing ${page.items.length} activities.`;

        logger.info(
          { tool: "list_activity_feed", count: page.items.length },
          "list_activity_feed completed",
        );

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        return handleError("list_activity_feed", error, startTime);
      }
    },
  );

  server.tool(
    "list_mentions",
    "List all messages where you were @mentioned across Teams channels and chats. Filter by source (channels, chats, or both).",
    ListMentionsParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = ListMentionsParams.parse(params);
        const results = await fetchMentions(graphClient, parsed);

        if (results.length === 0) {
          return { content: [{ type: "text", text: "No mentions found." }] };
        }

        const lines = results.map((item) => formatMention(item));

        logger.info({ tool: "list_mentions", count: results.length }, "list_mentions completed");

        return {
          content: [
            { type: "text", text: `${lines.join("\n\n")}\nShowing ${results.length} mentions.` },
          ],
        };
      } catch (error) {
        return handleError("list_mentions", error, startTime);
      }
    },
  );
}

async function fetchMentions(
  graphClient: Client,
  parsed: ListMentionsParamsType,
): Promise<Record<string, unknown>[]> {
  const userPath = resolveUserPath(parsed.user_id);
  const results: Record<string, unknown>[] = [];

  if (parsed.source === "channels" || parsed.source === "all") {
    const page = await fetchPage<Record<string, unknown>>(
      graphClient,
      `${userPath}/teamwork/activityHistory`,
      {
        top: parsed.top ?? 25,
        skip: parsed.skip,
        filter: "activityType eq 'mention'",
      },
    );
    results.push(...page.items);
  }

  if (parsed.source === "chats" || parsed.source === "all") {
    const page = await fetchPage<Record<string, unknown>>(
      graphClient,
      `${userPath}/chats/getAllMessages`,
      {
        top: parsed.top ?? 25,
        skip: parsed.skip,
      },
    );
    results.push(...page.items);
  }

  return results;
}

function handleError(toolName: string, error: unknown, startTime: number): ToolResult {
  if (error instanceof McpToolError) {
    logger.warn(
      {
        tool: toolName,
        status: error.httpStatus,
        code: error.code,
        duration_ms: Date.now() - startTime,
      },
      `${toolName} failed`,
    );
    return {
      content: [{ type: "text" as const, text: formatErrorForUser(error) }],
      isError: true,
    };
  }
  throw error;
}
