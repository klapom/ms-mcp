import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { GetEventParams, ListEventsParams } from "../schemas/calendar.js";
import { resolveUserPath } from "../schemas/common.js";
import { extractAddress } from "../utils/address-format.js";
import {
  formatDateTimeRange,
  formatEventSummary,
  getLocationName,
} from "../utils/calendar-format.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { convertHtmlToText } from "../utils/html-convert.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import {
  DEFAULT_SELECT,
  buildSelectParam,
  shapeListResponse,
  truncateBody,
} from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";
import { getUserTimezone } from "../utils/user-settings.js";

const logger = createLogger("tools:calendar-events");

const GET_EVENT_DEFAULT_BODY_LENGTH = 5000;

export function registerCalendarEventTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_events",
    "List calendar events with optional filtering and pagination. Returns event summary (subject, time, location, organizer). Use calendar_id for a specific calendar, or omit for the default calendar. Supports OData $filter for time range queries and $orderby for sorting.",
    ListEventsParams.shape,
    async (params) => {
      try {
        const parsed = ListEventsParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        const url = parsed.calendar_id
          ? `${userPath}/calendars/${encodeGraphId(parsed.calendar_id)}/events`
          : `${userPath}/events`;
        const tz = await getUserTimezone(graphClient);

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.event),
          filter: parsed.filter,
          orderby: parsed.orderby ?? "start/dateTime asc",
          headers: { Prefer: `outlook.timezone="${tz}"` },
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No events found."
            : [...items.map((ev, i) => formatEventSummary(i + 1, ev)), "", paginationHint].join(
                "\n",
              );

        logger.info({ tool: "list_events", eventCount: items.length }, "list_events completed");

        return { content: [{ type: "text" as const, text }] };
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
    "get_event",
    "Get full details of a single calendar event including body, attendees, recurrence, online meeting info, and categories. Use format-optimized plain text body by default.",
    GetEventParams.shape,
    async (params) => {
      try {
        const parsed = GetEventParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        const url = parsed.calendar_id
          ? `${userPath}/calendars/${encodeGraphId(parsed.calendar_id)}/events/${encodeGraphId(parsed.event_id)}`
          : `${userPath}/events/${encodeGraphId(parsed.event_id)}`;

        const tz = await getUserTimezone(graphClient);
        const response = (await graphClient
          .api(url)
          .header("Prefer", `outlook.timezone="${tz}"`)
          .select(buildSelectParam(DEFAULT_SELECT.eventDetail))
          .get()) as Record<string, unknown>;

        const text = formatEventDetail(response);

        logger.info({ tool: "get_event", eventId: parsed.event_id }, "get_event completed");

        return { content: [{ type: "text" as const, text }] };
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

function formatEventHeader(event: Record<string, unknown>): string[] {
  const subject = String(event.subject ?? "(no subject)");
  const isAllDay = event.isAllDay === true;
  const dateRange = formatDateTimeRange(event.start, event.end, isAllDay);
  const location = getLocationName(event.location);
  const organizer = extractAddress(event.organizer);
  const isOrganizer = event.isOrganizer === true;
  const importance = String(event.importance ?? "normal");
  const sensitivity = String(event.sensitivity ?? "normal");
  const showAs = typeof event.showAs === "string" ? event.showAs : "busy";

  const lines: string[] = [`Subject: ${subject}`, `Time: ${dateRange}`];
  if (location) lines.push(`Location: ${location}`);
  lines.push(`Organizer: ${organizer}${isOrganizer ? " (you)" : ""}`);
  lines.push(`Status: ${showAs} | Importance: ${importance} | Sensitivity: ${sensitivity}`);
  if (event.isCancelled === true) lines.push("CANCELLED");
  if (event.hasAttachments === true) lines.push("Attachments: Yes");
  return lines;
}

function formatAttendeeLines(attendees: unknown): string[] {
  if (!Array.isArray(attendees) || attendees.length === 0) return [];
  const lines: string[] = ["", "Attendees:"];
  for (const att of attendees) {
    if (isRecordObject(att)) {
      const type = typeof att.type === "string" ? att.type : "required";
      const addr = extractAddress(att);
      const status = getAttendeeResponse(att.status);
      lines.push(`  [${type}] ${addr} — ${status}`);
    }
  }
  return lines;
}

function formatEventExtras(event: Record<string, unknown>): string[] {
  const lines: string[] = [];

  if (event.isOnlineMeeting === true) {
    const meetingUrl = getOnlineMeetingUrl(event);
    if (meetingUrl) lines.push("", `Online Meeting: ${meetingUrl}`);
  }

  if (Array.isArray(event.categories) && event.categories.length > 0) {
    lines.push("", `Categories: ${event.categories.join(", ")}`);
  }

  if (isRecordObject(event.recurrence)) {
    lines.push("", "Recurrence: Yes (recurring event)");
  }

  const bodyContent = extractEventBody(event);
  if (bodyContent) lines.push("", "--- Body ---", bodyContent);

  const webLink = typeof event.webLink === "string" ? event.webLink : "";
  if (webLink) lines.push("", `Web: ${webLink}`);

  return lines;
}

function formatEventDetail(event: Record<string, unknown>): string {
  const lines = [
    ...formatEventHeader(event),
    ...formatAttendeeLines(event.attendees),
    ...formatEventExtras(event),
  ];
  return lines.join("\n");
}

function getAttendeeResponse(status: unknown): string {
  if (!isRecordObject(status)) return "none";
  return typeof status.response === "string" ? status.response : "none";
}

function getOnlineMeetingUrl(event: Record<string, unknown>): string {
  if (typeof event.onlineMeetingUrl === "string" && event.onlineMeetingUrl) {
    return event.onlineMeetingUrl;
  }
  if (isRecordObject(event.onlineMeeting)) {
    if (typeof event.onlineMeeting.joinUrl === "string") {
      return event.onlineMeeting.joinUrl;
    }
  }
  return "";
}

function extractEventBody(event: Record<string, unknown>): string {
  if (!isRecordObject(event.body)) return "";
  const rawContent = typeof event.body.content === "string" ? event.body.content : "";
  if (!rawContent) return "";

  const contentType = typeof event.body.contentType === "string" ? event.body.contentType : "text";

  if (contentType.toLowerCase() === "html") {
    return convertHtmlToText(rawContent, GET_EVENT_DEFAULT_BODY_LENGTH);
  }
  return truncateBody(rawContent, GET_EVENT_DEFAULT_BODY_LENGTH);
}
