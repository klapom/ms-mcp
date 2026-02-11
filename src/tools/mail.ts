import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGraphClient } from "../auth/graph-client.js";
import type { MsalClient } from "../auth/msal-client.js";
import { loadConfig } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { ListEmailsParams } from "../schemas/mail.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";

const logger = createLogger("tools:mail");

export function registerMailTools(server: McpServer, msalClient: MsalClient): void {
  server.tool(
    "list_emails",
    "List emails from a mailbox folder with optional filtering, search and pagination. Returns email metadata (subject, from, date, preview) optimized for LLM context. Use folder parameter for specific folders (inbox, sentitems, drafts). Supports OData $filter for structured queries and KQL search for full-text search.",
    ListEmailsParams.shape,
    async (params) => {
      try {
        const parsed = ListEmailsParams.parse(params);
        const config = loadConfig();
        const client = getGraphClient(msalClient);

        const userPath = resolveUserPath(parsed.user_id);
        const folder = parsed.folder ?? "inbox";
        const url = `${userPath}/mailFolders/${folder}/messages`;

        const page = await fetchPage<Record<string, unknown>>(client, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.mail),
          filter: parsed.filter,
          orderby: parsed.orderby ?? "receivedDateTime desc",
        });

        const { items, paginationHint } = shapeListResponse(
          page.items,
          page.totalCount,
          { maxItems: parsed.top ?? config.limits.maxItems },
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
  const from = email.from as Record<string, unknown> | undefined;
  if (!from) return "(unknown)";
  const addr = from.emailAddress as Record<string, unknown> | undefined;
  if (!addr) return "(unknown)";
  const name = addr.name ? String(addr.name) : "";
  const address = addr.address ? String(addr.address) : "";
  return name ? `${name} <${address}>` : address;
}
