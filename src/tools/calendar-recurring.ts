import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import {
  CreateRecurringEventParams,
  type CreateRecurringEventParamsType,
  UpdateEventSeriesParams,
  type UpdateEventSeriesParamsType,
} from "../schemas/calendar-recurrence.js";
import { resolveUserPath } from "../schemas/common.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, ValidationError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { toAttendees } from "../utils/recipients.js";
import { getUserTimezone } from "../utils/user-settings.js";

const logger = createLogger("tools:calendar-recurring");

// ---------------------------------------------------------------------------
// Helpers — create_recurring_event
// ---------------------------------------------------------------------------

interface PatternInput {
  type: string;
  interval: number;
  first_day_of_week: string;
  days_of_week?: string[];
  day_of_month?: number;
  month?: number;
  index?: string;
}

interface RangeInput {
  type: string;
  start_date: string;
  end_date?: string;
  number_of_occurrences?: number;
}

function buildPatternObject(p: PatternInput): Record<string, unknown> {
  const pattern: Record<string, unknown> = {
    type: p.type,
    interval: p.interval,
    firstDayOfWeek: p.first_day_of_week,
  };
  if (p.days_of_week) pattern.daysOfWeek = p.days_of_week;
  if (p.day_of_month !== undefined) pattern.dayOfMonth = p.day_of_month;
  if (p.month !== undefined) pattern.month = p.month;
  if (p.index) pattern.index = p.index;
  return pattern;
}

function buildRangeObject(r: RangeInput): Record<string, unknown> {
  const range: Record<string, unknown> = {
    type: r.type,
    startDate: r.start_date,
  };
  if (r.end_date) range.endDate = r.end_date;
  if (r.number_of_occurrences !== undefined) range.numberOfOccurrences = r.number_of_occurrences;
  return range;
}

function buildRecurrenceObject(parsed: CreateRecurringEventParamsType): Record<string, unknown> {
  return {
    pattern: buildPatternObject(parsed.recurrence_pattern),
    range: buildRangeObject(parsed.recurrence_range),
  };
}

function buildCreateRecurringBody(parsed: CreateRecurringEventParamsType): Record<string, unknown> {
  const body: Record<string, unknown> = {
    subject: parsed.subject,
    start: parsed.start,
    end: parsed.end,
    recurrence: buildRecurrenceObject(parsed),
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
  if (parsed.is_online_meeting !== undefined) {
    body.isOnlineMeeting = parsed.is_online_meeting;
  }
  if (parsed.is_reminder_on !== undefined) {
    body.isReminderOn = parsed.is_reminder_on;
  }
  if (parsed.reminder_minutes_before_start !== undefined) {
    body.reminderMinutesBeforeStart = parsed.reminder_minutes_before_start;
  }
  return body;
}

function formatPatternSummary(parsed: CreateRecurringEventParamsType): string {
  const p = parsed.recurrence_pattern;
  const intervalStr = p.interval > 1 ? `every ${p.interval} ` : "every ";

  switch (p.type) {
    case "daily":
      return `${intervalStr}day(s)`;
    case "weekly":
      return `${intervalStr}week(s) on ${p.days_of_week?.join(", ") ?? "?"}`;
    case "absoluteMonthly":
      return `${intervalStr}month(s) on day ${p.day_of_month ?? "?"}`;
    case "absoluteYearly":
      return `${intervalStr}year(s) on month ${p.month ?? "?"}, day ${p.day_of_month ?? "?"}`;
    case "relativeMonthly":
      return `${intervalStr}month(s) on ${p.index ?? "?"} ${p.days_of_week?.join(", ") ?? "?"}`;
    case "relativeYearly":
      return `${intervalStr}year(s) on ${p.index ?? "?"} ${p.days_of_week?.join(", ") ?? "?"} of month ${p.month ?? "?"}`;
    default:
      return p.type;
  }
}

function formatRangeSummary(parsed: CreateRecurringEventParamsType): string {
  const r = parsed.recurrence_range;
  switch (r.type) {
    case "endDate":
      return `until ${r.end_date ?? "?"}`;
    case "numbered":
      return `${r.number_of_occurrences ?? "?"} occurrences`;
    case "noEnd":
      return "no end";
    default:
      return r.type;
  }
}

function buildCreateRecurringPreview(parsed: CreateRecurringEventParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Create recurring event", {
      Subject: parsed.subject,
      Start: `${parsed.start.dateTime} (${parsed.start.timeZone})`,
      End: `${parsed.end.dateTime} (${parsed.end.timeZone})`,
      Pattern: formatPatternSummary(parsed),
      Range: formatRangeSummary(parsed),
      Location: parsed.location,
      Attendees: parsed.attendees?.map((a) => a.email).join(", "),
      "Online Meeting": parsed.is_online_meeting ? "Yes" : undefined,
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }
  return null;
}

