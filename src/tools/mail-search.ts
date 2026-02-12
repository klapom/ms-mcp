import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { SearchEmailsParamsType } from "../schemas/mail.js";
import { SearchEmailsParams } from "../schemas/mail.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:mail-search");

interface SearchResponse {
  items: Record<string, unknown>[];
  totalCount: number | undefined;
  nextLink: string | undefined;
}

function parseSearchResponse(response: unknown): SearchResponse | undefined {
  if (!isRecordObject(response) || !Array.isArray(response.value)) {
    return undefined;
  }

  return {
    items: response.value as Record<string, unknown>[],
    totalCount: typeof response["@odata.count"] === "number" ? response["@odata.count"] : undefined,
    nextLink:
      typeof response["@odata.nextLink"] === "string" ? response["@odata.nextLink"] : undefined,
  };
}

function logUnsupportedParams(parsed: SearchEmailsParamsType): void {
  if (parsed.orderby) {
    logger.warn(
      { tool: "search_emails", orderby: parsed.orderby },
      "$orderby ignored: cannot be combined with $search (Graph API limitation)",
    );
  }

  if (parsed.skip !== undefined && parsed.skip > 0) {
    logger.warn(
      { tool: "search_emails", skip: parsed.skip },
      "$skip ignored: not supported with $search (Graph API limitation). Use @odata.nextLink for pagination.",
    );
  }

  if (parsed.filter) {
    logger.info(
      { tool: "search_emails", filter: parsed.filter },
      "$filter combined with $search: only receivedDateTime, from, and subject filters are supported by Graph API. Other filter fields may be silently ignored.",
    );
  }
}

function buildOutputLines(
  shaped: Record<string, unknown>[],
  query: string,
  skip: number | undefined,
  nextLink: string | undefined,
  paginationHint: string,
): string[] {
  const lines: string[] = [];

  if (shaped.length === 0) {
    lines.push(`Keine Ergebnisse für "${query}".`);
  } else {
    for (const email of shaped) {
      lines.push(formatSearchResult(email));
    }
  }

  if (skip !== undefined && skip > 0) {
    lines.push("");
    lines.push(
      "Hinweis: $skip wird bei $search nicht unterstützt. Nutze @odata.nextLink für Pagination.",
    );
  }

  if (nextLink) {
    lines.push("");
    lines.push(
      "Weitere Ergebnisse verfügbar. Nutze list_emails mit Pagination für gezielteres Browsen.",
    );
  }

  lines.push("", paginationHint);
  return lines;
}

export function registerMailSearchTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "search_emails",
    "Search emails using KQL (Keyword Query Language). Optimized for full-text search across subject, body, from, and attachments. Examples: 'subject:Angebot', 'from:mueller', 'body:Projekt AND hasAttachments:true'. Note: $search and $orderby cannot be combined (Graph API limitation). For folder-based browsing, use list_emails instead.",
    SearchEmailsParams.shape,
    async (params) => {
      try {
        const parsed = SearchEmailsParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        const basePath = parsed.folder
          ? `${userPath}/mailFolders/${parsed.folder}/messages`
          : `${userPath}/messages`;

        let request = graphClient.api(basePath);
        request = request.search(`"${parsed.query}"`);
        request = request.select(buildSelectParam(DEFAULT_SELECT.mail));
        request = request.top(parsed.top ?? config.limits.maxItems);

        if (parsed.filter) {
          request = request.filter(parsed.filter);
        }

        logUnsupportedParams(parsed);

        const response: unknown = await request.get();
        const searchResult = parseSearchResponse(response);

        if (!searchResult) {
          return {
            content: [{ type: "text" as const, text: "Keine Suchergebnisse." }],
          };
        }

        const { items: shaped, paginationHint } = shapeListResponse(
          searchResult.items,
          searchResult.totalCount,
          {
            maxItems: parsed.top ?? config.limits.maxItems,
            maxBodyLength: config.limits.maxBodyLength,
          },
          ["bodyPreview"],
        );

        const lines = buildOutputLines(
          shaped,
          parsed.query,
          parsed.skip,
          searchResult.nextLink,
          paginationHint,
        );

        logger.info(
          {
            tool: "search_emails",
            resultCount: shaped.length,
            hasMore: !!searchResult.nextLink,
          },
          "search_emails completed",
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

function formatSearchResult(email: Record<string, unknown>): string {
  const from = getFromAddress(email);
  const subject = String(email.subject ?? "(no subject)");
  const date = String(email.receivedDateTime ?? "");
  const preview = String(email.bodyPreview ?? "");
  const isRead = email.isRead === true;
  const importance = String(email.importance ?? "normal");
  const id = String(email.id ?? "");

  const readIndicator = isRead ? " " : "[NEW]";
  const importanceIndicator = importance === "high" ? "[!]" : "";

  return `${readIndicator}${importanceIndicator} ${subject}\n  From: ${from} | ${date}\n  ${preview}\n  ID: ${id}`;
}

function getFromAddress(email: Record<string, unknown>): string {
  if (!isRecordObject(email.from)) return "(unknown)";
  if (!isRecordObject(email.from.emailAddress)) return "(unknown)";
  const name = typeof email.from.emailAddress.name === "string" ? email.from.emailAddress.name : "";
  const address =
    typeof email.from.emailAddress.address === "string" ? email.from.emailAddress.address : "";
  return name ? `${name} <${address}>` : address || "(unknown)";
}
