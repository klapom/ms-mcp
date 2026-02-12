import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { UpdateEventParamsType } from "../schemas/calendar-write.js";
import { UpdateEventParams } from "../schemas/calendar-write.js";
import { resolveUserPath } from "../schemas/common.js";
import type { ToolResult } from "../types/tools.js";
import { formatDateTimeRange } from "../utils/calendar-format.js";
import { formatPreview } from "../utils/confirmation.js";
import { McpToolError, ValidationError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { toAttendees } from "../utils/recipients.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";
import { getUserTimezone } from "../utils/user-settings.js";

const logger = createLogger("tools:calendar-update");

const UPDATABLE_FIELDS = [
  "subject",
  "start",
  "end",
  "location",
  "body",
  "attendees",
  "is_all_day",
  "is_online_meeting",
  "importance",
  "sensitivity",
  "show_as",
  "categories",
  "reminder_minutes_before_start",
] as const;

function hasUpdatableField(parsed: UpdateEventParamsType): boolean {
  return UPDATABLE_FIELDS.some((f) => parsed[f] !== undefined);
}

function buildPatchBody(parsed: UpdateEventParamsType): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (parsed.subject !== undefined) body.subject = parsed.subject;
  if (parsed.start !== undefined) body.start = parsed.start;
  if (parsed.end !== undefined) body.end = parsed.end;
  if (parsed.location !== undefined) body.location = { displayName: parsed.location };
  if (parsed.body !== undefined) {
    body.body = {
      contentType: parsed.body_type === "html" ? "HTML" : "Text",
      content: parsed.body,
    };
  }
  if (parsed.attendees !== undefined) {
    body.attendees = toAttendees(parsed.attendees);
  }
  if (parsed.is_all_day !== undefined) body.isAllDay = parsed.is_all_day;
  if (parsed.is_online_meeting !== undefined) body.isOnlineMeeting = parsed.is_online_meeting;
  if (parsed.importance !== undefined) body.importance = parsed.importance;
  if (parsed.sensitivity !== undefined) body.sensitivity = parsed.sensitivity;
  if (parsed.show_as !== undefined) body.showAs = parsed.show_as;
  if (parsed.categories !== undefined) body.categories = parsed.categories;
  if (parsed.reminder_minutes_before_start !== undefined) {
    body.reminderMinutesBeforeStart = parsed.reminder_minutes_before_start;
  }
  return body;
}

async function buildUpdatePreview(
  graphClient: Client,
  parsed: UpdateEventParamsType,
  userPath: string,
): Promise<ToolResult> {
  const url = parsed.calendar_id
    ? `${userPath}/calendars/${encodeGraphId(parsed.calendar_id)}/events/${encodeGraphId(parsed.event_id)}`
    : `${userPath}/events/${encodeGraphId(parsed.event_id)}`;

  const tz = await getUserTimezone(graphClient);
  const current = (await graphClient
    .api(url)
    .header("Prefer", `outlook.timezone="${tz}"`)
    .select(buildSelectParam(DEFAULT_SELECT.eventDetail))
    .get()) as Record<string, unknown>;

  const details: Record<string, unknown> = {
    "Event ID": parsed.event_id,
    "Current subject": current.subject,
  };

  if (parsed.subject !== undefined) details["New subject"] = parsed.subject;
  if (parsed.start !== undefined)
    details["New start"] = `${parsed.start.dateTime} (${parsed.start.timeZone})`;
  if (parsed.end !== undefined)
    details["New end"] = `${parsed.end.dateTime} (${parsed.end.timeZone})`;
  if (parsed.location !== undefined) details["New location"] = parsed.location;
  if (parsed.attendees !== undefined)
    details["New attendees"] = parsed.attendees.map((a) => a.email).join(", ");
  if (parsed.importance !== undefined) details["New importance"] = parsed.importance;
  if (parsed.is_online_meeting !== undefined)
    details["Online Meeting"] = parsed.is_online_meeting ? "Yes" : "No";

  const previewText = formatPreview("Update event", details);
  return { content: [{ type: "text", text: previewText }] };
}

async function executeUpdate(
  graphClient: Client,
  parsed: UpdateEventParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const url = parsed.calendar_id
    ? `${userPath}/calendars/${encodeGraphId(parsed.calendar_id)}/events/${encodeGraphId(parsed.event_id)}`
    : `${userPath}/events/${encodeGraphId(parsed.event_id)}`;

  const patchBody = buildPatchBody(parsed);
  const tz = await getUserTimezone(graphClient);
  const result = (await graphClient
    .api(url)
    .header("Prefer", `outlook.timezone="${tz}"`)
    .patch(patchBody)) as Record<string, unknown>;

  const endTime = Date.now();
  const fieldCount = Object.keys(patchBody).length;
  logger.info(
    {
      tool: "update_event",
      fieldCount,
      status: 200,
      duration_ms: endTime - startTime,
    },
    "update_event completed",
  );

  const subject = String(result.subject ?? "(no subject)");
  const isAllDay = result.isAllDay === true;
  const dateRange = formatDateTimeRange(result.start, result.end, isAllDay);

  return {
    content: [
      {
        type: "text",
        text: `Event updated successfully.\n\nSubject: ${subject}\nTime: ${dateRange}\nFields changed: ${fieldCount}`,
      },
    ],
  };
}

async function handleUpdateConfirmed(
  graphClient: Client,
  parsed: UpdateEventParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  if (parsed.idempotency_key) {
    const cached = idempotencyCache.get("update_event", parsed.idempotency_key, parsed.user_id);
    if (cached !== undefined) return cached as ToolResult;
  }

  const result = await executeUpdate(graphClient, parsed, userPath, startTime);

  if (parsed.idempotency_key) {
    idempotencyCache.set("update_event", parsed.idempotency_key, result, parsed.user_id);
  }

  return result;
}

export function registerCalendarUpdateTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "update_event",
    "Update an existing calendar event. Requires confirm=true to actually update — without it, fetches the current event and returns a preview with current vs new values. At least one updatable field must be provided. Use idempotency_key to prevent duplicate updates.",
    UpdateEventParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = UpdateEventParams.parse(params);

        if (!hasUpdatableField(parsed)) {
          throw new ValidationError("At least one updatable field must be provided.");
        }

        const userPath = resolveUserPath(parsed.user_id);

        if (!parsed.confirm) {
          return await buildUpdatePreview(graphClient, parsed, userPath);
        }

        return await handleUpdateConfirmed(graphClient, parsed, userPath, startTime);
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "update_event",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "update_event failed",
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
