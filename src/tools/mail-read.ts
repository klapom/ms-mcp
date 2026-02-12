import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { ReadEmailParams } from "../schemas/mail.js";
import { extractAddress, extractAddressListFiltered } from "../utils/address-format.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { convertHtmlToText } from "../utils/html-convert.js";
import { createLogger } from "../utils/logger.js";
import { DEFAULT_SELECT, buildSelectParam, truncateBody } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:mail-read");

/** Default body length for read_email (higher than list_emails, optimized for full content). */
const READ_EMAIL_DEFAULT_BODY_LENGTH = 5000;

/**
 * Extracts and processes the email body from a Graph API response.
 * Converts HTML to plain text when format is "text", and truncates to maxLen.
 */
function extractBody(
  response: Record<string, unknown>,
  format: "text" | "html",
  maxLen: number,
): string {
  if (!isRecordObject(response.body)) {
    return "";
  }

  const rawContent = typeof response.body.content === "string" ? response.body.content : "";
  const contentType =
    typeof response.body.contentType === "string" ? response.body.contentType : "text";

  if (format === "text" && contentType.toLowerCase() === "html") {
    return convertHtmlToText(rawContent, maxLen);
  }
  return truncateBody(rawContent, maxLen);
}

/**
 * Formats internet message headers as text lines.
 */
function formatInternetHeaders(headers: unknown[]): string[] {
  const lines: string[] = ["", "--- Internet Headers ---"];
  for (const header of headers) {
    if (
      isRecordObject(header) &&
      typeof header.name === "string" &&
      typeof header.value === "string"
    ) {
      lines.push(`${header.name}: ${header.value}`);
    }
  }
  return lines;
}

export function registerMailReadTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "read_email",
    "Read a single email by ID with full body content and metadata. Returns subject, from, to, cc, bcc, body (text or HTML), dates, and conversation context. Use format='text' (default) for LLM-optimized plain text, or format='html' for original HTML.",
    ReadEmailParams.shape,
    async (params) => {
      try {
        const parsed = ReadEmailParams.parse(params);
        const response = await fetchEmail(graphClient, parsed);

        if (!isRecordObject(response)) {
          return {
            content: [
              { type: "text" as const, text: "Unexpected response format from Graph API." },
            ],
            isError: true,
          };
        }

        const maxLen = parsed.max_body_length ?? READ_EMAIL_DEFAULT_BODY_LENGTH;
        const bodyContent = extractBody(response, parsed.format, maxLen);
        const text = formatEmailDetail(response, bodyContent, parsed.include_internet_headers);

        logger.info(
          { tool: "read_email", messageId: parsed.message_id, format: parsed.format },
          "read_email completed",
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

/**
 * Fetches a single email from the Graph API.
 */
async function fetchEmail(
  graphClient: Client,
  parsed: { user_id?: string; message_id: string; include_internet_headers: boolean },
): Promise<unknown> {
  const userPath = resolveUserPath(parsed.user_id);
  const url = `${userPath}/messages/${encodeGraphId(parsed.message_id)}`;

  const selectFields = [...DEFAULT_SELECT.mailDetail];
  if (parsed.include_internet_headers) {
    selectFields.push("internetMessageHeaders");
  }

  return graphClient.api(url).select(buildSelectParam(selectFields)).get();
}

function formatEmailDetail(
  email: Record<string, unknown>,
  bodyContent: string,
  includeHeaders: boolean,
): string {
  const subject = String(email.subject ?? "(no subject)");
  const from = extractAddress(email.from);
  const to = extractAddressListFiltered(email.toRecipients);
  const cc = extractAddressListFiltered(email.ccRecipients);
  const bcc = extractAddressListFiltered(email.bccRecipients);
  const date = String(email.receivedDateTime ?? "");
  const sentDate = String(email.sentDateTime ?? "");
  const importance = String(email.importance ?? "normal");
  const isRead = email.isRead === true ? "Ja" : "Nein";
  const hasAttachments = email.hasAttachments === true ? "Ja" : "Nein";
  const conversationId = typeof email.conversationId === "string" ? email.conversationId : "";

  const lines: string[] = [`Subject: ${subject}`, `From: ${from}`, `To: ${to}`];

  if (cc) lines.push(`CC: ${cc}`);
  if (bcc) lines.push(`BCC: ${bcc}`);

  lines.push(
    `Date: ${date}`,
    `Sent: ${sentDate}`,
    `Importance: ${importance}`,
    `Read: ${isRead}`,
    `Attachments: ${hasAttachments}`,
    `Conversation-ID: ${conversationId}`,
  );

  if (includeHeaders && Array.isArray(email.internetMessageHeaders)) {
    lines.push(...formatInternetHeaders(email.internetMessageHeaders));
  }

  lines.push("", "--- Body ---", bodyContent);

  return lines.join("\n");
}
