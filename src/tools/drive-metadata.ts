import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { GetFileMetadataParams } from "../schemas/files.js";
import { resolveDrivePath } from "../utils/drive-path.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { formatFileSize } from "../utils/file-size.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:drive-metadata");

function formatBasicInfo(item: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const name = String(item.name ?? "");
  const id = String(item.id ?? "");
  const isFolder = item.folder !== undefined && item.folder !== null;
  const size = typeof item.size === "number" ? formatFileSize(item.size) : "";

  lines.push(`Name: ${name}`);
  lines.push(`Type: ${isFolder ? "Folder" : "File"}`);
  lines.push(`ID: ${id}`);
  if (!isFolder && size) lines.push(`Size: ${size}`);
  if (item.createdDateTime) lines.push(`Created: ${String(item.createdDateTime)}`);
  if (item.lastModifiedDateTime) lines.push(`Modified: ${String(item.lastModifiedDateTime)}`);
  if (item.webUrl) lines.push(`URL: ${String(item.webUrl)}`);
  if (item.description) lines.push(`Description: ${String(item.description)}`);
  return lines;
}

function formatExtendedInfo(item: Record<string, unknown>): string[] {
  const lines: string[] = [];

  if (isRecordObject(item.parentReference) && item.parentReference.path) {
    lines.push(`Parent: ${String(item.parentReference.path)}`);
  }
  if (isRecordObject(item.lastModifiedBy) && isRecordObject(item.lastModifiedBy.user)) {
    lines.push(
      `Modified by: ${String(item.lastModifiedBy.user.displayName ?? item.lastModifiedBy.user.email ?? "")}`,
    );
  }
  if (isRecordObject(item.createdBy) && isRecordObject(item.createdBy.user)) {
    lines.push(
      `Created by: ${String(item.createdBy.user.displayName ?? item.createdBy.user.email ?? "")}`,
    );
  }
  if (isRecordObject(item.file) && item.file.mimeType) {
    lines.push(`MIME type: ${String(item.file.mimeType)}`);
  }
  if (isRecordObject(item.folder) && typeof item.folder.childCount === "number") {
    lines.push(`Children: ${item.folder.childCount}`);
  }
  if (isRecordObject(item.shared)) {
    lines.push("Shared: Yes");
    if (item.shared.scope) lines.push(`Share scope: ${String(item.shared.scope)}`);
  }
  return lines;
}

function formatMetadataDetail(item: Record<string, unknown>): string {
  return [...formatBasicInfo(item), ...formatExtendedInfo(item)].join("\n");
}

export function registerDriveMetadataTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "get_file_metadata",
    "Get detailed metadata for a file or folder in OneDrive. Returns name, size, type, dates, parent path, creator, modifier, sharing info, and MIME type.",
    GetFileMetadataParams.shape,
    async (params) => {
      try {
        const parsed = GetFileMetadataParams.parse(params);
        const drivePath = resolveDrivePath(parsed.user_id, parsed.site_id, parsed.drive_id);
        const url = `${drivePath}/items/${encodeGraphId(parsed.file_id)}`;

        const item = (await graphClient
          .api(url)
          .select(buildSelectParam(DEFAULT_SELECT.fileDetail))
          .get()) as Record<string, unknown>;

        logger.info({ tool: "get_file_metadata" }, "get_file_metadata completed");

        return { content: [{ type: "text", text: formatMetadataDetail(item) }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "get_file_metadata", status: error.httpStatus, code: error.code },
            "get_file_metadata failed",
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
