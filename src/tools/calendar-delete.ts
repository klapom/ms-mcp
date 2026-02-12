import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { DeleteEventParamsType } from "../schemas/calendar-write.js";
import { DeleteEventParams } from "../schemas/calendar-write.js";
import { resolveUserPath } from "../schemas/common.js";
import type { ToolResult } from "../types/tools.js";
import { formatDateTimeRange } from "../utils/calendar-format.js";
import { formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";
import { getUserTimezone } from "../utils/user-settings.js";

const logger = createLogger("tools:calendar-delete");

async function buildDeletePreview(
  graphClient: Client,
  parsed: DeleteEventParamsType,
  userPath: string,
): Promise<ToolResult> {
  const url = parsed.calendar_id
    ? `${userPath}/calendars/${encodeGraphId(parsed.calendar_id)}/events/${encodeGraphId(parsed.event_id)}`
    : `${userPath}/events/${encodeGraphId(parsed.event_id)}`;

  const tz = await getUserTimezone(graphClient);
  const event = (await graphClient
    .api(url)
    .header("Prefer", `outlook.timezone="${tz}"`)
    .select(buildSelectParam(DEFAULT_SELECT.event))
    .get()) as Record<string, unknown>;

  const subject = String(event.subject ?? "(no subject)");
  const isAllDay = event.isAllDay === true;
  const dateRange = formatDateTimeRange(event.start, event.end, isAllDay);

  const previewText = formatPreview("Delete event", {
    Subject: subject,
    Time: dateRange,
  });

  return { content: [{ type: "text", text: previewText }] };
}

async function executeDelete(
  graphClient: Client,
  parsed: DeleteEventParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const url = parsed.calendar_id
    ? `${userPath}/calendars/${encodeGraphId(parsed.calendar_id)}/events/${encodeGraphId(parsed.event_id)}`
    : `${userPath}/events/${encodeGraphId(parsed.event_id)}`;

  await graphClient.api(url).delete();

  const endTime = Date.now();
  logger.info(
    {
      tool: "delete_event",
      status: 204,
      duration_ms: endTime - startTime,
    },
    "delete_event completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Event deleted successfully.\n\nEvent ID: ${parsed.event_id}\nTimestamp: ${new Date(endTime).toISOString()}`,
      },
    ],
  };
}

export function registerCalendarDeleteTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "delete_event",
    "Delete a calendar event. Requires confirm=true to actually delete — without it, fetches the event and returns a preview. Use idempotency_key to prevent duplicate deletes.",
    DeleteEventParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = DeleteEventParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        if (!parsed.confirm) {
          return await buildDeletePreview(graphClient, parsed, userPath);
        }

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "delete_event",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeDelete(graphClient, parsed, userPath, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("delete_event", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "delete_event",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "delete_event failed",
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
