import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { SearchFilesParamsType } from "../schemas/files.js";
import { SearchFilesParams } from "../schemas/files.js";
import { resolveDrivePath } from "../utils/drive-path.js";
import { formatErrorForUser, McpToolError } from "../utils/errors.js";
import { formatFileSize } from "../utils/file-size.js";
import { createLogger } from "../utils/logger.js";
import {
  assertValidPageToken,
  fetchPage,
  formatTokenPageHint,
  withPageTokenHint,
} from "../utils/pagination.js";
import { buildSelectParam, DEFAULT_SELECT } from "../utils/response-shaper.js";

const logger = createLogger("tools:drive-search");

function formatSearchResult(item: Record<string, unknown>): string {
  const name = String(item.name ?? "");
  const id = String(item.id ?? "");
  const isFolder = item.folder !== undefined && item.folder !== null;
  const size = typeof item.size === "number" ? formatFileSize(item.size) : "";
  const modified = String(item.lastModifiedDateTime ?? "");
  const webUrl = String(item.webUrl ?? "");
  const typeIndicator = isFolder ? "[Folder]" : "[File]";
  const sizeInfo = isFolder ? "" : ` | ${size}`;

  return `${typeIndicator} ${name}${sizeInfo} | ${modified}\n  ID: ${id}\n  URL: ${webUrl}`;
}

export function registerDriveSearchTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "search_files",
    "Search for files and folders in OneDrive by name or content. Uses full-text search. Returns matching items with name, size, type, and URL. top up to 200 per page (default 25); for more results pass the page_token from the previous page's 'next page' hint (skip is not supported).",
    SearchFilesParams.shape,
    async (params) => {
      try {
        const parsed = SearchFilesParams.parse(params) as SearchFilesParamsType;
        assertValidPageToken(parsed.page_token, parsed.skip);
        const drivePath = resolveDrivePath(parsed.user_id, parsed.site_id, parsed.drive_id);
        const url = `${drivePath}/root/search(q='${parsed.query}')`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip !== undefined && parsed.skip > 0 ? parsed.skip : undefined,
          skipToken: parsed.page_token,
          select: buildSelectParam(DEFAULT_SELECT.file),
        });

        const items = page.items;
        if (items.length === 0) {
          return {
            content: [{ type: "text", text: `No results for "${parsed.query}".` }],
          };
        }

        const lines = items.map((item) => formatSearchResult(item));
        const hint = formatTokenPageHint(items.length, page.nextSkipToken, page.hasMore);

        logger.info({ tool: "search_files", resultCount: items.length }, "search_files completed");

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (rawError) {
        const error = withPageTokenHint(rawError);
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "search_files", status: error.httpStatus, code: error.code },
            "search_files failed",
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
