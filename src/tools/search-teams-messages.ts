import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { SearchTeamsMessagesParams } from "../schemas/search-advanced.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { sanitizeKqlQuery } from "../utils/kql-builder.js";
import { createLogger } from "../utils/logger.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:search-teams-messages");

interface SearchHit {
  resource: Record<string, unknown>;
  rank: number;
  summary?: string;
}

function parseMessageSearchHits(response: unknown): {
  hits: SearchHit[];
  total: number;
  moreAvailable: boolean;
} {
  if (!isRecordObject(response)) {
    return { hits: [], total: 0, moreAvailable: false };
  }

  const value = response.value;
  if (!Array.isArray(value) || value.length === 0) {
    return { hits: [], total: 0, moreAvailable: false };
  }

  const container = value[0] as Record<string, unknown>;
  const hitsArray = Array.isArray(container.hits) ? container.hits : [];
  const total = typeof container.total === "number" ? container.total : hitsArray.length;
  const moreAvailable = container.moreResultsAvailable === true;

  const hits: SearchHit[] = (hitsArray as Record<string, unknown>[]).map((h) => ({
    resource: isRecordObject(h.resource) ? h.resource : {},
    rank: typeof h.rank === "number" ? h.rank : 0,
    summary: typeof h.summary === "string" ? h.summary : undefined,
  }));

  return { hits, total, moreAvailable };
}

function extractSenderName(resource: Record<string, unknown>): string {
  const from = resource.from;
  if (!isRecordObject(from)) return "(unknown)";
  const user = (from as Record<string, unknown>).user;
  if (!isRecordObject(user)) return "(unknown)";
  return typeof user.displayName === "string" ? user.displayName : "(unknown)";
}

function formatTeamsMessageHit(hit: SearchHit): string {
  const r = hit.resource;
  const sender = extractSenderName(r);
  const preview = hit.summary ?? String(r.bodyPreview ?? "");
  const created = String(r.createdDateTime ?? "");
  const channelId = String(r.channelIdentity ?? "");
  const chatId = String(r.chatId ?? "");
  const context = channelId ? "Channel" : chatId ? "Chat" : "Unknown";
  return `[${hit.rank}] ${sender}: ${preview}\n  ${context} | ${created}`;
}

export function registerSearchTeamsMessagesTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "search_teams_messages",
    "Search across all Teams messages (channels and chats) using KQL via Microsoft Search API. Supports queries for sender, body content, and date ranges. Returns messages with channel/chat context. Examples: 'from:john@example.com body:budget created>=2026-01-01'.",
    SearchTeamsMessagesParams.shape,
    async (params) => {
      try {
        const parsed = SearchTeamsMessagesParams.parse(params);

        const searchRequest = {
          entityTypes: ["chatMessage"],
          query: { queryString: sanitizeKqlQuery(parsed.kql_query) },
          from: parsed.from ?? 0,
          size: parsed.size ?? 25,
        };

        const response: unknown = await graphClient
          .api("/search/query")
          .post({ requests: [searchRequest] });

        const { hits, total, moreAvailable } = parseMessageSearchHits(response);

        if (hits.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No Teams messages found for KQL query: ${parsed.kql_query}`,
              },
            ],
          };
        }

        const lines = hits.map((hit) => formatTeamsMessageHit(hit));
        lines.unshift(`Found ${total} message(s)${moreAvailable ? " (more available)" : ""}:\n`);

        if (moreAvailable) {
          const nextFrom = (parsed.from ?? 0) + (parsed.size ?? 25);
          lines.push(`\nMore results available. Use from: ${nextFrom} to load next page.`);
        }

        logger.info(
          { tool: "search_teams_messages", hitCount: hits.length, total },
          "search_teams_messages completed",
        );

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
