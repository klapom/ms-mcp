import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { WriteParams, resolveUserPath } from "../schemas/common.js";
import type { ToolResult } from "../types/tools.js";
import { formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:calendar-attach-email");

const AttachEmailToEventParams = WriteParams.extend({
  event_id: z.string().min(1).describe("ID of the calendar event to attach the email to."),
  email_id: z
    .string()
    .min(1)
    .describe(
      "ID of the email (message) to attach. Use search_emails or list_emails to get the ID.",
    ),
  name: z
    .string()
    .optional()
    .describe("Display name for the attachment. If omitted, uses the email subject."),
  calendar_id: z.string().optional().describe("Calendar ID (default: primary calendar)."),
});

type AttachEmailToEventParamsType = z.infer<typeof AttachEmailToEventParams>;

function formatFromAddress(from: unknown): string {
  const fromObj = from as Record<string, unknown> | undefined;
  const emailAddr = fromObj?.emailAddress as Record<string, unknown> | undefined;
  if (!emailAddr) return "(unknown)";
  return `${String(emailAddr.name ?? "")} <${String(emailAddr.address ?? "")}>`.trim();
}

function buildAttachPreview(
  parsed: AttachEmailToEventParamsType,
  subject: string,
  fromStr: string,
  displayName: string,
): ToolResult {
  const previewText = formatPreview("Attach email to calendar event", {
    "Event ID": parsed.event_id,
    "Email subject": subject,
    "Email from": fromStr,
    "Email ID": parsed.email_id,
    "Display name": displayName,
  });
  return { content: [{ type: "text" as const, text: previewText }] };
}

async function executeAttach(
  graphClient: Client,
  parsed: AttachEmailToEventParamsType,
  userPath: string,
  emailPath: string,
  displayName: string,
  subject: string,
  fromStr: string,
  startTime: number,
): Promise<ToolResult> {
  const fullEmail = (await graphClient.api(emailPath).get()) as Record<string, unknown>;
  if (!fullEmail["@odata.type"]) {
    fullEmail["@odata.type"] = "#microsoft.graph.message";
  }

  const calendarSegment = parsed.calendar_id
    ? `calendars/${encodeGraphId(parsed.calendar_id)}/events`
    : "events";
  const attachPath = `${userPath}/${calendarSegment}/${encodeGraphId(parsed.event_id)}/attachments`;

  const attachment = {
    "@odata.type": "#microsoft.graph.itemAttachment",
    name: displayName,
    item: fullEmail,
  };

  const result = (await graphClient.api(attachPath).post(attachment)) as Record<string, unknown>;

  logger.info(
    {
      tool: "attach_email_to_event",
      eventId: parsed.event_id,
      emailId: parsed.email_id,
      attachmentId: result.id,
      duration_ms: Date.now() - startTime,
    },
    "attach_email_to_event completed",
  );

  const toolResult: ToolResult = {
    content: [
      {
        type: "text" as const,
        text: `Email attached to event successfully.\n\nAttachment ID: ${String(result.id ?? "")}\nEmail: ${subject}\nFrom: ${fromStr}`,
      },
    ],
  };

  if (parsed.idempotency_key) {
    idempotencyCache.set(
      "attach_email_to_event",
      parsed.idempotency_key,
      toolResult,
      parsed.user_id,
    );
  }

  return toolResult;
}

export function registerCalendarAttachEmailTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "attach_email_to_event",
    "Attach an email as an embedded itemAttachment to a calendar event. Requires confirm=true to actually attach — without it, returns a preview. The email is embedded in full inside the event so it can be opened directly from Outlook. Use idempotency_key to prevent duplicates.",
    AttachEmailToEventParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = AttachEmailToEventParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const emailPath = `${userPath}/messages/${encodeGraphId(parsed.email_id)}`;

        const email = (await graphClient
          .api(emailPath)
          .select("id,subject,from,receivedDateTime")
          .get()) as Record<string, unknown>;

        const subject = typeof email.subject === "string" ? email.subject : "(no subject)";
        const displayName = parsed.name ?? subject;
        const fromStr = formatFromAddress(email.from);

        if (!parsed.confirm) {
          return buildAttachPreview(parsed, subject, fromStr, displayName);
        }

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "attach_email_to_event",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        return await executeAttach(
          graphClient,
          parsed,
          userPath,
          emailPath,
          displayName,
          subject,
          fromStr,
          startTime,
        );
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "attach_email_to_event", status: error.httpStatus, code: error.code },
            "attach_email_to_event failed",
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
