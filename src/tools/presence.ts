/**
 * Presence Tools (Sprint 9.4)
 *
 * Real-time presence and status management.
 */

import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import {
  GetMyPresenceParams,
  GetPresenceParams,
  SetStatusMessageParams,
} from "../schemas/presence.js";
import type { ToolRegistrationFn, ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:presence");

/**
 * Format presence detail for user-friendly display
 */
function formatPresenceDetail(presence: {
  availability?: string;
  activity?: string;
  statusMessage?: { message?: { content?: string }; expiresAt?: string };
}): string {
  const lines: string[] = [];

  if (presence.availability) {
    lines.push(`Availability: ${presence.availability}`);
  }

  if (presence.activity) {
    lines.push(`Activity: ${presence.activity}`);
  }

  if (presence.statusMessage?.message?.content) {
    lines.push(`Status: "${presence.statusMessage.message.content}"`);
    if (presence.statusMessage.expiresAt) {
      const expires = new Date(presence.statusMessage.expiresAt);
      lines.push(`Expires: ${expires.toLocaleString()}`);
    }
  }

  return lines.join("\n");
}

/**
 * get_my_presence — Get current user's presence status
 */
async function handleGetMyPresence(
  graphClient: Client,
  parsed: { user_id?: string },
): Promise<ToolResult> {
  const url = parsed.user_id ? `/users/${encodeGraphId(parsed.user_id)}/presence` : "/me/presence";

  const presence = (await graphClient
    .api(url)
    .select(["id", "availability", "activity", "statusMessage"])
    .get()) as {
    id: string;
    availability: string;
    activity: string;
    statusMessage?: { message?: { content?: string }; expiresAt?: string };
  };

  logger.info(
    {
      availability: presence.availability,
      activity: presence.activity,
      hasMessage: !!presence.statusMessage?.message?.content,
    },
    "get_my_presence completed",
  );

  const result = `My Presence:\n${formatPresenceDetail(presence)}`;
  return { content: [{ type: "text", text: result }] };
}

/**
 * get_presence — Get another user's presence status
 */
async function handleGetPresence(
  graphClient: Client,
  parsed: { user_id: string },
): Promise<ToolResult> {
  const url = `/users/${encodeGraphId(parsed.user_id)}/presence`;

  const presence = (await graphClient
    .api(url)
    .select(["id", "availability", "activity", "statusMessage"])
    .get()) as {
    id: string;
    availability: string;
    activity: string;
    statusMessage?: { message?: { content?: string }; expiresAt?: string };
  };

  logger.info(
    {
      user_id: parsed.user_id,
      availability: presence.availability,
      activity: presence.activity,
    },
    "get_presence completed",
  );

  const result = `Presence for ${parsed.user_id}:\n${formatPresenceDetail(presence)}`;
  return { content: [{ type: "text", text: result }] };
}

/**
 * set_status_message — Set custom status message
 */
async function handleSetStatusMessage(
  graphClient: Client,
  parsed: {
    message?: string;
    expires_at?: string;
    confirm?: boolean;
    idempotency_key?: string;
    user_id?: string;
  },
): Promise<ToolResult> {
  // Build preview message
  const previewLines: string[] = [];

  if (parsed.message) {
    previewLines.push(`Status: "${parsed.message}"`);
    if (parsed.expires_at) {
      previewLines.push(`Expires: ${new Date(parsed.expires_at).toLocaleString()}`);
    }
  } else {
    previewLines.push("Action: Clear status message");
  }

  // Check confirmation
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm ?? false,
    formatPreview("Set Status Message", {
      Details: previewLines.join("\n"),
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }

  // Check idempotency
  if (parsed.idempotency_key) {
    const cached = idempotencyCache.get(
      "set_status_message",
      parsed.idempotency_key,
      parsed.user_id,
    );
    if (cached !== undefined) {
      return { content: [{ type: "text", text: cached as string }] };
    }
  }

  // Build request body
  const requestBody: {
    statusMessage: {
      message?: { content: string; contentType: string };
      expiresAt?: string;
    };
  } = {
    statusMessage: {},
  };

  if (parsed.message) {
    requestBody.statusMessage.message = {
      content: parsed.message,
      contentType: "text",
    };
  }

  if (parsed.expires_at) {
    requestBody.statusMessage.expiresAt = parsed.expires_at;
  }

  // Execute
  await graphClient.api("/me/presence/setStatusMessage").post(requestBody);

  const result = parsed.message
    ? `✓ Status message set: "${parsed.message}"`
    : "✓ Status message cleared";

  logger.info(
    {
      cleared: !parsed.message,
      hasExpiration: !!parsed.expires_at,
    },
    "set_status_message completed",
  );

  // Cache result
  if (parsed.idempotency_key) {
    idempotencyCache.set("set_status_message", parsed.idempotency_key, result, parsed.user_id);
  }

  return { content: [{ type: "text", text: result }] };
}

/**
 * Register all presence tools
 */
export const registerPresenceTools: ToolRegistrationFn = (
  server: McpServer,
  graphClient: Client,
  _config: Config,
) => {
  server.tool(
    "get_my_presence",
    "Get your current presence status (availability, activity, status message)",
    GetMyPresenceParams.shape,
    async (params) => {
      const parsed = GetMyPresenceParams.parse(params);
      return handleGetMyPresence(graphClient, parsed);
    },
  );

  server.tool(
    "get_presence",
    "Get another user's presence status by user ID or email",
    GetPresenceParams.shape,
    async (params) => {
      const parsed = GetPresenceParams.parse(params);
      return handleGetPresence(graphClient, parsed);
    },
  );

  server.tool(
    "set_status_message",
    "Set your custom status message with optional expiration (destructive, requires confirmation)",
    SetStatusMessageParams.shape,
    async (params) => {
      const parsed = SetStatusMessageParams.parse(params);
      return handleSetStatusMessage(graphClient, parsed);
    },
  );

  logger.debug("Presence tools registered (3 tools)");
};
