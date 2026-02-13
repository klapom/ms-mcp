import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { AdvancedSearchEmailsParamsType } from "../schemas/search-advanced.js";
import { AdvancedSearchEmailsParams } from "../schemas/search-advanced.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { sanitizeKqlQuery } from "../utils/kql-builder.js";
import { createLogger } from "../utils/logger.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:search-emails-advanced");

interface SearchHit {
  resource: Record<string, unknown>;
  rank: number;
  summary?: string;
}

function parseSearchHits(response: unknown): {
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

function formatEmailHit(hit: SearchHit): string {
  const r = hit.resource;
  const subject = String(r.subject ?? "(no subject)");
  const from = extractFromAddress(r);
  const date = String(r.receivedDateTime ?? "");
  const preview = hit.summary ?? String(r.bodyPreview ?? "");
  return `[${hit.rank}] ${subject}\n  From: ${from} | ${date}\n  ${preview}`;
}

function extractFromAddress(resource: Record<string, unknown>): string {
  if (!isRecordObject(resource.from)) return "(unknown)";
  const ea = (resource.from as Record<string, unknown>).emailAddress;
  if (!isRecordObject(ea)) return "(unknown)";
  const name = typeof ea.name === "string" ? ea.name : "";
  const address = typeof ea.address === "string" ? ea.address : "";
  return name ? `${name} <${address}>` : address || "(unknown)";
}

function buildSearchRequest(parsed: AdvancedSearchEmailsParamsType): Record<string, unknown> {
  const request: Record<string, unknown> = {
    entityTypes: ["message"],
    query: { queryString: sanitizeKqlQuery(parsed.kql_query) },
    from: parsed.from ?? 0,
    size: parsed.size ?? 25,
  };

  if (parsed.enable_query_interpretation) {
    request.queryAlterationOptions = {
      enableSuggestion: true,
      enableModification: true,
    };
  }

  if (parsed.sort) {
    request.sortProperties = parsed.sort.map((s) => ({
      name: s.property,
      isDescending: s.direction === "descending",
    }));
  }

  return request;
}

export function registerAdvancedSearchEmailsTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "advanced_search_emails",
    "Advanced email search using KQL (Keyword Query Language) via Microsoft Search API. Supports complex queries with from, subject, hasAttachment, date ranges, and boolean operators. Returns relevance-ranked results. Examples: 'from:john@example.com subject:quarterly hasAttachment:true received>=2026-01-01'.",
    AdvancedSearchEmailsParams.shape,
    async (params) => {
      try {
        const parsed = AdvancedSearchEmailsParams.parse(params);
        const searchRequest = buildSearchRequest(parsed);

        const response: unknown = await graphClient
          .api("/search/query")
          .post({ requests: [searchRequest] });

        const { hits, total, moreAvailable } = parseSearchHits(response);

        if (hits.length === 0) {
          return {
            content: [
              { type: "text" as const, text: `No results for KQL query: ${parsed.kql_query}` },
            ],
          };
        }

        const lines = hits.map((hit) => formatEmailHit(hit));
        lines.unshift(`Found ${total} email(s)${moreAvailable ? " (more available)" : ""}:\n`);

        if (moreAvailable) {
          const nextFrom = (parsed.from ?? 0) + (parsed.size ?? 25);
          lines.push(`\nMore results available. Use from: ${nextFrom} to load next page.`);
        }

        logger.info(
          { tool: "advanced_search_emails", hitCount: hits.length, total },
          "advanced_search_emails completed",
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
