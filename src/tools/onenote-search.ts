import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { SearchNotesParams } from "../schemas/onenote.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";

const logger = createLogger("tools:onenote-search");

interface OneNotePage extends Record<string, unknown> {
  id?: string;
  title?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  contentUrl?: string;
}

function formatPageResult(index: number, page: OneNotePage): string {
  const title = String(page.title ?? "(no title)");
  const created = String(page.createdDateTime ?? "(unknown)");
  const modified = String(page.lastModifiedDateTime ?? "(unknown)");
  const contentUrl = String(page.contentUrl ?? "(no URL)");
  const id = String(page.id ?? "(no ID)");

  return `[${index}] ${title}\n  ID: ${id}\n  Created: ${created}\n  Modified: ${modified}\n  Content URL: ${contentUrl}`;
}

export function registerOneNoteSearchTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "search_notes",
    "Search OneNote pages using full-text search. Searches across page titles and content. Returns matching pages with metadata including creation/modification dates and content URLs.",
    SearchNotesParams.shape,
    async (params) => {
      try {
        const parsed = SearchNotesParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        const url = `${userPath}/onenote/pages`;

        const page = await fetchPage<OneNotePage>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.page),
          query: { $search: parsed.query },
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? `No OneNote pages found matching: "${parsed.query}"`
            : [
                `Search results for "${parsed.query}":\n`,
                ...items.map((p, i) => formatPageResult(i + 1, p)),
                "",
                paginationHint,
              ].join("\n");

        logger.info(
          { tool: "search_notes", pageCount: items.length, query: parsed.query },
          "search_notes completed",
        );

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
