import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { ListCalendarsParams } from "../schemas/calendar.js";
import { resolveUserPath } from "../schemas/common.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";
import { getUserTimezone } from "../utils/user-settings.js";

const logger = createLogger("tools:calendar-list");

export function registerCalendarListTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_calendars",
    "List all calendars of the user. Returns calendar name, owner, color, and permissions. The default calendar is marked. Calendar IDs can be used in other calendar tools to target a specific calendar.",
    ListCalendarsParams.shape,
    async (params) => {
      try {
        const parsed = ListCalendarsParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/calendars`;
        const tz = await getUserTimezone(graphClient);

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.calendar),
          headers: { Prefer: `outlook.timezone="${tz}"` },
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No calendars found."
            : [...items.map((cal) => formatCalendarSummary(cal)), "", paginationHint].join("\n");

        logger.info(
          { tool: "list_calendars", calendarCount: items.length },
          "list_calendars completed",
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

function formatCalendarSummary(cal: Record<string, unknown>): string {
  const name = String(cal.name ?? "(unnamed)");
  const isDefault = cal.isDefaultCalendar === true;
  const canEdit = cal.canEdit === true;
  const color =
    typeof cal.hexColor === "string" && cal.hexColor ? cal.hexColor : String(cal.color ?? "auto");
  const id = String(cal.id ?? "");

  const ownerStr = getOwnerAddress(cal.owner);
  const defaultMarker = isDefault ? " (default)" : "";
  const editMarker = canEdit ? "canEdit" : "readOnly";

  return `${name}${defaultMarker} | Owner: ${ownerStr} | ${editMarker} | Color: ${color} | ID: ${id}`;
}

function getOwnerAddress(owner: unknown): string {
  if (!isRecordObject(owner)) return "(unknown)";
  const address = typeof owner.address === "string" ? owner.address : "";
  const name = typeof owner.name === "string" ? owner.name : "";
  return name ? `${name} <${address}>` : address || "(unknown)";
}
