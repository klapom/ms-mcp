import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { SearchAllParams } from "../schemas/search-advanced.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { sanitizeKqlQuery } from "../utils/kql-builder.js";
import { createLogger } from "../utils/logger.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:search-all");

const ALL_ENTITY_TYPES = ["message", "event", "driveItem", "person", "chatMessage"] as const;

const ENTITY_TYPE_LABELS: Record<string, string> = {
  message: "Emails",
  event: "Events",
  driveItem: "Files",
  person: "Contacts",
  chatMessage: "Teams Messages",
};

interface HitsContainer {
  entityType: string;
  hits: Record<string, unknown>[];
  total: number;
  moreAvailable: boolean;
}

function parseSearchAllResponse(response: unknown): HitsContainer[] {
  if (!isRecordObject(response)) return [];

  const value = response.value;
  if (!Array.isArray(value)) return [];

  return value.map((container) => {
    const c = container as Record<string, unknown>;
    const hitsArray = Array.isArray(c.hits) ? (c.hits as Record<string, unknown>[]) : [];
    const total = typeof c.total === "number" ? c.total : hitsArray.length;
    const moreAvailable = c.moreResultsAvailable === true;

    // Determine entity type from first hit's resource @odata.type or from container
    let entityType = "unknown";
    if (hitsArray.length > 0) {
      const firstHit = hitsArray[0];
      const resource = isRecordObject(firstHit.resource) ? firstHit.resource : {};
      const odataType = typeof resource["@odata.type"] === "string" ? resource["@odata.type"] : "";
      entityType = inferEntityType(odataType);
    }

    return { entityType, hits: hitsArray, total, moreAvailable };
  });
}

function inferEntityType(odataType: string): string {
  if (odataType.includes("message")) return "message";
  if (odataType.includes("event")) return "event";
  if (odataType.includes("driveItem")) return "driveItem";
  if (odataType.includes("person")) return "person";
  if (odataType.includes("chatMessage")) return "chatMessage";
  return "unknown";
}

function formatHitPreview(hit: Record<string, unknown>): string {
  const resource = isRecordObject(hit.resource) ? hit.resource : {};
  const subject = resource.subject ?? resource.displayName ?? resource.name ?? "(untitled)";
  return `  - ${String(subject)}`;
}

function formatContainerSummary(container: HitsContainer): string {
  const label = ENTITY_TYPE_LABELS[container.entityType] ?? container.entityType;
  const lines: string[] = [];
  lines.push(`${label} (${container.total}):`);

  const previews = container.hits.slice(0, 3);
  for (const hit of previews) {
    lines.push(formatHitPreview(hit));
  }

  if (container.total > 3) {
    lines.push(`  ... and ${container.total - 3} more`);
  }

  return lines.join("\n");
}

export function registerSearchAllTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "search_all",
    "Universal search across all Microsoft 365 content types. Searches emails, events, files, contacts, and Teams messages in a single query. Results are grouped by type with previews. Use entity_types to limit search scope. For detailed results, use the type-specific search tools.",
    SearchAllParams.shape,
    async (params) => {
      try {
        const parsed = SearchAllParams.parse(params);
        const entityTypes = parsed.entity_types ?? [...ALL_ENTITY_TYPES];
        const queryString = sanitizeKqlQuery(parsed.query);

        const requests = entityTypes.map((entityType) => ({
          entityTypes: [entityType],
          query: { queryString },
          from: parsed.from ?? 0,
          size: parsed.size ?? 10,
        }));

        const response: unknown = await graphClient.api("/search/query").post({ requests });

        const containers = parseSearchAllResponse(response);

        const nonEmpty = containers.filter((c) => c.total > 0);

        if (nonEmpty.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No results found for: ${parsed.query}` }],
          };
        }

        const sections = nonEmpty.map((c) => formatContainerSummary(c));
        const totalHits = nonEmpty.reduce((sum, c) => sum + c.total, 0);
        sections.unshift(`Found ${totalHits} result(s) across ${nonEmpty.length} type(s):\n`);
        sections.push("\nUse type-specific search tools for full results.");

        logger.info(
          { tool: "search_all", typeCount: nonEmpty.length, totalHits },
          "search_all completed",
        );

        return { content: [{ type: "text" as const, text: sections.join("\n\n") }] };
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
