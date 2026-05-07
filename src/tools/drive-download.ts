import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { DownloadFileParamsType } from "../schemas/files.js";
import { DownloadFileParams } from "../schemas/files.js";
import type { ToolResult } from "../types/tools.js";
import { normalizeDrivePath, resolveDrivePath } from "../utils/drive-path.js";
import { formatErrorForUser, McpToolError } from "../utils/errors.js";
import { formatFileSize, isTextContent } from "../utils/file-size.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:drive-download");

const SIZE_WARNING_THRESHOLD = 4 * 1024 * 1024; // 4 MB
const SIZE_ABORT_THRESHOLD = 10 * 1024 * 1024; // 10 MB

interface DriveItemMetadata {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  file?: { mimeType: string };
  folder?: unknown;
}

function buildMetadataHeader(meta: DriveItemMetadata): string {
  const lines = [`Name: ${meta.name}`, `Size: ${formatFileSize(meta.size)}`];
  if (meta.file?.mimeType) {
    lines.push(`MIME type: ${meta.file.mimeType}`);
  }
  return lines.join("\n");
}

export function buildDriveItemUrl(drivePath: string, fileId: string, siteId?: string): string {
  // Accept either a Graph item ID or a path starting with "/" (e.g. "/folder/file.md").
  // Paths are addressed via the /root: addressing mode; IDs via /items/.
  if (fileId.startsWith("/")) {
    const normalized = normalizeDrivePath(fileId, siteId);
    const trimmed = normalized.replace(/\/+$/, "");
    return `${drivePath}/root:${trimmed}`;
  }
  return `${drivePath}/items/${encodeGraphId(fileId)}`;
}

async function handleDownloadFile(
  graphClient: Client,
  parsed: DownloadFileParamsType,
): Promise<ToolResult> {
  const startTime = Date.now();
  const drivePath = resolveDrivePath(parsed.user_id, parsed.site_id, parsed.drive_id);
  const itemUrl = buildDriveItemUrl(drivePath, parsed.file_id, parsed.site_id);
  const isPathRef = parsed.file_id.startsWith("/");

  // Step 1: Metadata
  const meta = (await graphClient
    .api(itemUrl)
    .select("id,name,size,webUrl,file,folder")
    .get()) as DriveItemMetadata;

  // Reject folders
  if (meta.folder !== undefined && meta.folder !== null) {
    return {
      content: [
        { type: "text", text: "Cannot download a folder. Use list_files to browse its contents." },
      ],
      isError: true,
    };
  }

  // Size check: >10MB → abort
  if (meta.size > SIZE_ABORT_THRESHOLD) {
    logger.warn(
      { tool: "download_file", sizeBytes: meta.size, duration_ms: Date.now() - startTime },
      "download_file aborted: file too large",
    );
    return {
      content: [
        {
          type: "text",
          text: `File too large: ${formatFileSize(meta.size)} (max 10 MB). Download aborted.\n\nYou can access the file via: ${meta.webUrl}`,
        },
      ],
      isError: true,
    };
  }

  // Size warning: >4MB
  const warning =
    meta.size > SIZE_WARNING_THRESHOLD
      ? `Warning: This file is ${formatFileSize(meta.size)}.\n`
      : "";

  // Step 2: Download content. Path-addressed items use /root:/path:/content.
  const contentUrl = isPathRef ? `${itemUrl}:/content` : `${itemUrl}/content`;
  const response = await graphClient.api(contentUrl).getStream();
  const chunks: Buffer[] = [];
  for await (const chunk of response as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  const mimeType = meta.file?.mimeType ?? "application/octet-stream";
  const isText = isTextContent(mimeType, meta.name);

  const header = buildMetadataHeader(meta);
  let body: string;
  if (isText) {
    body = buffer.toString("utf-8");
  } else {
    body = `Base64-encoded content (${mimeType}):\n${buffer.toString("base64")}`;
  }

  const endTime = Date.now();
  logger.info(
    {
      tool: "download_file",
      sizeBytes: meta.size,
      mimeType,
      status: 200,
      duration_ms: endTime - startTime,
    },
    "download_file completed",
  );

  return {
    content: [{ type: "text", text: `${header}\n${warning}\n${body}` }],
  };
}

export function registerDriveDownloadTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "download_file",
    "Download a file from OneDrive by ID. Text files are returned as UTF-8, binary files as base64. Files >4MB show a warning, >10MB are rejected. Use get_file_metadata first to check size.",
    DownloadFileParams.shape,
    async (params) => {
      try {
        const parsed = DownloadFileParams.parse(params);
        return await handleDownloadFile(graphClient, parsed);
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "download_file", status: error.httpStatus, code: error.code },
            "download_file failed",
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
