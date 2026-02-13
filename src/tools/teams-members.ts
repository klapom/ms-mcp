import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { ListTeamMembersParams } from "../schemas/teams-members.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";

const logger = createLogger("tools:teams-members");

const MEMBER_SELECT = "id,displayName,email,roles,userId";

function getMemberRole(roles: unknown): string {
  if (Array.isArray(roles)) {
    if (roles.includes("owner")) return "Owner";
    if (roles.includes("guest")) return "Guest";
  }
  return "Member";
}

function formatMember(item: Record<string, unknown>): string {
  const name = String(item.displayName ?? "Unknown");
  const email = item.email ? ` (${String(item.email)})` : "";
  const role = getMemberRole(item.roles);
  return `${name}${email} - ${role}`;
}

function matchesRole(item: Record<string, unknown>, roleFilter: string): boolean {
  const role = getMemberRole(item.roles).toLowerCase();
  return role === roleFilter;
}

export function registerTeamsMembersTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "list_team_members",
    "List all members of a Teams team with their roles (owner, member, guest). Filter by role.",
    ListTeamMembersParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = ListTeamMembersParams.parse(params);
        const teamId = encodeGraphId(parsed.team_id);
        const url = `/teams/${teamId}/members`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? 25,
          skip: parsed.skip,
          select: MEMBER_SELECT,
        });

        // Client-side role filtering (Graph API doesn't support $filter on roles)
        let items = page.items;
        if (parsed.role !== "all") {
          items = items.filter((item) => matchesRole(item, parsed.role));
        }

        if (items.length === 0) {
          return { content: [{ type: "text", text: "No members found." }] };
        }

        const lines = items.map((item) => formatMember(item));
        const hint = page.hasMore
          ? `\nShowing ${items.length} members. Use skip: ${(parsed.skip ?? 0) + page.items.length} for the next page.`
          : `\nShowing ${items.length} members.`;

        logger.info(
          { tool: "list_team_members", count: items.length },
          "list_team_members completed",
        );

        return { content: [{ type: "text", text: lines.join("\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "list_team_members",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "list_team_members failed",
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
