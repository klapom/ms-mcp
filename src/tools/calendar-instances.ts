import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { ListEventInstancesParams } from "../schemas/calendar-recurrence.js";
import { resolveUserPath } from "../schemas/common.js";
import { formatDateTimeRange } from "../utils/calendar-format.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";
import { getUserTimezone } from "../utils/user-settings.js";

const logger = createLogger("tools:calendar-instances");

const INSTANCE_SELECT = ["id", "subject", "start", "end", "location", "isCancelled", "type"];

function getLocationName(location: unknown): string {
  if (!isRecordObject(location)) return "";
  return typeof location.displayName === "string" ? location.displayName : "";
}

function formatInstance(index: number, instance: Record<string, unknown>): string {
  const subject = String(instance.subject ?? "(no subject)");
  const dateRange = formatDateTimeRange(instance.start, instance.end, false);
  const location = getLocationName(instance.location);
  const isCancelled = instance.isCancelled === true;
  const instanceType = typeof instance.type === "string" ? instance.type : "occurrence";
  const id = typeof instance.id === "string" ? instance.id : "";

  const cancelledMarker = isCancelled ? " [CANCELLED]" : "";
  const exceptionMarker = instanceType === "exception" ? " [MODIFIED]" : "";

  const lines = [`[${index}] ${dateRange} | ${subject}${cancelledMarker}${exceptionMarker}`];
  const details: string[] = [];
  if (location) details.push(`Location: ${location}`);
  details.push(`Type: ${instanceType}`);
  if (details.length > 0) lines.push(`    ${details.join(" | ")}`);
  if (id) lines.push(`    ID: ${id}`);

  return lines.join("\n");
}

export function registerCalendarInstancesTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_event_instances",
    "List all instances of a recurring event series. Filter by date range with start_date_time and end_date_time. Shows individual occurrences with actual dates, cancellations, and exceptions (modified instances). Safe operation — no confirmation required.",
    ListEventInstancesParams.shape,
    async (params) => {
      try {
        const parsed = ListEventInstancesParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/events/${encodeGraphId(parsed.series_master_id)}/instances`;
        const tz = await getUserTimezone(graphClient);

        const query: Record<string, string> = {};
        if (parsed.start_date_time) {
          query.startDateTime = parsed.start_date_time;
        }
        if (parsed.end_date_time) {
          query.endDateTime = parsed.end_date_time;
        }

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(INSTANCE_SELECT),
          query: Object.keys(query).length > 0 ? query : undefined,
          headers: { Prefer: `outlook.timezone="${tz}"` },
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No instances found."
            : [...items.map((inst, i) => formatInstance(i + 1, inst)), "", paginationHint].join(
                "\n",
              );

        logger.info(
          { tool: "list_event_instances", instanceCount: items.length },
          "list_event_instances completed",
        );

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "list_event_instances",
              status: error.httpStatus,
              code: error.code,
            },
            "list_event_instances failed",
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
