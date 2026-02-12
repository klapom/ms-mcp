import { z } from "zod";
import { BaseParams, ListParams } from "./common.js";

/**
 * Parameters for list_calendars tool.
 */
export const ListCalendarsParams = ListParams.extend({});

export type ListCalendarsParamsType = z.infer<typeof ListCalendarsParams>;

/**
 * Parameters for list_events tool.
 */
export const ListEventsParams = ListParams.extend({
  calendar_id: z.string().optional().describe("Kalender-ID. Default: Standard-Kalender"),
  filter: z
    .string()
    .optional()
    .describe("OData $filter, z.B. \"start/dateTime ge '2026-02-01T00:00:00Z'\""),
  orderby: z.string().optional().describe("OData $orderby. Default: start/dateTime asc"),
});

export type ListEventsParamsType = z.infer<typeof ListEventsParams>;

/**
 * Parameters for get_event tool.
 */
export const GetEventParams = BaseParams.extend({
  event_id: z.string().min(1).describe("ID des Kalender-Events"),
  calendar_id: z.string().optional().describe("Kalender-ID. Default: Standard-Kalender"),
});

export type GetEventParamsType = z.infer<typeof GetEventParams>;

/**
 * Parameters for get_calendar_view tool.
 *
 * Note: Temporal validation (end_date_time >= start_date_time) is performed
 * in the tool handler, not via .refine() on the schema, because .refine()
 * creates a ZodEffects which breaks MCP SDK's requirement for .shape access.
 */
export const GetCalendarViewParams = ListParams.extend({
  start_date_time: z
    .string()
    .datetime()
    .describe("Start des Zeitfensters in ISO 8601, z.B. '2026-02-12T00:00:00Z'"),
  end_date_time: z
    .string()
    .datetime()
    .describe("Ende des Zeitfensters in ISO 8601, z.B. '2026-02-19T00:00:00Z'"),
  calendar_id: z.string().optional().describe("Kalender-ID. Default: Standard-Kalender"),
});

export type GetCalendarViewParamsType = z.infer<typeof GetCalendarViewParams>;
