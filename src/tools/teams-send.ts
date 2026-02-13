import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type {
  ReplyToChannelMessageParamsType,
  SendChannelMessageParamsType,
} from "../schemas/teams.js";
import { ReplyToChannelMessageParams, SendChannelMessageParams } from "../schemas/teams.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:teams-send");

function buildSendPreview(parsed: SendChannelMessageParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Send channel message", {
      "Team ID": parsed.team_id,
      "Channel ID": parsed.channel_id,
      "Content excerpt": parsed.content.slice(0, 200) + (parsed.content.length > 200 ? "…" : ""),
      Format: parsed.content_type,
      Importance: parsed.importance,
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }
  return null;
}

function buildReplyPreview(parsed: ReplyToChannelMessageParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Reply to channel message", {
      "Team ID": parsed.team_id,
      "Channel ID": parsed.channel_id,
      "Message ID": parsed.message_id,
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
  parsed: SendChannelMessageParamsType,
  startTime: number,
): Promise<ToolResult> {
  const teamId = encodeGraphId(parsed.team_id);
  const channelId = encodeGraphId(parsed.channel_id);
  const url = `/teams/${teamId}/channels/${channelId}/messages`;

  const response = (await graphClient.api(url).post({
    body: {
      contentType: parsed.content_type,
      content: parsed.content,
    },
    importance: parsed.importance,
  })) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    {
      tool: "send_channel_message",
      status: 201,
      duration_ms: endTime - startTime,
    },
    "send_channel_message completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Channel message sent successfully.\n\nMessage ID: ${String(response?.id ?? "")}\nTimestamp: ${new Date(endTime).toISOString()}`,
      },
    ],
  };
}

async function executeReply(
  graphClient: Client,
  parsed: ReplyToChannelMessageParamsType,
  startTime: number,
): Promise<ToolResult> {
  const teamId = encodeGraphId(parsed.team_id);
  const channelId = encodeGraphId(parsed.channel_id);
  const messageId = encodeGraphId(parsed.message_id);
  const url = `/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`;

  const response = (await graphClient.api(url).post({
    body: {
      contentType: parsed.content_type,
      content: parsed.content,
    },
  })) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    {
      tool: "reply_to_channel_message",
      status: 201,
      duration_ms: endTime - startTime,
    },
    "reply_to_channel_message completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Reply sent successfully.\n\nReply ID: ${String(response?.id ?? "")}\nTimestamp: ${new Date(endTime).toISOString()}`,
      },
    ],
  };
}

export function registerTeamsSendTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "send_channel_message",
    "Send a message to a Teams channel. Requires confirm=true to actually send — without it, returns a preview. Supports HTML or text content and importance levels. Use idempotency_key to prevent duplicate sends.",
    SendChannelMessageParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = SendChannelMessageParams.parse(params);

        const previewResult = buildSendPreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "send_channel_message",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeSend(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set(
            "send_channel_message",
            parsed.idempotency_key,
            result,
            parsed.user_id,
          );
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "send_channel_message",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "send_channel_message failed",
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
    "reply_to_channel_message",
    "Reply to a message in a Teams channel. Requires confirm=true to actually send — without it, returns a preview. Use idempotency_key to prevent duplicate replies.",
    ReplyToChannelMessageParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = ReplyToChannelMessageParams.parse(params);

        const previewResult = buildReplyPreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "reply_to_channel_message",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeReply(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set(
            "reply_to_channel_message",
            parsed.idempotency_key,
            result,
            parsed.user_id,
          );
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "reply_to_channel_message",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "reply_to_channel_message failed",
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
