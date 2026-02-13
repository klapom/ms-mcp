import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { ListChannelsParams, ListTeamsParams } from "../schemas/teams.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";

const logger = createLogger("tools:teams-list");

function formatTeam(item: Record<string, unknown>): string {
  const name = String(item.displayName ?? "");
  const id = String(item.id ?? "");
  const desc = item.description ? ` — ${String(item.description)}` : "";
  const archived = item.isArchived ? " [Archived]" : "";
  const url = item.webUrl ? `\n  URL: ${String(item.webUrl)}` : "";
  return `${name}${archived}${desc}\n  ID: ${id}${url}`;
}

function formatChannel(item: Record<string, unknown>): string {
  const name = String(item.displayName ?? "");
  const id = String(item.id ?? "");
  const desc = item.description ? ` — ${String(item.description)}` : "";
  const membership = item.membershipType ? ` [${String(item.membershipType)}]` : "";
  const url = item.webUrl ? `\n  URL: ${String(item.webUrl)}` : "";
  return `${name}${membership}${desc}\n  ID: ${id}${url}`;
}

export function registerTeamsListTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_teams",
    "List all teams the current user is a member of. Returns team name, description, archive status, and web URL.",
    ListTeamsParams.shape,
    async (params) => {
      try {
        const parsed = ListTeamsParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/joinedTeams`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.team),
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No teams found." }] };
        }

        const lines = page.items.map((item) => formatTeam(item));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} teams. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} teams.`;

        logger.info({ tool: "list_teams", count: page.items.length }, "list_teams completed");

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "list_teams", status: error.httpStatus, code: error.code },
            "list_teams failed",
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

  server.tool(
    "list_channels",
    "List channels in a team. Returns channel name, description, membership type, and web URL.",
    ListChannelsParams.shape,
    async (params) => {
      try {
        const parsed = ListChannelsParams.parse(params);
        const url = `/teams/${encodeGraphId(parsed.team_id)}/channels`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.channel),
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No channels found." }] };
        }

        const lines = page.items.map((item) => formatChannel(item));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} channels. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} channels.`;

        logger.info({ tool: "list_channels", count: page.items.length }, "list_channels completed");

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "list_channels", status: error.httpStatus, code: error.code },
            "list_channels failed",
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
