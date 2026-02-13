import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { SearchFilesParamsType } from "../schemas/files.js";
import { SearchFilesParams } from "../schemas/files.js";
import { resolveDrivePath } from "../utils/drive-path.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { formatFileSize } from "../utils/file-size.js";
import { createLogger } from "../utils/logger.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

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
    "Search for files and folders in OneDrive by name or content. Uses full-text search. Returns matching items with name, size, type, and URL.",
    SearchFilesParams.shape,
    async (params) => {
      try {
        const parsed = SearchFilesParams.parse(params) as SearchFilesParamsType;
        const drivePath = resolveDrivePath(parsed.user_id, parsed.site_id, parsed.drive_id);
        const url = `${drivePath}/root/search(q='${parsed.query}')`;

        let request = graphClient.api(url);
        request = request.select(buildSelectParam(DEFAULT_SELECT.file));
        request = request.top(parsed.top ?? config.limits.maxItems);
        if (parsed.skip !== undefined && parsed.skip > 0) {
          request = request.skip(parsed.skip);
        }

        const response = (await request.get()) as unknown;

        if (!isRecordObject(response) || !Array.isArray(response.value)) {
          return { content: [{ type: "text" as const, text: "No search results." }] };
        }

        const items = response.value as Record<string, unknown>[];
        if (items.length === 0) {
          return {
            content: [{ type: "text", text: `No results for "${parsed.query}".` }],
          };
        }

        const lines = items.map((item) => formatSearchResult(item));
        const hint = `\nShowing ${items.length} results.`;

        logger.info({ tool: "search_files", resultCount: items.length }, "search_files completed");

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
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
