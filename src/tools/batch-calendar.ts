import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { BatchDeleteEventsParams } from "../schemas/batch-operations.js";
import type { BatchDeleteEventsParamsType } from "../schemas/batch-operations.js";
import { resolveUserPath } from "../schemas/common.js";
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

const logger = createLogger("tools:batch-calendar");

function buildDeletePreview(parsed: BatchDeleteEventsParamsType): ToolResult {
  const notify = parsed.send_cancellation_notifications ? "yes" : "no";
  return {
    content: [
      {
        type: "text",
        text: [
          `Preview: Delete ${parsed.event_ids.length} events (cancellation emails: ${notify})`,
          "",
          "Confirm with confirm: true to execute this action.",
        ].join("\n"),
      },
    ],
  };
}

function buildDeleteIdempotencyKey(parsed: BatchDeleteEventsParamsType): string {
  const sorted = [...parsed.event_ids].sort().join(",");
  return `${sorted}:${String(parsed.send_cancellation_notifications)}`;
}

async function executeBatchDeleteEvents(
  graphClient: Client,
  parsed: BatchDeleteEventsParamsType,
): Promise<ToolResult> {
  const userPath = resolveUserPath(parsed.user_id);
  const headers: Record<string, string> = {};
  if (!parsed.send_cancellation_notifications) {
    headers.Prefer = 'outlook.calendar.cancelMessage="false"';
  }

  const requests: GraphBatchRequest[] = parsed.event_ids.map((id, i) => ({
    id: String(i + 1),
    method: "DELETE" as const,
    url: `${userPath}/events/${encodeGraphId(id)}`,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  }));

  const result = await executeBatch(graphClient, requests);
  const summary = summarizeBatchResult(result);
  const text = formatBatchSummary(summary, "deleted", "failed");

  logger.info(
    {
      tool: "batch_delete_events",
      success: summary.successCount,
      failed: summary.failureCount,
    },
    "batch_delete_events completed",
  );

  return { content: [{ type: "text", text }] };
}

export function registerBatchCalendarTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "batch_delete_events",
    "Delete multiple calendar events in a single batch operation (max 20). Optionally suppress cancellation notifications. Requires confirm=true to execute.",
    BatchDeleteEventsParams.shape,
    async (params) => {
      const parsed = BatchDeleteEventsParams.parse(params);

      if (!parsed.confirm) {
        return buildDeletePreview(parsed);
      }

      const idempotencyKey = parsed.idempotency_key ?? buildDeleteIdempotencyKey(parsed);
      const cached = idempotencyCache.get("batch_delete_events", idempotencyKey, parsed.user_id);
      if (cached !== undefined) {
        return cached as ToolResult;
      }

      const result = await executeBatchDeleteEvents(graphClient, parsed);
      idempotencyCache.set("batch_delete_events", idempotencyKey, result, parsed.user_id);
      return result;
    },
  );
}
