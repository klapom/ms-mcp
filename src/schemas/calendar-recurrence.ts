import { z } from "zod";
import { AttendeeInput, DateTimeTimeZone } from "./calendar-write.js";
import { ListParams, WriteParams } from "./common.js";

/**
 * Graph API RecurrencePattern schema.
 */
export const RecurrencePattern = z.object({
  type: z
    .enum([
      "daily",
      "weekly",
      "absoluteMonthly",
      "absoluteYearly",
      "relativeMonthly",
      "relativeYearly",
    ])
    .describe("Recurrence type"),
  interval: z
    .number()
    .int()
    .min(1)
    .max(99)
    .default(1)
    .describe("Interval between occurrences (e.g., 2 = every 2 weeks)"),
  days_of_week: z
    .array(z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]))
    .optional()
    .describe("Days of week for weekly/relative recurrence"),
  day_of_month: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional()
    .describe("Day of month for absoluteMonthly/absoluteYearly recurrence"),
  month: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe("Month for absoluteYearly recurrence (1=January)"),
  first_day_of_week: z
    .enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
    .default("monday")
    .describe("First day of week for calculations"),
  index: z
    .enum(["first", "second", "third", "fourth", "last"])
    .optional()
    .describe("Week index for relativeMonthly/relativeYearly recurrence"),
});

/**
 * Graph API RecurrenceRange schema.
 */
export const RecurrenceRange = z.object({
  type: z.enum(["endDate", "noEnd", "numbered"]).describe("Recurrence range type"),
  start_date: z.string().describe("Start date (YYYY-MM-DD)"),
  end_date: z.string().optional().describe("End date for 'endDate' type (YYYY-MM-DD)"),
  number_of_occurrences: z
    .number()
    .int()
    .min(1)
    .max(999)
    .optional()
    .describe("Number of occurrences for 'numbered' type"),
});

/**
 * Parameters for create_recurring_event tool.
 */
export const CreateRecurringEventParams = WriteParams.extend({
  subject: z.string().min(1).max(255).describe("Event subject"),
  start: DateTimeTimeZone.describe("Start date/time of first occurrence"),
  end: DateTimeTimeZone.describe("End date/time of first occurrence"),
  recurrence_pattern: RecurrencePattern.describe("Recurrence pattern"),
  recurrence_range: RecurrenceRange.describe("Recurrence range"),
  location: z.string().optional().describe("Location display name"),
  body: z.string().optional().describe("Event body content"),
  body_type: z.enum(["text", "html"]).default("text").describe("Body format"),
  attendees: z.array(AttendeeInput).optional().describe("List of attendees"),
  is_reminder_on: z.boolean().optional().describe("Enable reminder"),
  reminder_minutes_before_start: z
    .number()
    .int()
    .min(0)
    .max(40320)
    .optional()
    .describe("Reminder in minutes before start"),
  is_online_meeting: z.boolean().optional().describe("Create as online meeting (Teams)"),
});

export type CreateRecurringEventParamsType = z.infer<typeof CreateRecurringEventParams>;

/**
 * Parameters for update_event_series tool.
 */
export const UpdateEventSeriesParams = WriteParams.extend({
  series_master_id: z.string().min(1).describe("Series master event ID"),
  subject: z.string().min(1).max(255).optional().describe("New subject"),
  start: DateTimeTimeZone.optional().describe("New start date/time"),
  end: DateTimeTimeZone.optional().describe("New end date/time"),
  location: z.string().optional().describe("New location"),
  body: z.string().optional().describe("New body content"),
  body_type: z.enum(["text", "html"]).optional().describe("Body format"),
  attendees: z.array(AttendeeInput).optional().describe("New attendee list"),
  recurrence_pattern: RecurrencePattern.optional().describe("New recurrence pattern"),
  recurrence_range: RecurrenceRange.optional().describe("New recurrence range"),
});

export type UpdateEventSeriesParamsType = z.infer<typeof UpdateEventSeriesParams>;

/**
 * Parameters for list_event_instances tool.
 */
export const ListEventInstancesParams = ListParams.extend({
  series_master_id: z.string().min(1).describe("Series master event ID"),
  start_date_time: z.string().optional().describe("Filter: instances after this date (ISO 8601)"),
  end_date_time: z.string().optional().describe("Filter: instances before this date (ISO 8601)"),
});

export type ListEventInstancesParamsType = z.infer<typeof ListEventInstancesParams>;
