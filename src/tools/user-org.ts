import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { ListDirectReportsParams, ListUserGroupsParams } from "../schemas/user.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";

const logger = createLogger("tools:user-org");

function formatUserSummary(user: Record<string, unknown>): string {
  const name = String(user.displayName ?? "(no name)");
  const email = user.mail ? ` (${user.mail})` : "";
  const title = user.jobTitle ? ` - ${user.jobTitle}` : "";
  const dept = user.department ? ` [${user.department}]` : "";
  const id = String(user.id ?? "");
  return `${name}${email}${title}${dept}\n  ID: ${id}`;
}

function formatGroupSummary(group: Record<string, unknown>): string {
  const name = String(group.displayName ?? "(no name)");
  const desc = group.description ? ` - ${group.description}` : "";
  const email = group.mail ? ` (${group.mail})` : "";
  const type: string[] = [];
  if (group.mailEnabled === true) type.push("Mail-enabled");
  if (group.securityEnabled === true) type.push("Security");
  const typeStr = type.length > 0 ? ` [${type.join(", ")}]` : "";
  const id = String(group.id ?? "");
  return `${name}${desc}${email}${typeStr}\n  ID: ${id}`;
}

export function registerUserOrgTools(server: McpServer, graphClient: Client, config: Config): void {
  server.tool(
    "list_direct_reports",
    "List the direct reports (team members) of a user. Shows name, email, job title, and department for each person.",
    ListDirectReportsParams.shape,
    async (params) => {
      try {
        const parsed = ListDirectReportsParams.parse(params);
        const basePath = parsed.user_id
          ? `/users/${encodeGraphId(parsed.user_id)}`
          : resolveUserPath(undefined);
        const url = `${basePath}/directReports`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.user),
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No direct reports found."
            : [...items.map(formatUserSummary), "", paginationHint].join("\n");

        logger.info(
          { tool: "list_direct_reports", count: items.length },
          "list_direct_reports completed",
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

  server.tool(
    "list_user_groups",
    "List the groups and directory roles that a user is a member of. Shows group name, description, and type (mail-enabled, security).",
    ListUserGroupsParams.shape,
    async (params) => {
      try {
        const parsed = ListUserGroupsParams.parse(params);
        const basePath = parsed.user_id
          ? `/users/${encodeGraphId(parsed.user_id)}`
          : resolveUserPath(undefined);
        const url = `${basePath}/memberOf`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.group),
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No group memberships found."
            : [...items.map(formatGroupSummary), "", paginationHint].join("\n");

        logger.info(
          { tool: "list_user_groups", count: items.length },
          "list_user_groups completed",
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
