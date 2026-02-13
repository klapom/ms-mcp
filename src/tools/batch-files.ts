import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { BatchMoveFilesParams } from "../schemas/batch-operations.js";
import type { BatchMoveFilesParamsType } from "../schemas/batch-operations.js";
import type { ToolResult } from "../types/tools.js";
import {
  type GraphBatchRequest,
  executeBatch,
  formatBatchSummary,
  summarizeBatchResult,
} from "../utils/batch.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:batch-files");

function buildMovePreview(parsed: BatchMoveFilesParamsType): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: [
          `Preview: Move ${parsed.file_ids.length} files to folder '${parsed.destination_folder_id}'`,
          "",
          "Confirm with confirm: true to execute this action.",
        ].join("\n"),
      },
    ],
  };
}

function buildMoveIdempotencyKey(parsed: BatchMoveFilesParamsType): string {
  const sorted = [...parsed.file_ids].sort().join(",");
  return `${sorted}:${parsed.destination_folder_id}`;
}

async function executeBatchMoveFiles(
  graphClient: Client,
  parsed: BatchMoveFilesParamsType,
): Promise<ToolResult> {
  const requests: GraphBatchRequest[] = parsed.file_ids.map((id, i) => ({
    id: String(i + 1),
    method: "PATCH" as const,
    url: `/me/drive/items/${encodeGraphId(id)}`,
    headers: { "Content-Type": "application/json" },
    body: { parentReference: { id: parsed.destination_folder_id } },
  }));

  const result = await executeBatch(graphClient, requests);
  const summary = summarizeBatchResult(result);
  const text = formatBatchSummary(summary, "moved", "failed");

  logger.info(
    { tool: "batch_move_files", success: summary.successCount, failed: summary.failureCount },
    "batch_move_files completed",
  );

  return { content: [{ type: "text", text }] };
}

export function registerBatchFilesTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "batch_move_files",
    "Move multiple OneDrive files/folders to a new location in a single batch operation (max 20). Returns success/failure per item. Requires confirm=true to execute.",
    BatchMoveFilesParams.shape,
    async (params) => {
      const parsed = BatchMoveFilesParams.parse(params);

      if (!parsed.confirm) {
        return buildMovePreview(parsed);
      }

      const idempotencyKey = parsed.idempotency_key ?? buildMoveIdempotencyKey(parsed);
      const cached = idempotencyCache.get("batch_move_files", idempotencyKey, parsed.user_id);
      if (cached !== undefined) {
        return cached as ToolResult;
      }

      const result = await executeBatchMoveFiles(graphClient, parsed);
      idempotencyCache.set("batch_move_files", idempotencyKey, result, parsed.user_id);
      return result;
    },
  );
}
