import { z } from "zod";
import { BaseParams, WriteParams } from "./common.js";

/**
 * Reusable sub-schema for Graph API dateTimeTimeZone objects.
 */
export const DateTimeTimeZone = z.object({
  dateTime: z.string().describe("ISO 8601, e.g. '2026-02-15T10:00:00'"),
  timeZone: z.string().describe("IANA timezone, e.g. 'Europe/Berlin'"),
});

/**
 * Reusable sub-schema for attendee input.
 */
export const AttendeeInput = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  type: z.enum(["required", "optional", "resource"]).default("required"),
});

/**
 * Parameters for create_event tool.
 */
export const CreateEventParams = WriteParams.extend({
  subject: z.string().min(1).describe("Event subject/title"),
  start: DateTimeTimeZone.describe("Start date/time with timezone"),
  end: DateTimeTimeZone.describe("End date/time with timezone"),
  location: z.string().optional().describe("Location display name"),
  body: z.string().optional().describe("Event body content"),
  body_type: z.enum(["text", "html"]).default("text").describe("Body format: 'text' or 'html'"),
  attendees: z.array(AttendeeInput).optional().describe("List of attendees"),
  is_all_day: z.boolean().default(false).describe("All-day event"),
  is_online_meeting: z.boolean().default(false).describe("Create as online meeting (Teams)"),
  importance: z.enum(["low", "normal", "high"]).default("normal").describe("Event importance"),
  sensitivity: z
    .enum(["normal", "personal", "private", "confidential"])
    .default("normal")
    .describe("Event sensitivity"),
  show_as: z
    .enum(["free", "tentative", "busy", "oof", "workingElsewhere", "unknown"])
    .default("busy")
    .describe("Show-as status"),
  categories: z.array(z.string()).optional().describe("Event categories"),
  reminder_minutes_before_start: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Reminder in minutes before start"),
  calendar_id: z.string().optional().describe("Calendar ID. Default: default calendar"),
});

export type CreateEventParamsType = z.infer<typeof CreateEventParams>;

/**
 * Parameters for update_event tool.
 * At least one updatable field must be provided (validated in handler).
 */
export const UpdateEventParams = WriteParams.extend({
  event_id: z.string().min(1).describe("ID of the event to update"),
  subject: z.string().min(1).optional().describe("New subject"),
  start: DateTimeTimeZone.optional().describe("New start date/time"),
  end: DateTimeTimeZone.optional().describe("New end date/time"),
  location: z.string().optional().describe("New location display name"),
  body: z.string().optional().describe("New body content"),
  body_type: z.enum(["text", "html"]).optional().describe("Body format"),
  attendees: z.array(AttendeeInput).optional().describe("New attendee list (replaces existing)"),
  is_all_day: z.boolean().optional().describe("All-day event"),
  is_online_meeting: z.boolean().optional().describe("Online meeting flag"),
  importance: z.enum(["low", "normal", "high"]).optional().describe("Event importance"),
  sensitivity: z
    .enum(["normal", "personal", "private", "confidential"])
    .optional()
    .describe("Event sensitivity"),
  show_as: z
    .enum(["free", "tentative", "busy", "oof", "workingElsewhere", "unknown"])
    .optional()
    .describe("Show-as status"),
  categories: z.array(z.string()).optional().describe("Event categories"),
  reminder_minutes_before_start: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Reminder in minutes"),
  calendar_id: z.string().optional().describe("Calendar ID. Default: default calendar"),
});

export type UpdateEventParamsType = z.infer<typeof UpdateEventParams>;

/**
 * Parameters for delete_event tool.
 */
export const DeleteEventParams = WriteParams.extend({
  event_id: z.string().min(1).describe("ID of the event to delete"),
  calendar_id: z.string().optional().describe("Calendar ID. Default: default calendar"),
});

export type DeleteEventParamsType = z.infer<typeof DeleteEventParams>;

/**
 * Parameters for respond_to_event tool.
 */
export const RespondToEventParams = WriteParams.extend({
  event_id: z.string().min(1).describe("ID of the event to respond to"),
  action: z
    .enum(["accept", "decline", "tentativelyAccept"])
    .describe("Response action: accept, decline, or tentativelyAccept"),
  comment: z.string().max(1000).optional().describe("Optional comment with the response"),
  send_response: z.boolean().default(true).describe("Send response to organizer (default: true)"),
  calendar_id: z.string().optional().describe("Calendar ID. Default: default calendar"),
});

export type RespondToEventParamsType = z.infer<typeof RespondToEventParams>;

/**
 * Parameters for check_availability tool (safe — no confirm needed).
 */
export const CheckAvailabilityParams = BaseParams.extend({
  schedules: z
    .array(z.string().email())
    .min(1)
    .max(20)
    .describe("Email addresses to check availability for (1-20)"),
  start: DateTimeTimeZone.describe("Start of the time window"),
  end: DateTimeTimeZone.describe("End of the time window"),
  availability_view_interval: z
    .number()
    .int()
    .positive()
    .default(30)
    .describe("Interval in minutes for availability view (default: 30)"),
});

export type CheckAvailabilityParamsType = z.infer<typeof CheckAvailabilityParams>;
