import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { UploadLargeFileParamsType } from "../schemas/file-upload.js";
import { UploadLargeFileParams } from "../schemas/file-upload.js";
import type { ToolResult } from "../types/tools.js";
import { formatPreview } from "../utils/confirmation.js";
import { resolveDrivePath } from "../utils/drive-path.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { formatFileSize } from "../utils/file-size.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { chunkBuffer, createUploadSession, uploadAllChunks } from "../utils/upload-session.js";

const logger = createLogger("tools:drive-upload-large");

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

function buildUploadPreview(
  parsed: UploadLargeFileParamsType,
  sizeBytes: number,
  chunkCount: number,
): ToolResult {
  const previewText = formatPreview("Upload large file (resumable)", {
    "File name": parsed.file_name,
    "Folder ID": parsed.folder_id ?? "root",
    Size: formatFileSize(sizeBytes),
    "Chunk count": chunkCount,
    "Conflict behavior": parsed.conflict_behavior,
  });

  return { content: [{ type: "text", text: previewText }] };
}

async function executeUpload(
  graphClient: Client,
  parsed: UploadLargeFileParamsType,
  startTime: number,
): Promise<ToolResult> {
  const buffer = Buffer.from(parsed.content_bytes, "base64");
  const totalSize = buffer.length;

  // Calculate chunks
  const chunks = chunkBuffer(parsed.content_bytes, DEFAULT_CHUNK_SIZE);

  // Resolve drive path
  const drivePath = resolveDrivePath(parsed.user_id, parsed.site_id, parsed.drive_id);

  // Encode folder ID if provided
  const encodedFolderId = parsed.folder_id ? encodeGraphId(parsed.folder_id) : undefined;

  // Create upload session
  const session = await createUploadSession(
    graphClient,
    drivePath,
    encodedFolderId,
    parsed.file_name,
    parsed.conflict_behavior,
  );

  logger.info(
    {
      tool: "upload_large_file",
      fileName: parsed.file_name,
      sizeBytes: totalSize,
      chunkCount: chunks.length,
      uploadUrl: session.uploadUrl,
    },
    "Upload session created",
  );

  // Upload all chunks
  const driveItem = await uploadAllChunks(session.uploadUrl, chunks, totalSize, DEFAULT_CHUNK_SIZE);

  const endTime = Date.now();
  logger.info(
    {
      tool: "upload_large_file",
      fileName: parsed.file_name,
      fileId: driveItem.id,
      sizeBytes: totalSize,
      chunkCount: chunks.length,
      status: 201,
      duration_ms: endTime - startTime,
    },
    "upload_large_file completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Large file uploaded successfully.\n\nName: ${driveItem.name}\nID: ${driveItem.id}\nSize: ${formatFileSize(driveItem.size)}\nURL: ${driveItem.webUrl}\n\nUploaded in ${chunks.length} chunk(s).`,
      },
    ],
  };
}

export function registerDriveUploadLargeTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "upload_large_file",
    "Upload a large file (>4MB) to OneDrive using resumable upload with chunked transfer. Requires confirm=true to actually upload — without it, returns a preview. Content must be base64-encoded. No size limit. Supports conflict resolution (fail, replace, rename). Use idempotency_key to prevent duplicate uploads.",
    UploadLargeFileParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = UploadLargeFileParams.parse(params);

        // Calculate size and chunk count for preview
        const buffer = Buffer.from(parsed.content_bytes, "base64");
        const totalSize = buffer.length;
        const chunkCount = Math.ceil(totalSize / DEFAULT_CHUNK_SIZE);

        // Check confirmation
        if (!parsed.confirm) {
          return buildUploadPreview(parsed, totalSize, chunkCount);
        }

        // Check idempotency cache
        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "upload_large_file",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        // Execute upload
        const result = await executeUpload(graphClient, parsed, startTime);

        // Cache result
        if (parsed.idempotency_key) {
          idempotencyCache.set("upload_large_file", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "upload_large_file",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "upload_large_file failed",
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
