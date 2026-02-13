import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { SearchUsersParams } from "../schemas/user.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:user-search");

function formatUserSearchResult(user: Record<string, unknown>): string {
  const name = String(user.displayName ?? "(no name)");
  const email = user.mail ? ` (${user.mail})` : "";
  const upn =
    user.userPrincipalName && user.userPrincipalName !== user.mail
      ? ` [${user.userPrincipalName}]`
      : "";
  const title = user.jobTitle ? ` - ${user.jobTitle}` : "";
  const dept = user.department ? ` [${user.department}]` : "";
  const location = user.officeLocation ? ` @ ${user.officeLocation}` : "";
  const id = String(user.id ?? "");
  return `${name}${email}${upn}${title}${dept}${location}\n  ID: ${id}`;
}

async function executeSearch(
  graphClient: Client,
  parsed: { query: string; top?: number; skip?: number },
  config: Config,
) {
  const sanitizedQuery = parsed.query.replace(/"/g, "");

  let request = graphClient.api("/users");
  request = request.header("ConsistencyLevel", "eventual");
  request = request.search(
    `"displayName:${sanitizedQuery}" OR "mail:${sanitizedQuery}" OR "userPrincipalName:${sanitizedQuery}"`,
  );
  request = request.select(buildSelectParam(DEFAULT_SELECT.user));
  request = request.top(parsed.top ?? config.limits.maxItems);
  if (parsed.skip) {
    request = request.skip(parsed.skip);
  }
  request = request.query({ $count: "true" });

  const response = (await request.get()) as Record<string, unknown>;

  if (!isRecordObject(response) || !Array.isArray(response.value)) {
    return { items: [], totalCount: 0 };
  }

  const items = response.value as Record<string, unknown>[];
  const totalCount =
    typeof response["@odata.count"] === "number" ? response["@odata.count"] : undefined;

  return { items, totalCount };
}

export function registerUserSearchTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "search_users",
    "Search for users in the directory by name, email, or job title. Supports partial matches and fuzzy search.",
    SearchUsersParams.shape,
    async (params) => {
      try {
        const parsed = SearchUsersParams.parse(params);
        const { items, totalCount } = await executeSearch(graphClient, parsed, config);

        const { items: shaped, paginationHint } = shapeListResponse(items, totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          shaped.length === 0
            ? `No users found matching "${parsed.query}".`
            : [...shaped.map(formatUserSearchResult), "", paginationHint].join("\n");

        logger.info({ tool: "search_users", count: shaped.length }, "search_users completed");
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
