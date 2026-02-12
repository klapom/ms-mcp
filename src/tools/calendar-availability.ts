import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { CheckAvailabilityParams } from "../schemas/calendar-write.js";
import { resolveUserPath } from "../schemas/common.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:calendar-availability");

const AVAILABILITY_CODES: Record<string, string> = {
  "0": "free",
  "1": "tentative",
  "2": "busy",
  "3": "oof",
  "4": "workingElsewhere",
};

function decodeAvailabilityView(view: string): string {
  if (!view) return "(no data)";
  return [...view].map((c) => AVAILABILITY_CODES[c] ?? `unknown(${c})`).join(", ");
}

function formatScheduleDetailLine(si: unknown): string | null {
  if (!isRecordObject(si)) return null;
  const status = typeof si.status === "string" ? si.status : "unknown";
  const subject = typeof si.subject === "string" ? si.subject : "";
  const startDt =
    isRecordObject(si.start) && typeof si.start.dateTime === "string"
      ? si.start.dateTime.slice(0, 16)
      : "";
  const endDt =
    isRecordObject(si.end) && typeof si.end.dateTime === "string"
      ? si.end.dateTime.slice(0, 16)
      : "";
  const subjectInfo = subject ? ` — ${subject}` : "";
  return `    [${status}] ${startDt}–${endDt}${subjectInfo}`;
}

function formatScheduleItem(item: unknown): string {
  if (!isRecordObject(item)) return "(invalid schedule item)";
  const email = typeof item.scheduleId === "string" ? item.scheduleId : "(unknown)";
  const view = typeof item.availabilityView === "string" ? item.availabilityView : "";
  const decoded = decodeAvailabilityView(view);

  const lines = [`Schedule: ${email}`, `  Availability: ${decoded}`];

  if (Array.isArray(item.scheduleItems) && item.scheduleItems.length > 0) {
    lines.push("  Details:");
    for (const si of item.scheduleItems) {
      const detail = formatScheduleDetailLine(si);
      if (detail) lines.push(detail);
    }
  }

  return lines.join("\n");
}

export function registerCalendarAvailabilityTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "check_availability",
    "Check availability (free/busy) for one or more users in a time window. Returns per-user availability view with status codes (free, tentative, busy, oof, workingElsewhere). Safe operation — no confirmation required.",
    CheckAvailabilityParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = CheckAvailabilityParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        const requestBody = {
          schedules: parsed.schedules,
          startTime: parsed.start,
          endTime: parsed.end,
          availabilityViewInterval: parsed.availability_view_interval,
        };

        const result = (await graphClient
          .api(`${userPath}/calendar/getSchedule`)
          .post(requestBody)) as Record<string, unknown>;

        const schedules = Array.isArray(result.value) ? result.value : [];
        const endTime = Date.now();

        logger.info(
          {
            tool: "check_availability",
            scheduleCount: parsed.schedules.length,
            status: 200,
            duration_ms: endTime - startTime,
          },
          "check_availability completed",
        );

        const text =
          schedules.length === 0
            ? "Keine Verfügbarkeitsdaten gefunden."
            : schedules.map((s: unknown) => formatScheduleItem(s)).join("\n\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "check_availability",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "check_availability failed",
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
