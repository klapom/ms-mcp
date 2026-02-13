import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { ListMailRulesParams } from "../schemas/mail-extensions.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";

const logger = createLogger("tools:mail-rules-list");

function formatConditions(conditions: Record<string, unknown>): string[] {
  const condParts: string[] = [];

  if (Array.isArray(conditions.fromAddresses) && conditions.fromAddresses.length > 0) {
    condParts.push(`From: ${conditions.fromAddresses.length} addresses`);
  }
  if (
    Array.isArray(conditions.subjectContains) &&
    (conditions.subjectContains as string[]).length > 0
  ) {
    condParts.push(
      `Subject contains: ${(conditions.subjectContains as string[]).slice(0, 2).join(", ")}`,
    );
  }
  if (conditions.importance) {
    condParts.push(`Importance: ${conditions.importance}`);
  }

  return condParts;
}

function formatActions(actions: Record<string, unknown>): string[] {
  const actionParts: string[] = [];

  if (actions.moveToFolder) {
    actionParts.push("Move to folder");
  }
  if (actions.delete === true) {
    actionParts.push("Delete");
  }
  if (actions.markAsRead === true) {
    actionParts.push("Mark as read");
  }
  if (actions.forwardTo && Array.isArray(actions.forwardTo)) {
    actionParts.push(`Forward to ${(actions.forwardTo as unknown[]).length} recipients`);
  }

  return actionParts;
}

function formatMailRule(rule: Record<string, unknown>): string {
  const name = String(rule.displayName ?? "(unnamed rule)");
  const sequence = typeof rule.sequence === "number" ? ` [Priority: ${rule.sequence}]` : "";
  const enabled = rule.isEnabled === true ? "✓" : "✗";
  const hasError = rule.hasError === true ? " ⚠️ Error" : "";
  const id = String(rule.id ?? "");

  const lines = [`${enabled} ${name}${sequence}${hasError}`, `   ID: ${id}`];

  // Show conditions summary
  if (typeof rule.conditions === "object" && rule.conditions !== null) {
    const condParts = formatConditions(rule.conditions as Record<string, unknown>);
    if (condParts.length > 0) {
      lines.push(`   Conditions: ${condParts.join(" | ")}`);
    }
  }

  // Show actions summary
  if (typeof rule.actions === "object" && rule.actions !== null) {
    const actionParts = formatActions(rule.actions as Record<string, unknown>);
    if (actionParts.length > 0) {
      lines.push(`   Actions: ${actionParts.join(", ")}`);
    }
  }

  return lines.join("\n");
}

export function registerMailRulesListTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_mail_rules",
    "List inbox message rules (read-only). Rules automatically process incoming messages based on conditions and actions.",
    ListMailRulesParams.shape,
    async (params) => {
      try {
        const parsed = ListMailRulesParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/mailFolders/inbox/messageRules`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.mailRule),
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No mail rules found."
            : [...items.map(formatMailRule), "", paginationHint].join("\n");

        logger.info({ tool: "list_mail_rules", count: items.length }, "Mail rules listed");

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
