import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { SearchContactsParams } from "../schemas/contacts.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:contacts-search");

function formatSearchResult(c: Record<string, unknown>): string {
  const name = String(c.displayName ?? "(unnamed)");
  const emails = formatEmailList(c.emailAddresses);
  const emailStr = emails ? ` | ${emails}` : "";
  const company = typeof c.companyName === "string" && c.companyName ? ` | ${c.companyName}` : "";
  const id = String(c.id ?? "");
  return `${name}${emailStr}${company}\n  ID: ${id}`;
}

function formatEmailList(addresses: unknown): string {
  if (!Array.isArray(addresses)) return "";
  return addresses
    .filter(isRecordObject)
    .map((e) => String(e.address ?? ""))
    .filter(Boolean)
    .join(", ");
}

export function registerContactsSearchTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "search_contacts",
    "Search contacts by name, email, company, or other fields. Uses full-text search. For structured filtering, use list_contacts with $filter instead.",
    SearchContactsParams.shape,
    async (params) => {
      try {
        const parsed = SearchContactsParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/contacts`;

        let request = graphClient.api(url);
        request = request.header("ConsistencyLevel", "eventual");
        const sanitizedQuery = parsed.query.replace(/"/g, "");
        request = request.search(`"${sanitizedQuery}"`);
        request = request.select(buildSelectParam(DEFAULT_SELECT.contact));
        request = request.top(parsed.top ?? config.limits.maxItems);
        request = request.query({ $count: "true" });

        const response = (await request.get()) as Record<string, unknown>;

        if (!isRecordObject(response) || !Array.isArray(response.value)) {
          return { content: [{ type: "text" as const, text: "No results found." }] };
        }

        const items = response.value as Record<string, unknown>[];
        const totalCount =
          typeof response["@odata.count"] === "number" ? response["@odata.count"] : undefined;

        const { items: shaped, paginationHint } = shapeListResponse(items, totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          shaped.length === 0
            ? `No contacts found for "${parsed.query}".`
            : [...shaped.map(formatSearchResult), "", paginationHint].join("\n");

        logger.info({ tool: "search_contacts", count: shaped.length }, "search_contacts completed");
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
