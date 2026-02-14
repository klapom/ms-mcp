import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { ListSectionsParams } from "../schemas/onenote.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { buildSelectParam } from "../utils/response-shaper.js";

const logger = createLogger("tools:onenote-sections");

const DEFAULT_SECTION_SELECT = [
  "id",
  "displayName",
  "createdDateTime",
  "lastModifiedDateTime",
  "pagesUrl",
];

function formatSectionSummary(section: Record<string, unknown>): string {
  const displayName = String(section.displayName ?? "(unnamed)");
  const id = String(section.id ?? "");
  const created = String(section.createdDateTime ?? "");
  const modified = String(section.lastModifiedDateTime ?? "");
  const pagesUrl = String(section.pagesUrl ?? "");

  return `Section: ${displayName}\nID: ${id}\nCreated: ${created}\nModified: ${modified}\nPages URL: ${pagesUrl}`;
}

export function registerOneNoteSectionsTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "list_sections",
    "List sections in a OneNote notebook. Returns section name, creation date, modification date, and pages URL.",
    ListSectionsParams.shape,
    async (params) => {
      try {
        const parsed = ListSectionsParams.parse(params);
        const url = `/me/onenote/notebooks/${encodeGraphId(parsed.notebook_id)}/sections`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SECTION_SELECT),
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No sections found in this notebook." }] };
        }

        const lines = page.items.map((section) => formatSectionSummary(section));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} sections. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} sections.`;

        logger.info(
          { tool: "list_sections", count: page.items.length, notebookId: parsed.notebook_id },
          "list_sections completed",
        );

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "list_sections", status: error.httpStatus, code: error.code },
            "list_sections failed",
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
