import { type Client, ResponseType } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { SendChatMessageParamsType } from "../schemas/teams.js";
import {
  GetChatMessageHostedContentParams,
  ListChatMessagesParams,
  SendChatMessageParams,
} from "../schemas/teams.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { convertHtmlToText } from "../utils/html-convert.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";

const logger = createLogger("tools:teams-chat-messages");

const MESSAGE_BODY_MAX = 500;

function formatMessage(item: Record<string, unknown>): string {
  const id = String(item.id ?? "");
  const created = String(item.createdDateTime ?? "");
  const from = extractSender(item.from);
  const body = extractBody(item.body);
  const attachments = formatAttachments(item);
  const lines = [`[${created}] ${from}`, body, `  ID: ${id}`];
  if (attachments) lines.push(attachments);
  return lines.join("\n");
}

function formatAttachments(item: Record<string, unknown>): string | null {
  const parts: string[] = [];

  // Inline images / hosted contents (e.g. screenshots pasted into chat).
  // Graph rejects $expand=hostedContents on /chats messages, so we extract
  // the IDs from <img src=".../hostedContents/{id}/$value"> tags in the body.
  // Format: hosted:image:{id} — nanoclaw teams.ts parses this. Mime is
  // unknown until download (sniffed from magic bytes there).
  for (const hid of extractHostedContentIds(item.body)) {
    parts.push(`hosted:image:${hid}`);
  }

  // File attachments (sharePoint links, files etc.) — surface metadata only.
  const att = item.attachments;
  if (Array.isArray(att)) {
    for (const a of att) {
      if (!a || typeof a !== "object") continue;
      const ar = a as Record<string, unknown>;
      const name = String(ar.name ?? "unknown");
      const ctype = String(ar.contentType ?? "");
      parts.push(`file:${ctype}:${name}`);
    }
  }

  return parts.length > 0 ? `  Attachments: ${parts.join(", ")}` : null;
}

function extractSender(from: unknown): string {
  if (from && typeof from === "object") {
    const user = (from as Record<string, unknown>).user;
    if (user && typeof user === "object") {
      return String((user as Record<string, unknown>).displayName ?? "Unknown");
    }
  }
  return "Unknown";
}

function extractBody(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const contentType = String(b.contentType ?? "text");
    const content = String(b.content ?? "");
    if (contentType.toLowerCase() === "html") {
      return convertHtmlToText(content, MESSAGE_BODY_MAX);
    }
    return content.length > MESSAGE_BODY_MAX
      ? `${content.slice(0, MESSAGE_BODY_MAX)}... [truncated]`
      : content;
  }
  return "";
}

/**
 * Extract hostedContents IDs from chat-message body HTML.
 * Inline images appear as <img src=".../hostedContents/{id}/$value"> tags.
 * The id segment is URL-encoded base64 — we keep it as-is for the download call.
 */
function extractHostedContentIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  if (String(b.contentType ?? "").toLowerCase() !== "html") return [];
  const html = String(b.content ?? "");
  const ids: string[] = [];
  const re = /hostedContents\/([^/"\s)]+)\/\$value/g;
  for (const match of html.matchAll(re)) {
    ids.push(match[1]);
  }
  return ids;
}

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function buildSendPreview(parsed: SendChatMessageParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Send chat message", {
      "Chat ID": parsed.chat_id,
      "Content excerpt": parsed.content.slice(0, 200) + (parsed.content.length > 200 ? "…" : ""),
      Format: parsed.content_type,
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }
  return null;
}

async function executeSend(
  graphClient: Client,
  parsed: SendChatMessageParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const chatId = encodeGraphId(parsed.chat_id);
  const url = `${userPath}/chats/${chatId}/messages`;

  const response = (await graphClient.api(url).post({
    body: {
      contentType: parsed.content_type,
      content: parsed.content,
    },
  })) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    { tool: "send_chat_message", status: 201, duration_ms: endTime - startTime },
    "send_chat_message completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Chat message sent successfully.\n\nMessage ID: ${String(response?.id ?? "")}\nTimestamp: ${new Date(endTime).toISOString()}`,
      },
    ],
  };
}

export function registerTeamsChatMessageTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_chat_messages",
    "List messages in a Teams chat. Returns sender, timestamp, and body (truncated to 500 chars). Max 50 messages per page.",
    ListChatMessagesParams.shape,
    async (params) => {
      try {
        const parsed = ListChatMessagesParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const chatId = encodeGraphId(parsed.chat_id);
        const url = `${userPath}/chats/${chatId}/messages`;
        const top = Math.min(parsed.top ?? config.limits.maxItems, 50);

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top,
          skip: parsed.skip,
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No messages found." }] };
        }

        const lines = page.items.map((item) => formatMessage(item));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} messages. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} messages.`;

        logger.info(
          { tool: "list_chat_messages", count: page.items.length },
          "list_chat_messages completed",
        );

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "list_chat_messages", status: error.httpStatus, code: error.code },
            "list_chat_messages failed",
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

  server.tool(
    "get_chat_message_hosted_content",
    "Download a hosted content (e.g. inline image) from a Teams chat message. Returns base64-encoded bytes plus content type. Use the IDs surfaced by list_chat_messages under 'Attachments: hosted:...'.",
    GetChatMessageHostedContentParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = GetChatMessageHostedContentParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const chatId = encodeGraphId(parsed.chat_id);
        const messageId = encodeGraphId(parsed.message_id);
        const hcId = encodeGraphId(parsed.hosted_content_id);
        const url = `${userPath}/chats/${chatId}/messages/${messageId}/hostedContents/${hcId}/$value`;

        const response = (await graphClient
          .api(url)
          .responseType(ResponseType.ARRAYBUFFER)
          .get()) as ArrayBuffer;

        const buf = Buffer.from(response);
        const base64 = buf.toString("base64");
        // Graph doesn't return content-type with $value reliably — guess from PNG/JPEG magic bytes.
        const mime = sniffImageMime(buf) ?? "application/octet-stream";

        logger.info(
          {
            tool: "get_chat_message_hosted_content",
            bytes: buf.length,
            duration_ms: Date.now() - startTime,
          },
          "get_chat_message_hosted_content completed",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ mime, base64, bytes: buf.length }),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "get_chat_message_hosted_content", status: error.httpStatus, code: error.code },
            "get_chat_message_hosted_content failed",
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

  server.tool(
    "send_chat_message",
    "Send a message to a Teams chat. Requires confirm=true to actually send — without it, returns a preview. Use idempotency_key to prevent duplicate sends.",
    SendChatMessageParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = SendChatMessageParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        const previewResult = buildSendPreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "send_chat_message",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeSend(graphClient, parsed, userPath, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("send_chat_message", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "send_chat_message",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "send_chat_message failed",
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
