import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { MoveEmailParamsType } from "../schemas/mail.js";
import { MoveEmailParams } from "../schemas/mail.js";
import type { ToolResult } from "../types/tools.js";
import { formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:mail-move");

async function resolveFolderName(
  graphClient: Client,
  userPath: string,
  folderId: string,
): Promise<string> {
  try {
    const folder = (await graphClient
      .api(`${userPath}/mailFolders/${encodeURIComponent(folderId)}`)
      .select("displayName")
      .get()) as Record<string, unknown>;
    return String(folder.displayName ?? folderId);
  } catch {
    return folderId;
  }
}

async function buildMovePreview(
  graphClient: Client,
  parsed: MoveEmailParamsType,
  userPath: string,
): Promise<ToolResult> {
  const original = (await graphClient
    .api(`${userPath}/messages/${encodeURIComponent(parsed.message_id)}`)
    .select("subject,parentFolderId")
    .get()) as Record<string, unknown>;

  const sourceName = await resolveFolderName(
    graphClient,
    userPath,
    String(original.parentFolderId ?? ""),
  );
  const targetName = await resolveFolderName(graphClient, userPath, parsed.destination_folder);

  const previewDetails: Record<string, unknown> = {
    Aktion: "Verschieben",
    Betreff: String(original.subject ?? "(kein Betreff)"),
    "Von Ordner": sourceName,
    "Nach Ordner": targetName,
  };

  const previewText = formatPreview("E-Mail verschieben", previewDetails);

  return { content: [{ type: "text", text: previewText }] };
}

async function executeMove(
  graphClient: Client,
  parsed: MoveEmailParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const result = (await graphClient
    .api(`${userPath}/messages/${encodeURIComponent(parsed.message_id)}/move`)
    .post({ destinationId: parsed.destination_folder })) as Record<string, unknown>;

  const newMessageId = String(result.id ?? "");
  const endTime = Date.now();

  logger.info(
    {
      tool: "move_email",
      status: 200,
      duration_ms: endTime - startTime,
    },
    "move_email completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `E-Mail erfolgreich verschoben.\n\nNeue Message-ID: ${newMessageId}\nHinweis: Die alte Message-ID ist nicht mehr gültig.`,
      },
    ],
  };
}

export function registerMailMoveTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "move_email",
    "Move an email to a different folder. Use dry_run=true or omit confirm to preview. Returns the new message ID (may change on move). Requires confirm=true to execute. Use idempotency_key to prevent duplicate moves.",
    MoveEmailParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = MoveEmailParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        // dry_run overrides confirm
        if (parsed.dry_run || !parsed.confirm) {
          return await buildMovePreview(graphClient, parsed, userPath);
        }

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get("move_email", parsed.idempotency_key, parsed.user_id);
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeMove(graphClient, parsed, userPath, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("move_email", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "move_email",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "move_email failed",
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
