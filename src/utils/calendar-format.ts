import { extractAddress } from "./address-format.js";
import { isRecordObject } from "./type-guards.js";

/**
 * Formats a Graph API dateTimeTimeZone pair into a human-readable range.
 * Handles all-day events (date only) and timed events (date + HH:MM + timezone).
 */
export function formatDateTimeRange(start: unknown, end: unknown, isAllDay: boolean): string {
  const startStr = formatDateTime(start);
  const endStr = formatDateTime(end);

  if (isAllDay) {
    const startDate = startStr.split("T")[0] ?? startStr;
    const endDate = endStr.split("T")[0] ?? endStr;
    return startDate === endDate
      ? `${startDate} (ganztägig)`
      : `${startDate} – ${endDate} (ganztägig)`;
  }

  const startTz = getTimeZone(start);
  const startTime = formatTime(startStr);
  const endTime = formatTime(endStr);
  const startDate = startStr.split("T")[0] ?? startStr;

  return `${startDate} ${startTime}–${endTime}${startTz ? ` (${startTz})` : ""}`;
}

/** Extracts the dateTime string from a Graph API dateTimeTimeZone object. */
export function formatDateTime(dt: unknown): string {
  if (!isRecordObject(dt)) return "";
  return typeof dt.dateTime === "string" ? dt.dateTime : "";
}

/** Extracts the timeZone string from a Graph API dateTimeTimeZone object. */
export function getTimeZone(dt: unknown): string {
  if (!isRecordObject(dt)) return "";
  return typeof dt.timeZone === "string" ? dt.timeZone : "";
}

/** Extracts HH:MM from an ISO dateTime string. */
export function formatTime(dateTimeStr: string): string {
  const timePart = dateTimeStr.split("T")[1];
  if (!timePart) return dateTimeStr;
  return timePart.slice(0, 5);
}

/** Extracts displayName from a Graph API location object. */
export function getLocationName(location: unknown): string {
  if (!isRecordObject(location)) return "";
  return typeof location.displayName === "string" ? location.displayName : "";
}

/**
 * Formats a calendar event as a single summary line for list views.
 * Used by both list_events and get_calendar_view.
 */
export function formatEventSummary(index: number, event: Record<string, unknown>): string {
  const subject = String(event.subject ?? "(kein Betreff)");
  const isAllDay = event.isAllDay === true;
  const isCancelled = event.isCancelled === true;
  const dateRange = formatDateTimeRange(event.start, event.end, isAllDay);
  const location = getLocationName(event.location);
  const organizer = extractAddress(event.organizer);
  const showAs = typeof event.showAs === "string" ? event.showAs : "busy";
  const cancelledMarker = isCancelled ? " [CANCELLED]" : "";

  const lines = [`[${index}] ${dateRange} | ${subject}${cancelledMarker}`];
  const details: string[] = [];
  if (location) details.push(`Location: ${location}`);
  details.push(`Organizer: ${organizer}`);
  details.push(showAs);
  lines.push(`    ${details.join(" | ")}`);

  return lines.join("\n");
}
