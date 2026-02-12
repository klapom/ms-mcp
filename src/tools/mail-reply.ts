import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { ReplyEmailParamsType } from "../schemas/mail.js";
import { ReplyEmailParams } from "../schemas/mail.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:mail-reply");

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function extractAddress(addressObj: unknown): string {
  if (!isRecordObject(addressObj)) return "(unknown)";
  if (!isRecordObject(addressObj.emailAddress)) return "(unknown)";
  const name = typeof addressObj.emailAddress.name === "string" ? addressObj.emailAddress.name : "";
  const address =
    typeof addressObj.emailAddress.address === "string" ? addressObj.emailAddress.address : "";
  return name ? `${name} <${address}>` : address || "(unknown)";
}

function extractAddressList(recipients: unknown): string {
  if (!Array.isArray(recipients)) return "";
  return recipients.map((r: unknown) => extractAddress(r)).join(", ");
}

async function buildReplyPreview(
  graphClient: Client,
  parsed: ReplyEmailParamsType,
  userPath: string,
): Promise<ToolResult> {
  const original = (await graphClient
    .api(`${userPath}/messages/${parsed.message_id}`)
    .select("subject,from,toRecipients,ccRecipients")
    .get()) as Record<string, unknown>;

  const previewDetails: Record<string, unknown> = {
    Aktion: parsed.reply_all ? "Allen antworten" : "Antworten",
    "Original-Betreff": String(original.subject ?? "(kein Betreff)"),
    "Original-Absender": extractAddress(original.from),
    "Kommentar-Auszug": parsed.comment.slice(0, 200) + (parsed.comment.length > 200 ? "…" : ""),
  };

  if (parsed.reply_all) {
    const toList = extractAddressList(original.toRecipients);
    const ccList = extractAddressList(original.ccRecipients);
    if (toList) previewDetails["An (Reply-All)"] = toList;
    if (ccList) previewDetails["CC (Reply-All)"] = ccList;
  }

  const preview = checkConfirmation(
    "destructive",
    false,
    formatPreview("E-Mail beantworten", previewDetails),
  );

  return { content: [{ type: "text", text: preview?.message ?? "" }] };
}

async function executeReply(
  graphClient: Client,
  parsed: ReplyEmailParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const endpoint = parsed.reply_all ? "replyAll" : "reply";
  await graphClient
    .api(`${userPath}/messages/${parsed.message_id}/${endpoint}`)
    .post({ comment: parsed.comment });

  logger.info(
    {
      tool: "reply_email",
      replyAll: parsed.reply_all,
      status: 202,
      duration_ms: Date.now() - startTime,
    },
    "reply_email completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `${parsed.reply_all ? "Reply-All" : "Antwort"} erfolgreich gesendet.\n\nZeitstempel: ${new Date().toISOString()}`,
      },
    ],
  };
}

export function registerMailReplyTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "reply_email",
    "Reply to an existing email. Use reply_all=true to reply to all recipients. Requires confirm=true to actually send — without it, fetches the original email and returns a preview with context. Use idempotency_key to prevent duplicate replies.",
    ReplyEmailParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = ReplyEmailParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        if (!parsed.confirm) {
          return await buildReplyPreview(graphClient, parsed, userPath);
        }

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get("reply_email", parsed.idempotency_key);
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeReply(graphClient, parsed, userPath, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("reply_email", parsed.idempotency_key, result);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "reply_email",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "reply_email failed",
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
