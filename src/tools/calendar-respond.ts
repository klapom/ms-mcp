import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { RespondToEventParamsType } from "../schemas/calendar-write.js";
import { RespondToEventParams } from "../schemas/calendar-write.js";
import { resolveUserPath } from "../schemas/common.js";
import type { ToolResult } from "../types/tools.js";
import { formatDateTimeRange } from "../utils/calendar-format.js";
import { formatPreview } from "../utils/confirmation.js";
import { McpToolError, ValidationError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";

const logger = createLogger("tools:calendar-respond");

const ACTION_LABELS: Record<string, string> = {
  accept: "Zusagen",
  decline: "Absagen",
  tentativelyAccept: "Vorläufig zusagen",
};

async function buildRespondPreview(
  graphClient: Client,
  parsed: RespondToEventParamsType,
  userPath: string,
): Promise<ToolResult> {
  const url = parsed.calendar_id
    ? `${userPath}/calendars/${encodeGraphId(parsed.calendar_id)}/events/${encodeGraphId(parsed.event_id)}`
    : `${userPath}/events/${encodeGraphId(parsed.event_id)}`;

  const event = (await graphClient
    .api(url)
    .select(buildSelectParam(DEFAULT_SELECT.event.concat("isOrganizer")))
    .get()) as Record<string, unknown>;

  if (event.isOrganizer === true) {
    throw new ValidationError("Sie sind der Organisator dieses Events und können nicht antworten.");
  }

  const subject = String(event.subject ?? "(kein Betreff)");
  const isAllDay = event.isAllDay === true;
  const dateRange = formatDateTimeRange(event.start, event.end, isAllDay);

  const previewText = formatPreview("Auf Event antworten", {
    Betreff: subject,
    Zeit: dateRange,
    Aktion: ACTION_LABELS[parsed.action] ?? parsed.action,
    Kommentar: parsed.comment,
    "Antwort senden": parsed.send_response ? "Ja" : "Nein",
  });

  return { content: [{ type: "text", text: previewText }] };
}

async function executeRespond(
  graphClient: Client,
  parsed: RespondToEventParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  const eventUrl = parsed.calendar_id
    ? `${userPath}/calendars/${encodeGraphId(parsed.calendar_id)}/events/${encodeGraphId(parsed.event_id)}`
    : `${userPath}/events/${encodeGraphId(parsed.event_id)}`;

  const requestBody: Record<string, unknown> = {
    sendResponse: parsed.send_response,
  };
  if (parsed.comment) {
    requestBody.comment = parsed.comment;
  }

  await graphClient.api(`${eventUrl}/${parsed.action}`).post(requestBody);

  const endTime = Date.now();
  logger.info(
    {
      tool: "respond_to_event",
      action: parsed.action,
      status: 202,
      duration_ms: endTime - startTime,
    },
    "respond_to_event completed",
  );

  const actionLabel = ACTION_LABELS[parsed.action] ?? parsed.action;
  return {
    content: [
      {
        type: "text",
        text: `Antwort erfolgreich gesendet: ${actionLabel}\n\nEvent-ID: ${parsed.event_id}\nZeitstempel: ${new Date(endTime).toISOString()}`,
      },
    ],
  };
}

export function registerCalendarRespondTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "respond_to_event",
    "Respond to a calendar event invitation (accept, decline, or tentativelyAccept). Requires confirm=true to actually respond — without it, fetches the event and returns a preview. Errors if you are the organizer. Use idempotency_key to prevent duplicate responses.",
    RespondToEventParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = RespondToEventParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        if (!parsed.confirm) {
          return await buildRespondPreview(graphClient, parsed, userPath);
        }

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "respond_to_event",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeRespond(graphClient, parsed, userPath, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("respond_to_event", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "respond_to_event",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "respond_to_event failed",
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
