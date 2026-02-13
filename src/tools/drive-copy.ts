import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { CopyFileParamsType } from "../schemas/drive-write.js";
import { CopyFileParams } from "../schemas/drive-write.js";
import type { ToolResult } from "../types/tools.js";
import { formatPreview } from "../utils/confirmation.js";
import { resolveDrivePath } from "../utils/drive-path.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:drive-copy");

async function buildCopyPreview(
  graphClient: Client,
  parsed: CopyFileParamsType,
  drivePath: string,
): Promise<ToolResult> {
  const itemUrl = `${drivePath}/items/${encodeGraphId(parsed.file_id)}`;
  const item = (await graphClient.api(itemUrl).select("id,name").get()) as Record<string, unknown>;

  const details: Record<string, unknown> = {
    Item: String(item.name ?? parsed.file_id),
    "Destination folder ID": parsed.destination_folder_id,
  };
  if (parsed.new_name) details["New name"] = parsed.new_name;

  const previewText = formatPreview("Copy file", details);
  return { content: [{ type: "text", text: previewText }] };
}

async function executeCopy(
  graphClient: Client,
  parsed: CopyFileParamsType,
  drivePath: string,
  startTime: number,
): Promise<ToolResult> {
  const itemUrl = `${drivePath}/items/${encodeGraphId(parsed.file_id)}/copy`;

  const requestBody: Record<string, unknown> = {
    parentReference: { id: parsed.destination_folder_id },
  };
  if (parsed.new_name) {
    requestBody.name = parsed.new_name;
  }

  // copy returns 202 (async operation) with a Location header for monitoring
  // WORKAROUND: Graph Client SDK doesn't expose Location header with responseType RAW
  // So we make the request and then check the response, knowing it returns null body
  await graphClient.api(itemUrl).post(requestBody);

  const endTime = Date.now();
  logger.info(
    {
      tool: "copy_file",
      status: 202,
      duration_ms: endTime - startTime,
    },
    "copy_file completed",
  );

  // Build response text
  // NOTE: Monitor URL would come from Location header, but Graph Client SDK doesn't expose it
  // Users can poll manually using the file_id: /me/drive/items/{file_id}/copy with $monitor query
  let responseText = `Copy operation started. The file is being copied asynchronously.\n\nSource ID: ${parsed.file_id}\nDestination folder: ${parsed.destination_folder_id}`;
  if (parsed.new_name) {
    responseText += `\nNew name: ${parsed.new_name}`;
  }

  // Provide workaround instructions for monitoring
  responseText += `\n\nNote: To monitor copy progress, construct the monitor URL manually:
https://graph.microsoft.com/v1.0/me/drive/items/${parsed.file_id}/copy?$monitor
Then use poll_copy_status with this URL.`;

  return {
    content: [
      {
        type: "text",
        text: responseText,
      },
    ],
  };
}

export function registerDriveCopyTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "copy_file",
    "Copy a file or folder in OneDrive. Requires confirm=true to actually copy — without it, returns a preview. Copy is asynchronous (returns immediately, copy happens in background). Optionally rename with new_name. Use idempotency_key to prevent duplicate copies.",
    CopyFileParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = CopyFileParams.parse(params);
        const drivePath = resolveDrivePath(parsed.user_id, parsed.site_id, parsed.drive_id);

        if (!parsed.confirm) {
          return await buildCopyPreview(graphClient, parsed, drivePath);
        }

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get("copy_file", parsed.idempotency_key, parsed.user_id);
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeCopy(graphClient, parsed, drivePath, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("copy_file", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "copy_file",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "copy_file failed",
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
