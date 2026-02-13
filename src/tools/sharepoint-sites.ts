import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { GetSiteParamsType } from "../schemas/sharepoint.js";
import { GetSiteParams, ListSiteDrivesParams, SearchSitesParams } from "../schemas/sharepoint.js";
import { McpToolError, ValidationError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam } from "../utils/response-shaper.js";

const logger = createLogger("tools:sharepoint-sites");

function formatSite(item: Record<string, unknown>): string {
  const name = String(item.displayName ?? "");
  const id = String(item.id ?? "");
  const desc = item.description ? ` — ${String(item.description)}` : "";
  const url = item.webUrl ? `\n  URL: ${String(item.webUrl)}` : "";
  return `${name}${desc}\n  ID: ${id}${url}`;
}

function formatDrive(item: Record<string, unknown>): string {
  const name = String(item.name ?? "");
  const id = String(item.id ?? "");
  const driveType = item.driveType ? ` [${String(item.driveType)}]` : "";
  const url = item.webUrl ? `\n  URL: ${String(item.webUrl)}` : "";
  return `${name}${driveType}\n  ID: ${id}${url}`;
}

function resolveSiteUrl(parsed: GetSiteParamsType): string {
  if (parsed.site_id && (parsed.hostname || parsed.site_path)) {
    throw new ValidationError(
      "site_id is mutually exclusive with hostname/site_path. Provide either site_id or hostname + site_path.",
    );
  }
  if (!parsed.site_id && !parsed.hostname) {
    throw new ValidationError("Provide either site_id or hostname (+ optional site_path).");
  }
  if (parsed.site_id) {
    return `/sites/${encodeGraphId(parsed.site_id)}`;
  }
  const host = parsed.hostname as string;
  const path = parsed.site_path ? `:${parsed.site_path}:` : "";
  return `/sites/${host}${path}`;
}

export function registerSharePointSiteTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "search_sites",
    "Search for SharePoint sites by name or content. Returns site name, description, and web URL.",
    SearchSitesParams.shape,
    async (params) => {
      try {
        const parsed = SearchSitesParams.parse(params);
        const url = "/sites";

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.site),
          query: { search: parsed.query },
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No sites found." }] };
        }

        const lines = page.items.map((item) => formatSite(item));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} sites. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} sites.`;

        logger.info({ tool: "search_sites", count: page.items.length }, "search_sites completed");

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "search_sites", status: error.httpStatus, code: error.code },
            "search_sites failed",
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
    "get_site",
    "Get details of a SharePoint site by ID or by hostname + site_path. Returns site name, description, ID, and web URL.",
    GetSiteParams.shape,
    async (params) => {
      try {
        const parsed = GetSiteParams.parse(params);
        const url = resolveSiteUrl(parsed);

        const site = (await graphClient
          .api(url)
          .select(buildSelectParam(DEFAULT_SELECT.siteDetail))
          .get()) as Record<string, unknown>;

        const lines = [
          `Name: ${String(site.displayName ?? "")}`,
          `ID: ${String(site.id ?? "")}`,
          site.description ? `Description: ${String(site.description)}` : null,
          `URL: ${String(site.webUrl ?? "")}`,
          `Created: ${String(site.createdDateTime ?? "")}`,
          `Modified: ${String(site.lastModifiedDateTime ?? "")}`,
        ]
          .filter(Boolean)
          .join("\n");

        logger.info({ tool: "get_site" }, "get_site completed");

        return { content: [{ type: "text", text: lines }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "get_site", status: error.httpStatus, code: error.code },
            "get_site failed",
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
    "list_site_drives",
    "List document libraries (drives) in a SharePoint site. Returns drive name, type, and web URL.",
    ListSiteDrivesParams.shape,
    async (params) => {
      try {
        const parsed = ListSiteDrivesParams.parse(params);
        const url = `/sites/${encodeGraphId(parsed.site_id)}/drives`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.siteDrive),
        });

        if (page.items.length === 0) {
          return { content: [{ type: "text", text: "No drives found." }] };
        }

        const lines = page.items.map((item) => formatDrive(item));
        const total = page.totalCount ?? page.items.length;
        const hint =
          page.items.length < total
            ? `\nShowing ${page.items.length} of ${total} drives. Use skip: ${page.items.length} for the next page.`
            : `\nShowing ${page.items.length} of ${total} drives.`;

        logger.info(
          { tool: "list_site_drives", count: page.items.length },
          "list_site_drives completed",
        );

        return { content: [{ type: "text", text: lines.join("\n\n") + hint }] };
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "list_site_drives", status: error.httpStatus, code: error.code },
            "list_site_drives failed",
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
