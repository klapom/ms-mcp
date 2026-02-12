import { createHash } from "node:crypto";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { SendEmailParamsType } from "../schemas/mail.js";
import { SendEmailParams } from "../schemas/mail.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { toRecipients } from "../utils/recipients.js";

const logger = createLogger("tools:mail-send");

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const DUPLICATE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const duplicateHashes = new Map<string, number>();

function cleanupDuplicateHashes(): void {
  const now = Date.now();
  for (const [key, timestamp] of duplicateHashes) {
    if (now - timestamp > DUPLICATE_TTL_MS) {
      duplicateHashes.delete(key);
    }
  }
}

function computeDuplicateHash(to: string[], subject: string, body: string): string {
  const normalized = [...to].sort().join(",") + subject.toLowerCase() + body.slice(0, 200);
  return createHash("sha256").update(normalized).digest("hex");
}

function buildSendPreview(parsed: SendEmailParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("E-Mail senden", {
      An: parsed.to.join(", "),
      CC: parsed.cc?.join(", "),
      BCC: parsed.bcc?.join(", "),
      Betreff: parsed.subject,
      "Body-Auszug": parsed.body.slice(0, 200) + (parsed.body.length > 200 ? "…" : ""),
      Format: parsed.body_type,
      Wichtigkeit: parsed.importance,
      "In Gesendete speichern": parsed.save_to_sent_items ? "Ja" : "Nein",
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }
  return null;
}

function checkDuplicate(to: string[], subject: string, body: string): string {
  cleanupDuplicateHashes();
  const dupHash = computeDuplicateHash(to, subject, body);
  const isDuplicate = duplicateHashes.has(dupHash);
  duplicateHashes.set(dupHash, Date.now());
  return isDuplicate
    ? "\n⚠ Mögliches Duplikat erkannt: Eine ähnliche E-Mail wurde kürzlich gesendet."
    : "";
}

function buildGraphRequestBody(parsed: SendEmailParamsType): Record<string, unknown> {
  const messageBody: Record<string, unknown> = {
    subject: parsed.subject,
    body: {
      contentType: parsed.body_type === "html" ? "HTML" : "Text",
      content: parsed.body,
    },
    toRecipients: toRecipients(parsed.to),
    importance: parsed.importance,
  };
  if (parsed.cc && parsed.cc.length > 0) {
    messageBody.ccRecipients = toRecipients(parsed.cc);
  }
  if (parsed.bcc && parsed.bcc.length > 0) {
    messageBody.bccRecipients = toRecipients(parsed.bcc);
  }
  return { message: messageBody, saveToSentItems: parsed.save_to_sent_items };
}

async function executeSend(
  graphClient: Client,
  parsed: SendEmailParamsType,
  startTime: number,
): Promise<ToolResult> {
  const recipientCount = parsed.to.length + (parsed.cc?.length ?? 0) + (parsed.bcc?.length ?? 0);
  const duplicateWarning = checkDuplicate(parsed.to, parsed.subject, parsed.body);
  const userPath = resolveUserPath(parsed.user_id);
  const requestBody = buildGraphRequestBody(parsed);

  await graphClient.api(`${userPath}/sendMail`).post(requestBody);

  logger.info(
    {
      tool: "send_email",
      recipientCount,
      bodyType: parsed.body_type,
      importance: parsed.importance,
      status: 202,
      duration_ms: Date.now() - startTime,
    },
    "send_email completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `E-Mail erfolgreich gesendet.${duplicateWarning}\n\nZeitstempel: ${new Date().toISOString()}\nEmpfänger: ${recipientCount}`,
      },
    ],
  };
}

export function registerMailSendTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "send_email",
    "Send a new email. Requires confirm=true to actually send — without it, returns a preview. Supports To, CC, BCC, subject, body (text or HTML), importance, and save_to_sent_items. Use idempotency_key to prevent duplicate sends.",
    SendEmailParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = SendEmailParams.parse(params);

        const previewResult = buildSendPreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get("send_email", parsed.idempotency_key);
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeSend(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("send_email", parsed.idempotency_key, result);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "send_email",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "send_email failed",
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

/** Exposed for testing only. */
export function _resetDuplicateHashes(): void {
  duplicateHashes.clear();
}
