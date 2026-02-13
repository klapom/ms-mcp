import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import {
  BatchDeleteEmailsParams,
  BatchFlagEmailsParams,
  BatchMoveEmailsParams,
} from "../schemas/batch-operations.js";
import type {
  BatchDeleteEmailsParamsType,
  BatchFlagEmailsParamsType,
  BatchMoveEmailsParamsType,
} from "../schemas/batch-operations.js";
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

const logger = createLogger("tools:batch-mail");

// ---------------------------------------------------------------------------
// batch_move_emails
// ---------------------------------------------------------------------------

function buildMovePreview(parsed: BatchMoveEmailsParamsType): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: [
          `Preview: Move ${parsed.message_ids.length} emails to folder '${parsed.destination_folder_id}'`,
          "",
          "Confirm with confirm: true to execute this action.",
        ].join("\n"),
      },
    ],
  };
}

function buildMoveIdempotencyKey(parsed: BatchMoveEmailsParamsType): string {
  const sorted = [...parsed.message_ids].sort().join(",");
  return `${sorted}:${parsed.destination_folder_id}`;
}

async function executeBatchMove(
  graphClient: Client,
  parsed: BatchMoveEmailsParamsType,
): Promise<ToolResult> {
  const userPath = resolveUserPath(parsed.user_id);
  const requests: GraphBatchRequest[] = parsed.message_ids.map((id, i) => ({
    id: String(i + 1),
    method: "PATCH" as const,
    url: `${userPath}/messages/${encodeGraphId(id)}`,
    headers: { "Content-Type": "application/json" },
    body: { parentFolderId: parsed.destination_folder_id },
  }));

  const result = await executeBatch(graphClient, requests);
  const summary = summarizeBatchResult(result);
  const text = formatBatchSummary(summary, "moved", "failed");

  logger.info(
    { tool: "batch_move_emails", success: summary.successCount, failed: summary.failureCount },
    "batch_move_emails completed",
  );

  return { content: [{ type: "text", text }] };
}

// ---------------------------------------------------------------------------
// batch_delete_emails
// ---------------------------------------------------------------------------

function buildDeletePreview(parsed: BatchDeleteEmailsParamsType): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: [
          `Preview: Permanently delete ${parsed.message_ids.length} emails`,
          "",
          "Warning: This action cannot be undone!",
          "",
          "Confirm with confirm: true to execute this action.",
        ].join("\n"),
      },
    ],
  };
}

function buildDeleteIdempotencyKey(parsed: BatchDeleteEmailsParamsType): string {
  return [...parsed.message_ids].sort().join(",");
}

async function executeBatchDelete(
  graphClient: Client,
  parsed: BatchDeleteEmailsParamsType,
): Promise<ToolResult> {
  const userPath = resolveUserPath(parsed.user_id);
  const requests: GraphBatchRequest[] = parsed.message_ids.map((id, i) => ({
    id: String(i + 1),
    method: "DELETE" as const,
    url: `${userPath}/messages/${encodeGraphId(id)}`,
  }));

  const result = await executeBatch(graphClient, requests);
  const summary = summarizeBatchResult(result);
  const text = formatBatchSummary(summary, "deleted", "failed");

  logger.info(
    { tool: "batch_delete_emails", success: summary.successCount, failed: summary.failureCount },
    "batch_delete_emails completed",
  );

  return { content: [{ type: "text", text }] };
}

// ---------------------------------------------------------------------------
// batch_flag_emails
// ---------------------------------------------------------------------------

function buildFlagPreview(parsed: BatchFlagEmailsParamsType): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: [
          `Preview: Set flag status to '${parsed.flag_status}' for ${parsed.message_ids.length} emails`,
          "",
          "Confirm with confirm: true to execute this action.",
        ].join("\n"),
      },
    ],
  };
}

function buildFlagIdempotencyKey(parsed: BatchFlagEmailsParamsType): string {
  const sorted = [...parsed.message_ids].sort().join(",");
  return `${sorted}:${parsed.flag_status}:${parsed.due_date ?? ""}`;
}

function buildFlagBody(parsed: BatchFlagEmailsParamsType): Record<string, unknown> {
  const flag: Record<string, unknown> = { flagStatus: parsed.flag_status };
  if (parsed.due_date) {
    flag.dueDateTime = { dateTime: parsed.due_date, timeZone: "UTC" };
  }
  return { flag };
}

async function executeBatchFlag(
  graphClient: Client,
  parsed: BatchFlagEmailsParamsType,
): Promise<ToolResult> {
  const userPath = resolveUserPath(parsed.user_id);
  const body = buildFlagBody(parsed);
  const requests: GraphBatchRequest[] = parsed.message_ids.map((id, i) => ({
    id: String(i + 1),
    method: "PATCH" as const,
    url: `${userPath}/messages/${encodeGraphId(id)}`,
    headers: { "Content-Type": "application/json" },
    body: body as Record<string, unknown>,
  }));

  const result = await executeBatch(graphClient, requests);
  const summary = summarizeBatchResult(result);
  const text = formatBatchSummary(summary, "flagged", "failed");

  logger.info(
    { tool: "batch_flag_emails", success: summary.successCount, failed: summary.failureCount },
    "batch_flag_emails completed",
  );

  return { content: [{ type: "text", text }] };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function handleBatchTool(
  toolName: string,
  parsed: { confirm: boolean; idempotency_key?: string; user_id?: string },
  buildPreview: () => ToolResult,
  buildKey: () => string,
  execute: () => Promise<ToolResult>,
): Promise<ToolResult> | ToolResult {
  if (!parsed.confirm) {
    return buildPreview();
  }

  const idempotencyKey = parsed.idempotency_key ?? buildKey();
  const cached = idempotencyCache.get(toolName, idempotencyKey, parsed.user_id);
  if (cached !== undefined) {
    return cached as ToolResult;
  }

  return execute().then((result) => {
    idempotencyCache.set(toolName, idempotencyKey, result, parsed.user_id);
    return result;
  });
}

export function registerBatchMailTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "batch_move_emails",
    "Move multiple emails to a folder in a single batch operation (max 20). Returns success/failure per email. Requires confirm=true to execute.",
    BatchMoveEmailsParams.shape,
    async (params) => {
      const parsed = BatchMoveEmailsParams.parse(params);
      return handleBatchTool(
        "batch_move_emails",
        parsed,
        () => buildMovePreview(parsed),
        () => buildMoveIdempotencyKey(parsed),
        () => executeBatchMove(graphClient, parsed),
      );
    },
  );

  server.tool(
    "batch_delete_emails",
    "Permanently delete multiple emails in a single batch operation (max 20). This action cannot be undone. Requires confirm=true to execute.",
    BatchDeleteEmailsParams.shape,
    async (params) => {
      const parsed = BatchDeleteEmailsParams.parse(params);
      return handleBatchTool(
        "batch_delete_emails",
        parsed,
        () => buildDeletePreview(parsed),
        () => buildDeleteIdempotencyKey(parsed),
        () => executeBatchDelete(graphClient, parsed),
      );
    },
  );

  server.tool(
    "batch_flag_emails",
    "Flag or unflag multiple emails in a single batch operation (max 20). Supports flagged/complete/notFlagged statuses with optional due date. Requires confirm=true to execute.",
    BatchFlagEmailsParams.shape,
    async (params) => {
      const parsed = BatchFlagEmailsParams.parse(params);
      return handleBatchTool(
        "batch_flag_emails",
        parsed,
        () => buildFlagPreview(parsed),
        () => buildFlagIdempotencyKey(parsed),
        () => executeBatchFlag(graphClient, parsed),
      );
    },
  );
}
