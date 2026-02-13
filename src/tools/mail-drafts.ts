import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import {
  AddAttachmentParams,
  CreateDraftParams,
  SendDraftParams,
} from "../schemas/mail-extensions.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { toRecipients } from "../utils/recipients.js";

const logger = createLogger("tools:mail-drafts");

function generateDraftPreview(parsed: {
  to?: Array<{ address: string; name?: string }>;
  cc?: Array<{ address: string; name?: string }>;
  subject?: string;
  body?: string;
  body_type: string;
  importance: string;
}): string {
  const toList = parsed.to?.map((r) => r.address).join(", ") || "(none)";
  const ccList = parsed.cc?.map((r) => r.address).join(", ") || "(none)";
  const bodyPreview =
    (parsed.body || "").substring(0, 200) + ((parsed.body || "").length > 200 ? "..." : "");

  return [
    "Draft Email Preview:",
    "",
    `To: ${toList}`,
    `CC: ${ccList}`,
    `Subject: ${parsed.subject || "(no subject)"}`,
    `Body Type: ${parsed.body_type}`,
    `Importance: ${parsed.importance}`,
    "",
    `Body Preview: ${bodyPreview}`,
    "",
    "Draft will be saved to Drafts folder.",
    "",
    "To proceed, call this tool again with confirm: true",
  ].join("\n");
}

async function generateSendPreview(
  graphClient: Client,
  userPath: string,
  encodedMessageId: string,
): Promise<{ preview?: string; error?: string }> {
  const draft = (await graphClient
    .api(`${userPath}/messages/${encodedMessageId}`)
    .select("id,subject,toRecipients,ccRecipients,isDraft")
    .get()) as Record<string, unknown>;

  if (draft.isDraft !== true) {
    return {
      error: "Error: This message is not a draft. Only draft messages can be sent with send_draft.",
    };
  }

  const toRecipients = Array.isArray(draft.toRecipients)
    ? draft.toRecipients
        .map((r: Record<string, unknown>) => {
          const emailAddress = r.emailAddress as Record<string, unknown>;
          return emailAddress?.address;
        })
        .join(", ")
    : "(none)";

  return {
    preview: [
      "Send Draft Preview:",
      "",
      `Subject: ${draft.subject || "(no subject)"}`,
      `To: ${toRecipients}`,
      `Message ID: ${draft.id}`,
      "",
      "The draft will be sent immediately.",
      "",
      "To proceed, call this tool again with confirm: true",
    ].join("\n"),
  };
}

function generateAttachmentPreview(
  messageId: string,
  name: string,
  estimatedBytes: number,
  contentType: string | undefined,
  isInline: boolean,
): string {
  return [
    "Add Attachment Preview:",
    "",
    `Message ID: ${messageId}`,
    `Filename: ${name}`,
    `Size: ~${Math.round(estimatedBytes / 1024)} KB`,
    `Type: ${contentType || "(auto-detect)"}`,
    `Inline: ${isInline}`,
    "",
    "To proceed, call this tool again with confirm: true",
  ].join("\n");
}

async function handleSendConfirmed(
  graphClient: Client,
  userPath: string,
  encodedMessageId: string,
  parsed: { message_id: string; idempotency_key?: string; user_id?: string },
): Promise<void> {
  await graphClient.api(`${userPath}/messages/${encodedMessageId}/send`).post({});

  if (parsed.idempotency_key) {
    idempotencyCache.set(
      "send_draft",
      parsed.idempotency_key,
      { message_id: parsed.message_id },
      parsed.user_id,
    );
  }

  logger.info({ tool: "send_draft", message_id: parsed.message_id }, "Draft sent");
}

function buildDraftBody(parsed: {
  subject?: string;
  body?: string;
  body_type: string;
  to?: Array<{ address: string; name?: string }>;
  cc?: Array<{ address: string; name?: string }>;
  bcc?: Array<{ address: string; name?: string }>;
  importance: string;
  save_to_sent_items: boolean;
}) {
  const draft: Record<string, unknown> = {
    subject: parsed.subject ?? "",
    body: {
      contentType: parsed.body_type === "html" ? "HTML" : "Text",
      content: parsed.body ?? "",
    },
    importance: parsed.importance,
    saveToSentItems: parsed.save_to_sent_items,
  };

  if (parsed.to && parsed.to.length > 0) {
    draft.toRecipients = toRecipients(parsed.to.map((r) => r.address));
  }
  if (parsed.cc && parsed.cc.length > 0) {
    draft.ccRecipients = toRecipients(parsed.cc.map((r) => r.address));
  }
  if (parsed.bcc && parsed.bcc.length > 0) {
    draft.bccRecipients = toRecipients(parsed.bcc.map((r) => r.address));
  }

  return draft;
}

