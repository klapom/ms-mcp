import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { ListListItemsParams, ListSiteListsParams } from "../schemas/sharepoint.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";

const logger = createLogger("tools:sharepoint-lists");

function formatList(item: Record<string, unknown>): string {
  const name = String(item.displayName ?? "");
  const id = String(item.id ?? "");
  const desc = item.description ? ` — ${String(item.description)}` : "";
  const url = item.webUrl ? `\n  URL: ${String(item.webUrl)}` : "";
  return `${name}${desc}\n  ID: ${id}${url}`;
}

function formatListItem(item: Record<string, unknown>, index: number): string {
  const id = String(item.id ?? "");
  const fields = item.fields as Record<string, unknown> | undefined;
  if (!fields) return `[${index + 1}] ID: ${id} (no fields)`;

  const fieldLines = Object.entries(fields)
    .filter(([key]) => !key.startsWith("@odata"))
    .map(([key, value]) => `  ${key}: ${String(value ?? "")}`)
    .join("\n");
  return `[${index + 1}] ID: ${id}\n${fieldLines}`;
}

export function registerSharePointListTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_site_lists",
    "List SharePoint lists in a site. Use include_hidden=true to show hidden lists. Returns list name, description, and web URL.",
    ListSiteListsParams.shape,
    async (params) => {
      try {
        const parsed = ListSiteListsParams.parse(params);
        const siteId = encodeGraphId(parsed.site_id);
        const url = `/sites/${siteId}/lists`;

        const filter = parsed.include_hidden ? undefined : "list/hidden eq false";

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: "id,displayName,description,webUrl,list",
          filter,
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No lists found." }] };
        }

        const lines = page.items.map((item) => formatList(item));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} lists. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} lists.`;

        logger.info(
          { tool: "list_site_lists", count: page.items.length },
          "list_site_lists completed",
        );

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "list_site_lists", status: error.httpStatus, code: error.code },
            "list_site_lists failed",
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
    "list_list_items",
    "List items in a SharePoint list. Requires $expand=fields (done automatically). Supports OData $filter and $orderby. Returns item ID and all field values.",
    ListListItemsParams.shape,
    async (params) => {
      try {
        const parsed = ListListItemsParams.parse(params);
        const siteId = encodeGraphId(parsed.site_id);
        const listId = encodeGraphId(parsed.list_id);
        const url = `/sites/${siteId}/lists/${listId}/items`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          filter: parsed.filter,
          orderby: parsed.orderby,
          query: { $expand: "fields" },
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No items found." }] };
        }

        const lines = page.items.map((item, i) => formatListItem(item, i));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} items. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} items.`;

        logger.info(
          { tool: "list_list_items", count: page.items.length },
          "list_list_items completed",
        );

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "list_list_items", status: error.httpStatus, code: error.code },
            "list_list_items failed",
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
