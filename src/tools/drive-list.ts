import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { GetRecentFilesParamsType, ListFilesParamsType } from "../schemas/files.js";
import { GetRecentFilesParams, ListFilesParams } from "../schemas/files.js";
import { McpToolError, ValidationError, formatErrorForUser } from "../utils/errors.js";
import { formatFileSize } from "../utils/file-size.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";

const logger = createLogger("tools:drive-list");

function resolveDriveListUrl(userPath: string, parsed: ListFilesParamsType): string {
  if (parsed.folder_id && parsed.path) {
    throw new ValidationError("folder_id and path are mutually exclusive. Provide only one.");
  }
  if (parsed.folder_id) {
    return `${userPath}/drive/items/${encodeGraphId(parsed.folder_id)}/children`;
  }
  if (parsed.path) {
    const cleanPath = parsed.path.startsWith("/") ? parsed.path : `/${parsed.path}`;
    return `${userPath}/drive/root:${cleanPath}:/children`;
  }
  return `${userPath}/drive/root/children`;
}

function formatDriveItem(item: Record<string, unknown>): string {
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

export function registerDriveListTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_files",
    "List files and folders in OneDrive. Use folder_id OR path (not both) to target a specific folder, or omit both for root. Returns name, size, type, and modification date.",
    ListFilesParams.shape,
    async (params) => {
      try {
        const parsed = ListFilesParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = resolveDriveListUrl(userPath, parsed);

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.file),
          orderby: "name asc",
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "Folder is empty." }] };
        }

        const lines = page.items.map((item) => formatDriveItem(item));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} items. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} items.`;

        logger.info({ tool: "list_files", count: page.items.length }, "list_files completed");

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "list_files", status: error.httpStatus, code: error.code },
            "list_files failed",
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

  server.tool(
    "get_recent_files",
    "Get recently accessed files from OneDrive. Returns the same format as list_files.",
    GetRecentFilesParams.shape,
    async (params) => {
      try {
        const parsed = GetRecentFilesParams.parse(params) as GetRecentFilesParamsType;
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/drive/recent`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.file),
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No recent files." }] };
        }

        const lines = page.items.map((item) => formatDriveItem(item));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} items. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} items.`;

        logger.info(
          { tool: "get_recent_files", count: page.items.length },
          "get_recent_files completed",
        );

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "get_recent_files", status: error.httpStatus, code: error.code },
            "get_recent_files failed",
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
