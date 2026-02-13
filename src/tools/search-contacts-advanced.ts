import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { AdvancedSearchContactsParams } from "../schemas/search-advanced.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { sanitizeKqlQuery } from "../utils/kql-builder.js";
import { createLogger } from "../utils/logger.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:search-contacts-advanced");

interface SearchHit {
  resource: Record<string, unknown>;
  rank: number;
}

function parseContactSearchHits(response: unknown): {
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
  }));

  return { hits, total, moreAvailable };
}

function extractPrimaryEmail(resource: Record<string, unknown>): string {
  const emails = resource.emailAddresses;
  if (Array.isArray(emails) && emails.length > 0) {
    const first = emails[0] as Record<string, unknown>;
    return typeof first.address === "string" ? first.address : "";
  }
  // Person entity uses scoredEmailAddresses
  const scored = resource.scoredEmailAddresses;
  if (Array.isArray(scored) && scored.length > 0) {
    const first = scored[0] as Record<string, unknown>;
    return typeof first.address === "string" ? first.address : "";
  }
  return "";
}

function formatContactHit(hit: SearchHit): string {
  const r = hit.resource;
  const name = String(r.displayName ?? "(unknown)");
  const email = extractPrimaryEmail(r);
  const company = String(r.companyName ?? "");
  const title = String(r.jobTitle ?? "");
  const parts = [name];
  if (email) parts.push(email);
  if (company) parts.push(company);
  if (title) parts.push(title);
  return `[${hit.rank}] ${parts.join(" | ")}`;
}

export function registerAdvancedSearchContactsTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "advanced_search_contacts",
    "Advanced contact/people search using KQL via Microsoft Search API. Searches across displayName, emailAddress, companyName, and jobTitle. Returns relevance-ranked results. Examples: 'displayName:john emailAddress:@example.com companyName:Microsoft'.",
    AdvancedSearchContactsParams.shape,
    async (params) => {
      try {
        const parsed = AdvancedSearchContactsParams.parse(params);

        const searchRequest = {
          entityTypes: ["person"],
          query: { queryString: sanitizeKqlQuery(parsed.kql_query) },
          from: parsed.from ?? 0,
          size: parsed.size ?? 25,
        };

        const response: unknown = await graphClient
          .api("/search/query")
          .post({ requests: [searchRequest] });

        const { hits, total, moreAvailable } = parseContactSearchHits(response);

        if (hits.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No contacts found for KQL query: ${parsed.kql_query}`,
              },
            ],
          };
        }

        const lines = hits.map((hit) => formatContactHit(hit));
        lines.unshift(`Found ${total} contact(s)${moreAvailable ? " (more available)" : ""}:\n`);

        if (moreAvailable) {
          const nextFrom = (parsed.from ?? 0) + (parsed.size ?? 25);
          lines.push(`\nMore results available. Use from: ${nextFrom} to load next page.`);
        }

        logger.info(
          { tool: "advanced_search_contacts", hitCount: hits.length, total },
          "advanced_search_contacts completed",
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
