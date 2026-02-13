import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { UploadFileParamsType } from "../schemas/drive-write.js";
import { UploadFileParams } from "../schemas/drive-write.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { resolveDrivePath } from "../utils/drive-path.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { formatFileSize } from "../utils/file-size.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:drive-upload");

const MAX_SIMPLE_UPLOAD = 4 * 1024 * 1024; // 4 MB

function buildUploadPreview(parsed: UploadFileParamsType, sizeBytes: number): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Upload file", {
      Path: parsed.path,
      Size: formatFileSize(sizeBytes),
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }
  return null;
}

async function executeUpload(
  graphClient: Client,
  parsed: UploadFileParamsType,
  startTime: number,
): Promise<ToolResult> {
  const buffer = Buffer.from(parsed.content, "base64");

  if (buffer.length > MAX_SIMPLE_UPLOAD) {
    return {
      content: [
        {
          type: "text",
          text: `File too large for simple upload: ${formatFileSize(buffer.length)} (max 4 MB). Use the OneDrive web interface for larger files.`,
        },
      ],
      isError: true,
    };
  }

  const drivePath = resolveDrivePath(parsed.user_id, parsed.site_id, parsed.drive_id);
  const cleanPath = parsed.path.startsWith("/") ? parsed.path : `/${parsed.path}`;
  const url = `${drivePath}/root:${cleanPath}:/content`;

  const result = (await graphClient
    .api(url)
    .header("Content-Type", "application/octet-stream")
    .put(buffer)) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    {
      tool: "upload_file",
      sizeBytes: buffer.length,
      status: 200,
      duration_ms: endTime - startTime,
    },
    "upload_file completed",
  );

  const name = String(result.name ?? "");
  const id = String(result.id ?? "");
  const webUrl = String(result.webUrl ?? "");

  return {
    content: [
      {
        type: "text",
        text: `File uploaded successfully.\n\nName: ${name}\nID: ${id}\nURL: ${webUrl}`,
      },
    ],
  };
}

export function registerDriveUploadTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "upload_file",
    "Upload a file to OneDrive. Requires confirm=true to actually upload — without it, returns a preview. Content must be base64-encoded. Max 4 MB (simple upload). Use idempotency_key to prevent duplicate uploads.",
    UploadFileParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = UploadFileParams.parse(params);
        const sizeBytes = Buffer.from(parsed.content, "base64").length;

        const previewResult = buildUploadPreview(parsed, sizeBytes);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "upload_file",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeUpload(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("upload_file", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "upload_file",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "upload_file failed",
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
