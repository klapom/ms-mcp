import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { MoveFileParamsType } from "../schemas/drive-write.js";
import { MoveFileParams } from "../schemas/drive-write.js";
import type { ToolResult } from "../types/tools.js";
import { formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:drive-move");

async function buildMovePreview(
  graphClient: Client,
  parsed: MoveFileParamsType,
  userPath: string,
): Promise<ToolResult> {
  const itemUrl = `${userPath}/drive/items/${encodeGraphId(parsed.file_id)}`;
  const item = (await graphClient.api(itemUrl).select("id,name").get()) as Record<string, unknown>;

  const details: Record<string, unknown> = {
    Item: String(item.name ?? parsed.file_id),
    "Destination folder ID": parsed.destination_folder_id,
  };
  if (parsed.new_name) details["New name"] = parsed.new_name;

  const previewText = formatPreview("Move file", details);
  return { content: [{ type: "text", text: previewText }] };
}

async function executeMove(
  graphClient: Client,
  parsed: MoveFileParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const itemUrl = `${userPath}/drive/items/${encodeGraphId(parsed.file_id)}`;

  const patchBody: Record<string, unknown> = {
    parentReference: { id: parsed.destination_folder_id },
  };
  if (parsed.new_name) {
    patchBody.name = parsed.new_name;
  }

  const result = (await graphClient.api(itemUrl).patch(patchBody)) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    { tool: "move_file", status: 200, duration_ms: endTime - startTime },
    "move_file completed",
  );

  const name = String(result.name ?? "");
  const id = String(result.id ?? "");

  return {
    content: [
      {
        type: "text",
        text: `File moved successfully.\n\nName: ${name}\nID: ${id}`,
      },
    ],
  };
}

export function registerDriveMoveTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "move_file",
    "Move a file or folder to a different location in OneDrive. Requires confirm=true to actually move — without it, returns a preview. Optionally rename with new_name. Use idempotency_key to prevent duplicate moves.",
    MoveFileParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = MoveFileParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        if (!parsed.confirm) {
          return await buildMovePreview(graphClient, parsed, userPath);
        }

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get("move_file", parsed.idempotency_key, parsed.user_id);
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeMove(graphClient, parsed, userPath, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("move_file", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "move_file",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "move_file failed",
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
