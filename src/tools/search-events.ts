import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { SearchEventsParams } from "../schemas/search-advanced.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { sanitizeKqlQuery } from "../utils/kql-builder.js";
import { createLogger } from "../utils/logger.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:search-events");

interface SearchHit {
  resource: Record<string, unknown>;
  rank: number;
  summary?: string;
}

function parseEventSearchHits(response: unknown): {
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

function extractDateTimeString(dt: unknown): string {
  if (!isRecordObject(dt)) return "";
  return typeof dt.dateTime === "string" ? dt.dateTime : "";
}

function formatEventHit(hit: SearchHit): string {
  const r = hit.resource;
  const subject = String(r.subject ?? "(no subject)");
  const location = isRecordObject(r.location)
    ? String((r.location as Record<string, unknown>).displayName ?? "")
    : "";
  const start = extractDateTimeString(r.start);
  const end = extractDateTimeString(r.end);
  const locationInfo = location ? ` | ${location}` : "";
  return `[${hit.rank}] ${subject}${locationInfo}\n  ${start} - ${end}`;
}

export function registerSearchEventsTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "search_events",
    "Search calendar events using KQL via Microsoft Search API. Supports queries for subject, location, attendees, and date ranges. Returns relevance-ranked results. Examples: 'subject:\"sprint planning\" attendees:john@example.com start>=2026-02-01'.",
    SearchEventsParams.shape,
    async (params) => {
      try {
        const parsed = SearchEventsParams.parse(params);

        const searchRequest = {
          entityTypes: ["event"],
          query: { queryString: sanitizeKqlQuery(parsed.kql_query) },
          from: parsed.from ?? 0,
          size: parsed.size ?? 25,
        };

        const response: unknown = await graphClient
          .api("/search/query")
          .post({ requests: [searchRequest] });

        const { hits, total, moreAvailable } = parseEventSearchHits(response);

        if (hits.length === 0) {
          return {
            content: [
              { type: "text" as const, text: `No events found for KQL query: ${parsed.kql_query}` },
            ],
          };
        }

        const lines = hits.map((hit) => formatEventHit(hit));
        lines.unshift(`Found ${total} event(s)${moreAvailable ? " (more available)" : ""}:\n`);

        if (moreAvailable) {
          const nextFrom = (parsed.from ?? 0) + (parsed.size ?? 25);
          lines.push(`\nMore results available. Use from: ${nextFrom} to load next page.`);
        }

        logger.info(
          { tool: "search_events", hitCount: hits.length, total },
          "search_events completed",
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
