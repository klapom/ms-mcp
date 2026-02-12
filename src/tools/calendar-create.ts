import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { CreateEventParamsType } from "../schemas/calendar-write.js";
import { CreateEventParams } from "../schemas/calendar-write.js";
import { resolveUserPath } from "../schemas/common.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { toAttendees } from "../utils/recipients.js";
import { getUserTimezone } from "../utils/user-settings.js";

const logger = createLogger("tools:calendar-create");

function buildCreateRequestBody(parsed: CreateEventParamsType): Record<string, unknown> {
  const body: Record<string, unknown> = {
    subject: parsed.subject,
    start: parsed.start,
    end: parsed.end,
    isAllDay: parsed.is_all_day,
    isOnlineMeeting: parsed.is_online_meeting,
    importance: parsed.importance,
    sensitivity: parsed.sensitivity,
    showAs: parsed.show_as,
  };
  if (parsed.location) {
    body.location = { displayName: parsed.location };
  }
  if (parsed.body) {
    body.body = {
      contentType: parsed.body_type === "html" ? "HTML" : "Text",
      content: parsed.body,
    };
  }
  if (parsed.attendees && parsed.attendees.length > 0) {
    body.attendees = toAttendees(parsed.attendees);
  }
  if (parsed.categories) {
    body.categories = parsed.categories;
  }
  if (parsed.reminder_minutes_before_start !== undefined) {
    body.reminderMinutesBeforeStart = parsed.reminder_minutes_before_start;
  }
  return body;
}

function buildCreatePreview(parsed: CreateEventParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Create event", {
      Subject: parsed.subject,
      Start: `${parsed.start.dateTime} (${parsed.start.timeZone})`,
      End: `${parsed.end.dateTime} (${parsed.end.timeZone})`,
      Location: parsed.location,
      "All-day": parsed.is_all_day ? "Yes" : "No",
      "Online Meeting": parsed.is_online_meeting ? "Yes" : "No",
      Attendees: parsed.attendees?.map((a) => a.email).join(", "),
      Importance: parsed.importance,
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }
  return null;
}

async function executeCreate(
  graphClient: Client,
  parsed: CreateEventParamsType,
  startTime: number,
): Promise<ToolResult> {
  const userPath = resolveUserPath(parsed.user_id);
  const url = parsed.calendar_id
    ? `${userPath}/calendars/${encodeGraphId(parsed.calendar_id)}/events`
    : `${userPath}/events`;

  const requestBody = buildCreateRequestBody(parsed);
  const tz = await getUserTimezone(graphClient);
  const result = (await graphClient
    .api(url)
    .header("Prefer", `outlook.timezone="${tz}"`)
    .post(requestBody)) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    {
      tool: "create_event",
      attendeeCount: parsed.attendees?.length ?? 0,
      hasOnlineMeeting: parsed.is_online_meeting,
      status: 201,
      duration_ms: endTime - startTime,
    },
    "create_event completed",
  );

  const eventId = String(result.id ?? "");
  const subject = String(result.subject ?? parsed.subject);

  return {
    content: [
      {
        type: "text",
        text: `Event created successfully.\n\nID: ${eventId}\nSubject: ${subject}\nTimestamp: ${new Date(endTime).toISOString()}`,
      },
    ],
  };
}

export function registerCalendarCreateTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "create_event",
    "Create a new calendar event. Requires confirm=true to actually create — without it, returns a preview. Supports subject, start/end (with timezone), location, body, attendees, online meeting, importance, sensitivity, show_as, categories, and reminder. Use calendar_id for a specific calendar. Use idempotency_key to prevent duplicate creates.",
    CreateEventParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = CreateEventParams.parse(params);

        const previewResult = buildCreatePreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "create_event",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeCreate(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("create_event", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "create_event",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "create_event failed",
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
