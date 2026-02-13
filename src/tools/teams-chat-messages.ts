import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { SendChatMessageParamsType } from "../schemas/teams.js";
import { ListChatMessagesParams, SendChatMessageParams } from "../schemas/teams.js";
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
  return `[${created}] ${from}\n${body}\n  ID: ${id}`;
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
