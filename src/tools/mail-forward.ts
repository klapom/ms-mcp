import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { ForwardEmailParamsType } from "../schemas/mail.js";
import { ForwardEmailParams } from "../schemas/mail.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { toRecipients } from "../utils/recipients.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:mail-forward");

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function extractAddress(addressObj: unknown): string {
  if (!isRecordObject(addressObj)) return "(unknown)";
  if (!isRecordObject(addressObj.emailAddress)) return "(unknown)";
  const name = typeof addressObj.emailAddress.name === "string" ? addressObj.emailAddress.name : "";
  const address =
    typeof addressObj.emailAddress.address === "string" ? addressObj.emailAddress.address : "";
  return name ? `${name} <${address}>` : address || "(unknown)";
}

async function buildForwardPreview(
  graphClient: Client,
  parsed: ForwardEmailParamsType,
  userPath: string,
): Promise<ToolResult> {
  const original = (await graphClient
    .api(`${userPath}/messages/${parsed.message_id}`)
    .select("subject,from,hasAttachments")
    .get()) as Record<string, unknown>;

  const previewDetails: Record<string, unknown> = {
    Aktion: "Weiterleiten",
    "Original-Betreff": String(original.subject ?? "(kein Betreff)"),
    "Original-Absender": extractAddress(original.from),
    "Weiterleiten an": parsed.to.join(", "),
    Anhänge: original.hasAttachments === true ? "Ja (werden mitgesendet)" : "Nein",
  };

  if (parsed.comment) {
    previewDetails["Kommentar-Auszug"] =
      parsed.comment.slice(0, 200) + (parsed.comment.length > 200 ? "…" : "");
  }

  const preview = checkConfirmation(
    "destructive",
    false,
    formatPreview("E-Mail weiterleiten", previewDetails),
  );

  return { content: [{ type: "text", text: preview?.message ?? "" }] };
}

async function executeForward(
  graphClient: Client,
  parsed: ForwardEmailParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const requestBody: Record<string, unknown> = {
    toRecipients: toRecipients(parsed.to),
  };
  if (parsed.comment) {
    requestBody.comment = parsed.comment;
  }

  await graphClient.api(`${userPath}/messages/${parsed.message_id}/forward`).post(requestBody);

  logger.info(
    {
      tool: "forward_email",
      recipientCount: parsed.to.length,
      hasComment: parsed.comment !== undefined,
      status: 202,
      duration_ms: Date.now() - startTime,
    },
    "forward_email completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `E-Mail erfolgreich weitergeleitet.\n\nZeitstempel: ${new Date().toISOString()}\nEmpfänger: ${parsed.to.length}`,
      },
    ],
  };
}

export function registerMailForwardTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "forward_email",
    "Forward an existing email to new recipients. Attachments from the original email are included automatically. Requires confirm=true to actually send — without it, fetches the original email and returns a preview. Use idempotency_key to prevent duplicate forwards.",
    ForwardEmailParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = ForwardEmailParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        if (!parsed.confirm) {
          return await buildForwardPreview(graphClient, parsed, userPath);
        }

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get("forward_email", parsed.idempotency_key);
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeForward(graphClient, parsed, userPath, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("forward_email", parsed.idempotency_key, result);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "forward_email",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "forward_email failed",
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