export function registerMailDraftTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "create_draft",
    "Create a draft email message. The draft is saved to the Drafts folder and can be edited or sent later using send_draft.",
    CreateDraftParams.shape,
    async (params) => {
      try {
        const parsed = CreateDraftParams.parse(params);
        const idempotencyKey = parsed.idempotency_key;

        if (
          idempotencyKey &&
          idempotencyCache.get("create_draft", idempotencyKey, parsed.user_id)
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: "This operation was already completed (idempotency key matched).",
              },
            ],
          };
        }

        const userPath = resolveUserPath(parsed.user_id);

        // Preview mode
        if (parsed.confirm === false) {
          const preview = generateDraftPreview(parsed);
          return { content: [{ type: "text" as const, text: preview }] };
        }

        const draft = buildDraftBody(parsed);
        const response = (await graphClient.api(`${userPath}/messages`).post(draft)) as Record<
          string,
          unknown
        >;

        const messageId = String(response.id ?? "");

        if (idempotencyKey) {
          idempotencyCache.set(
            "create_draft",
            idempotencyKey,
            { message_id: messageId },
            parsed.user_id,
          );
        }

        logger.info({ tool: "create_draft", message_id: messageId }, "Draft created");

        return {
          content: [
            {
              type: "text" as const,
              text: `Draft created successfully.\n\nMessage ID: ${messageId}\nSubject: ${parsed.subject || "(no subject)"}\n\nUse send_draft to send this message.`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpToolError) {
          return {
            content: [{ type: "text" as const, text: formatErrorForUser(error) }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );

  server.tool(
    "send_draft",
    "Send a draft email message that was previously created with create_draft. The message will be sent immediately.",
    SendDraftParams.shape,
    async (params) => {
      try {
        const parsed = SendDraftParams.parse(params);
        const idempotencyKey = parsed.idempotency_key;

        if (
          idempotencyKey &&
          idempotencyCache.get("create_draft", idempotencyKey, parsed.user_id)
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: "This operation was already completed (idempotency key matched).",
              },
            ],
          };
        }

        const userPath = resolveUserPath(parsed.user_id);
        const encodedMessageId = encodeGraphId(parsed.message_id);

        // Preview mode - get draft details
        if (parsed.confirm === false) {
          const result = await generateSendPreview(graphClient, userPath, encodedMessageId);
          if (result.error) {
            return {
              content: [{ type: "text" as const, text: result.error }],
              isError: true,
            };
          }
          return { content: [{ type: "text" as const, text: result.preview ?? "" }] };
        }

        await handleSendConfirmed(graphClient, userPath, encodedMessageId, parsed);

        return {
          content: [
            {
              type: "text" as const,
              text: `Draft sent successfully.\nMessage ID: ${parsed.message_id}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpToolError) {
          return {
            content: [{ type: "text" as const, text: formatErrorForUser(error) }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );

  server.tool(
    "add_attachment",
    "Add a file attachment to a draft email. Maximum size: 3 MB via direct POST. For larger files, use upload session (not yet implemented).",
    AddAttachmentParams.shape,
    async (params) => {
      try {
        const parsed = AddAttachmentParams.parse(params);
        const idempotencyKey = parsed.idempotency_key;

        if (
          idempotencyKey &&
          idempotencyCache.get("create_draft", idempotencyKey, parsed.user_id)
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: "This operation was already completed (idempotency key matched).",
              },
            ],
          };
        }

        const userPath = resolveUserPath(parsed.user_id);
        const encodedMessageId = encodeGraphId(parsed.message_id);

        // Estimate size (base64 is ~4/3 of original)
        const estimatedBytes = (parsed.content_bytes.length * 3) / 4;
        const maxBytes = 3 * 1024 * 1024; // 3 MB

        if (estimatedBytes > maxBytes) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Attachment too large (estimated ${Math.round(estimatedBytes / 1024 / 1024)} MB, max 3 MB).\n\nFor larger files, use upload session (not yet implemented in Sprint 7.2).`,
              },
            ],
            isError: true,
          };
        }

        // Preview mode
        if (parsed.confirm === false) {
          const preview = generateAttachmentPreview(
            parsed.message_id,
            parsed.name,
            estimatedBytes,
            parsed.content_type,
            parsed.is_inline,
          );
          return { content: [{ type: "text" as const, text: preview }] };
        }

        const attachment = {
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: parsed.name,
          contentBytes: parsed.content_bytes,
          contentType: parsed.content_type,
          isInline: parsed.is_inline,
        };

        await graphClient
          .api(`${userPath}/messages/${encodedMessageId}/attachments`)
          .post(attachment);

        if (idempotencyKey) {
          idempotencyCache.set(
            "add_attachment",
            idempotencyKey,
            {
              message_id: parsed.message_id,
              filename: parsed.name,
            },
            parsed.user_id,
          );
        }

        logger.info(
          { tool: "add_attachment", message_id: parsed.message_id, filename: parsed.name },
          "Attachment added",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Attachment added successfully.\n\nMessage ID: ${parsed.message_id}\nFilename: ${parsed.name}\nSize: ~${Math.round(estimatedBytes / 1024)} KB`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpToolError) {
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
