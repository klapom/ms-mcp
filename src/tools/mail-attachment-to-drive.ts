import { createHash } from "node:crypto";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { SaveAttachmentToDriveParamsType } from "../schemas/mail-attachment-to-drive.js";
import { SaveAttachmentToDriveParams } from "../schemas/mail-attachment-to-drive.js";
import { fetchAttachmentContent } from "../tools/mail-attachments.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import {
  assertSafeDrivePath,
  assertSafeFileName,
  normalizeDrivePath,
  resolveDrivePath,
} from "../utils/drive-path.js";
import { formatErrorForUser, McpToolError, ValidationError } from "../utils/errors.js";
import { formatFileSize } from "../utils/file-size.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { uploadAllChunks } from "../utils/upload-session.js";

const logger = createLogger("tools:mail-attachment-to-drive");

const TOOL_NAME = "save_attachment_to_drive";
const MAX_SIMPLE_UPLOAD = 4 * 1024 * 1024; // 4 MB
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB (matches upload-session DEFAULT_CHUNK_SIZE)

/**
 * Joins a destination folder path and a validated file name into a single
 * Graph path-addressing segment with exactly one leading slash and no trailing
 * or doubled slashes (both of which `assertSafeDrivePath` rejects as empty
 * segments). Applies `normalizeDrivePath` so a `/Documents` prefix is stripped
 * for personal drives, mirroring `drive-upload.ts`.
 */
function joinDrivePath(folderPath: string, fileName: string): string {
  const normalized = normalizeDrivePath(folderPath);
  const withLead = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const trimmed = withLead.replace(/\/+$/, "");
  return `${trimmed}/${fileName}`;
}

/** Slice a raw Buffer into fixed-size chunks (no base64 round-trip). */
function sliceBuffer(buffer: Buffer, chunkSize: number): Buffer[] {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    chunks.push(buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length)));
  }
  return chunks;
}

function formatSuccess(name: unknown, id: unknown, webUrl: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `File uploaded successfully.\n\nName: ${String(name ?? "")}\nID: ${String(id ?? "")}\nURL: ${String(webUrl ?? "")}`,
      },
    ],
  };
}

async function simplePut(
  graphClient: Client,
  drivePath: string,
  fullPath: string,
  buffer: Buffer,
  startTime: number,
): Promise<ToolResult> {
  const url = `${drivePath}/root:${fullPath}:/content`;
  const item = (await graphClient
    .api(url)
    .header("Content-Type", "application/octet-stream")
    .put(buffer)) as Record<string, unknown>;

  logger.info(
    { tool: TOOL_NAME, sizeBytes: buffer.length, status: 200, duration_ms: Date.now() - startTime },
    "save_attachment_to_drive completed (simple)",
  );
  return formatSuccess(item.name, item.id, item.webUrl);
}

async function chunkedUpload(
  graphClient: Client,
  drivePath: string,
  fullPath: string,
  buffer: Buffer,
  startTime: number,
): Promise<ToolResult> {
  // createUploadSession (upload-session.ts) can only address root or an item ID,
  // not a path-addressed subfolder, so it cannot honor folder_path. Create the
  // session inline via the same path-addressing used by the simple PUT, then
  // reuse uploadAllChunks as-is for the transfer.
  const sessionUrl = `${drivePath}/root:${fullPath}:/createUploadSession`;
  const session = (await graphClient
    .api(sessionUrl)
    .post({ item: { "@microsoft.graph.conflictBehavior": "replace" } })) as {
    uploadUrl: string;
  };

  const chunks = sliceBuffer(buffer, CHUNK_SIZE);
  const driveItem = await uploadAllChunks(session.uploadUrl, chunks, buffer.length, CHUNK_SIZE);

  logger.info(
    {
      tool: TOOL_NAME,
      sizeBytes: buffer.length,
      chunkCount: chunks.length,
      status: 201,
      duration_ms: Date.now() - startTime,
    },
    "save_attachment_to_drive completed (chunked)",
  );
  return formatSuccess(driveItem.name, driveItem.id, driveItem.webUrl);
}

