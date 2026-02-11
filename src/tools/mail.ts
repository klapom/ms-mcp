import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { ListEmailsParams } from "../schemas/mail.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:mail");

export function registerMailTools(server: McpServer, graphClient: Client, config: Config): void {
  server.tool(
    "list_emails",
    "List emails from a mailbox folder with optional filtering, search and pagination. Returns email metadata (subject, from, date, preview) optimized for LLM context. Use folder parameter for specific folders (inbox, sentitems, drafts). Supports OData $filter for structured queries and KQL search for full-text search.",
    ListEmailsParams.shape,
    async (params) => {
      try {
        const parsed = ListEmailsParams.parse(params);

        const userPath = resolveUserPath(parsed.user_id);
        const folder = parsed.folder ?? "inbox";
        const url = `${userPath}/mailFolders/${folder}/messages`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.mail),
          filter: parsed.filter,
          orderby: parsed.orderby ?? "receivedDateTime desc",
        });

        const { items, paginationHint } = shapeListResponse(
          page.items,
          page.totalCount,
          {
            maxItems: parsed.top ?? config.limits.maxItems,
            maxBodyLength: config.limits.maxBodyLength,
          },
          ["bodyPreview"],
        );

        const text = [...items.map((email) => formatEmailSummary(email)), "", paginationHint].join(
          "\n",
        );

        logger.info(
          { tool: "list_emails", folder, itemCount: items.length },
          "list_emails completed",
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

function formatEmailSummary(email: Record<string, unknown>): string {
  const from = getFromAddress(email);
  const subject = String(email.subject ?? "(no subject)");
  const date = String(email.receivedDateTime ?? "");
  const preview = String(email.bodyPreview ?? "");
  const isRead = email.isRead === true;
  const importance = String(email.importance ?? "normal");

  const readIndicator = isRead ? " " : "[NEW]";
  const importanceIndicator = importance === "high" ? "[!]" : "";

  return `${readIndicator}${importanceIndicator} ${subject}\n  From: ${from} | ${date}\n  ${preview}`;
}

function getFromAddress(email: Record<string, unknown>): string {
  if (!isRecordObject(email.from)) return "(unknown)";
  if (!isRecordObject(email.from.emailAddress)) return "(unknown)";
  const name = typeof email.from.emailAddress.name === "string" ? email.from.emailAddress.name : "";
  const address =
    typeof email.from.emailAddress.address === "string" ? email.from.emailAddress.address : "";
  return name ? `${name} <${address}>` : address || "(unknown)";
}
