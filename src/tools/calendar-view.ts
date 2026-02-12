import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { GetCalendarViewParams } from "../schemas/calendar.js";
import { resolveUserPath } from "../schemas/common.js";
import { formatEventSummary } from "../utils/calendar-format.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";

const logger = createLogger("tools:calendar-view");

export function registerCalendarViewTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "get_calendar_view",
    "Get a calendar view for a specific time range. Unlike list_events, this expands recurring events into individual occurrences. Requires startDateTime and endDateTime in ISO 8601 format. Use calendar_id for a specific calendar.",
    GetCalendarViewParams.shape,
    async (params) => {
      try {
        const parsed = GetCalendarViewParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        const url = parsed.calendar_id
          ? `${userPath}/calendars/${encodeGraphId(parsed.calendar_id)}/calendarView`
          : `${userPath}/calendarView`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          query: {
            startDateTime: parsed.start_date_time,
            endDateTime: parsed.end_date_time,
          },
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.event),
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? `Keine Events im Zeitraum ${parsed.start_date_time} bis ${parsed.end_date_time}.`
            : [
                `Kalenderansicht: ${parsed.start_date_time} bis ${parsed.end_date_time}`,
                "",
                ...items.map((ev, i) => formatEventSummary(i + 1, ev)),
                "",
                paginationHint,
              ].join("\n");

        logger.info(
          { tool: "get_calendar_view", eventCount: items.length },
          "get_calendar_view completed",
        );

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