async function handleSaveAttachmentToDrive(
  graphClient: Client,
  parsed: SaveAttachmentToDriveParamsType,
  getAccessToken: (() => Promise<string>) | undefined,
  startTime: number,
): Promise<ToolResult> {
  const folderPath = parsed.folder_path;

  // Validate the destination BEFORE touching Graph so an invalid folder or an
  // explicit unsafe file name never leaks an attachment fetch. The bare root
  // "/" is trivially safe and would trip assertSafeDrivePath's empty-segment
  // rule, so it is the only value skipped here; the full joined path is always
  // validated below regardless.
  if (folderPath !== "/") {
    assertSafeDrivePath(folderPath);
  }

  let fileName = parsed.file_name;
  let fullPath: string | undefined;
  if (fileName !== undefined) {
    assertSafeFileName(fileName);
    fullPath = joinDrivePath(folderPath, fileName);
    // Defence in depth: validating the parts separately does not prove the join
    // is safe (e.g. an encoded traversal in the file name only resolves once
    // spliced into the full path and percent-decoded).
    assertSafeDrivePath(fullPath);
  }

  const fetched = await fetchAttachmentContent(
    graphClient,
    {
      message_id: parsed.message_id,
      attachment_id: parsed.attachment_id,
      user_id: parsed.user_id,
    },
    getAccessToken,
  );
  if (!fetched.ok) return fetched.result;

  const { meta, buffer } = fetched;

  if (fileName === undefined) {
    // Sanitize-by-rejection: an unsafe attachment name is refused, never rewritten.
    try {
      assertSafeFileName(meta.name);
    } catch {
      throw new ValidationError(
        `The attachment's own name (${JSON.stringify(meta.name)}) is not a safe OneDrive file name. Supply an explicit 'file_name' parameter instead.`,
      );
    }
    fileName = meta.name;
    fullPath = joinDrivePath(folderPath, fileName);
    assertSafeDrivePath(fullPath);
  }

  // fullPath is guaranteed assigned by one of the two branches above.
  const destination = fullPath as string;

  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Save attachment to OneDrive", {
      Attachment: meta.name,
      "Content-Type": meta.contentType,
      Size: formatFileSize(meta.size),
      Destination: destination,
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }

  // Always idempotent: a caller-supplied key wins, otherwise derive a stable one
  // so a cron retry after a timeout does not duplicate the file. Checked before
  // any upload; the cache key additionally scopes by user_id for tenant isolation.
  const idempotencyKey =
    parsed.idempotency_key ??
    createHash("sha256")
      .update(`${parsed.message_id}|${parsed.attachment_id}|${folderPath}|${fileName}`)
      .digest("hex");

  const cached = idempotencyCache.get(TOOL_NAME, idempotencyKey, parsed.user_id);
  if (cached !== undefined) return cached as ToolResult;

  const drivePath = resolveDrivePath(parsed.user_id);
  const result =
    buffer.length <= MAX_SIMPLE_UPLOAD
      ? await simplePut(graphClient, drivePath, destination, buffer, startTime)
      : await chunkedUpload(graphClient, drivePath, destination, buffer, startTime);

  idempotencyCache.set(TOOL_NAME, idempotencyKey, result, parsed.user_id);
  return result;
}

export function registerMailAttachmentToDriveTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
  deps?: { getAccessToken(): Promise<string> },
): void {
  server.tool(
    TOOL_NAME,
    "Save an email attachment directly to OneDrive without round-tripping its bytes through the model. Reads the attachment by (message_id, attachment_id) and uploads it to folder_path. Requires confirm=true to actually upload — without it, returns a preview. Max 10 MB (attachment limit). Use idempotency_key to prevent duplicate uploads.",
    SaveAttachmentToDriveParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = SaveAttachmentToDriveParams.parse(params);
        return await handleSaveAttachmentToDrive(
          graphClient,
          parsed,
          deps?.getAccessToken.bind(deps),
          startTime,
        );
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: TOOL_NAME,
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "save_attachment_to_drive failed",
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
