import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { ShareCalendarParams } from "../schemas/calendar-sharing.js";
import type { ShareCalendarParamsType } from "../schemas/calendar-sharing.js";
import { resolveUserPath } from "../schemas/common.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:calendar-sharing");

const ROLE_DESCRIPTIONS: Record<string, string> = {
  freeBusyRead: "See only free/busy times",
  limitedRead: "See free/busy + subject/location",
  read: "See all details (read-only)",
  write: "See all + create/edit/delete",
  delegateWithoutPrivateEventAccess: "Act as calendar owner (no private events)",
  delegateWithPrivateEventAccess: "Act as calendar owner (with private events)",
};

function buildSharePreview(parsed: ShareCalendarParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Share calendar", {
      Recipient: parsed.recipient_email,
      Role: `${parsed.role} — ${ROLE_DESCRIPTIONS[parsed.role] ?? parsed.role}`,
      "Send invitation": parsed.send_invitation ? "Yes" : "No",
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }
  return null;
}

async function executeShare(
  graphClient: Client,
  parsed: ShareCalendarParamsType,
  startTime: number,
): Promise<ToolResult> {
  const userPath = resolveUserPath(parsed.user_id);
  const url = `${userPath}/calendar/calendarPermissions`;

  const requestBody: Record<string, unknown> = {
    emailAddress: { address: parsed.recipient_email, name: parsed.recipient_email },
    role: parsed.role,
    isInsideOrganization: true,
    allowedRoles: [parsed.role],
  };

  const result = (await graphClient.api(url).post(requestBody)) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    {
      tool: "share_calendar",
      role: parsed.role,
      status: 200,
      duration_ms: endTime - startTime,
    },
    "share_calendar completed",
  );

  const permissionId = String(result.id ?? "");

  return {
    content: [
      {
        type: "text",
        text: `Calendar shared successfully.\n\nPermission ID: ${permissionId}\nRecipient: ${parsed.recipient_email}\nRole: ${parsed.role}\nInvitation sent: ${parsed.send_invitation ? "Yes" : "No"}`,
      },
    ],
  };
}

export function registerCalendarSharingTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "share_calendar",
    "Share your calendar with another user. Set permission level from freeBusyRead (minimal) to delegate (full access). Requires confirm=true to actually share — without it, returns a preview. Use idempotency_key to prevent duplicate shares.",
    ShareCalendarParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = ShareCalendarParams.parse(params);

        const previewResult = buildSharePreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "share_calendar",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeShare(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("share_calendar", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "share_calendar",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "share_calendar failed",
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