async function executeCreateRecurring(
  graphClient: Client,
  parsed: CreateRecurringEventParamsType,
  startTime: number,
): Promise<ToolResult> {
  const userPath = resolveUserPath(parsed.user_id);
  const url = `${userPath}/events`;
  const requestBody = buildCreateRecurringBody(parsed);
  const tz = await getUserTimezone(graphClient);

  const result = (await graphClient
    .api(url)
    .header("Prefer", `outlook.timezone="${tz}"`)
    .post(requestBody)) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    {
      tool: "create_recurring_event",
      status: 201,
      duration_ms: endTime - startTime,
    },
    "create_recurring_event completed",
  );

  const eventId = String(result.id ?? "");
  const subject = String(result.subject ?? parsed.subject);

  return {
    content: [
      {
        type: "text",
        text: `Recurring event created successfully.\n\nID: ${eventId}\nSubject: ${subject}\nPattern: ${formatPatternSummary(parsed)}\nRange: ${formatRangeSummary(parsed)}`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Helpers — update_event_series
// ---------------------------------------------------------------------------

const UPDATABLE_SERIES_FIELDS = [
  "subject",
  "start",
  "end",
  "location",
  "body",
  "attendees",
  "recurrence_pattern",
  "recurrence_range",
] as const;

function hasUpdatableSeriesField(parsed: UpdateEventSeriesParamsType): boolean {
  return UPDATABLE_SERIES_FIELDS.some((f) => parsed[f] !== undefined);
}

function buildSeriesBasicFields(parsed: UpdateEventSeriesParamsType): Record<string, unknown> {
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
  return body;
}

function buildSeriesPatchBody(parsed: UpdateEventSeriesParamsType): Record<string, unknown> {
  const body = buildSeriesBasicFields(parsed);
  if (parsed.recurrence_pattern !== undefined || parsed.recurrence_range !== undefined) {
    const recurrence: Record<string, unknown> = {};
    if (parsed.recurrence_pattern) {
      recurrence.pattern = buildPatternObject(parsed.recurrence_pattern);
    }
    if (parsed.recurrence_range) {
      recurrence.range = buildRangeObject(parsed.recurrence_range);
    }
    body.recurrence = recurrence;
  }
  return body;
}

async function buildSeriesUpdatePreview(
  graphClient: Client,
  parsed: UpdateEventSeriesParamsType,
  userPath: string,
): Promise<ToolResult> {
  const url = `${userPath}/events/${encodeGraphId(parsed.series_master_id)}`;
  const tz = await getUserTimezone(graphClient);
  const current = (await graphClient
    .api(url)
    .header("Prefer", `outlook.timezone="${tz}"`)
    .select("id,subject")
    .get()) as Record<string, unknown>;

  const details: Record<string, unknown> = {
    "Series Master ID": parsed.series_master_id,
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
  if (parsed.recurrence_pattern !== undefined)
    details["New pattern"] = parsed.recurrence_pattern.type;
  if (parsed.recurrence_range !== undefined) details["New range"] = parsed.recurrence_range.type;

  const previewText = formatPreview("Update event series", details);
  return { content: [{ type: "text", text: previewText }] };
}

async function executeSeriesUpdate(
  graphClient: Client,
  parsed: UpdateEventSeriesParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const url = `${userPath}/events/${encodeGraphId(parsed.series_master_id)}`;
  const patchBody = buildSeriesPatchBody(parsed);
  const tz = await getUserTimezone(graphClient);

  const result = (await graphClient
    .api(url)
    .header("Prefer", `outlook.timezone="${tz}"`)
    .patch(patchBody)) as Record<string, unknown>;

  const endTime = Date.now();
  const fieldCount = Object.keys(patchBody).length;
  logger.info(
    {
      tool: "update_event_series",
      fieldCount,
      status: 200,
      duration_ms: endTime - startTime,
    },
    "update_event_series completed",
  );

  const subject = String(result.subject ?? "(no subject)");

  return {
    content: [
      {
        type: "text",
        text: `Event series updated successfully.\n\nSubject: ${subject}\nFields changed: ${fieldCount}`,
      },
    ],
  };
}

async function handleSeriesUpdateConfirmed(
  graphClient: Client,
  parsed: UpdateEventSeriesParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  if (parsed.idempotency_key) {
    const cached = idempotencyCache.get(
      "update_event_series",
      parsed.idempotency_key,
      parsed.user_id,
    );
    if (cached !== undefined) return cached as ToolResult;
  }

  const result = await executeSeriesUpdate(graphClient, parsed, userPath, startTime);

  if (parsed.idempotency_key) {
    idempotencyCache.set("update_event_series", parsed.idempotency_key, result, parsed.user_id);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCalendarRecurringTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "create_recurring_event",
    "Create a recurring calendar event with a recurrence pattern (daily, weekly, monthly, yearly). Requires confirm=true to actually create — without it, returns a preview. Supports attendees, location, body, online meeting, and reminders. Use idempotency_key to prevent duplicate creates.",
    CreateRecurringEventParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = CreateRecurringEventParams.parse(params);

        const previewResult = buildCreateRecurringPreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "create_recurring_event",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeCreateRecurring(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set(
            "create_recurring_event",
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
              tool: "create_recurring_event",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "create_recurring_event failed",
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
    "update_event_series",
    "Update a recurring event series (changes apply to all future occurrences). Requires confirm=true to actually update — without it, returns a preview. At least one updatable field must be provided. Use idempotency_key to prevent duplicate updates.",
    UpdateEventSeriesParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = UpdateEventSeriesParams.parse(params);

        if (!hasUpdatableSeriesField(parsed)) {
          throw new ValidationError("At least one updatable field must be provided.");
        }

        const userPath = resolveUserPath(parsed.user_id);

        if (!parsed.confirm) {
          return await buildSeriesUpdatePreview(graphClient, parsed, userPath);
        }

        return await handleSeriesUpdateConfirmed(graphClient, parsed, userPath, startTime);
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "update_event_series",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "update_event_series failed",
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
