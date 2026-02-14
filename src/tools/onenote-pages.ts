import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { GetPageContentParams, ListPagesParams } from "../schemas/onenote.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { convertHtmlToText } from "../utils/html-convert.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:onenote-pages");

/** Default fields for list_pages response */
const DEFAULT_SELECT_PAGES = [
  "id",
  "title",
  "createdDateTime",
  "lastModifiedDateTime",
  "contentUrl",
  "level",
];

/** Maximum content length for get_page_content (10,000 chars) */
const GET_PAGE_CONTENT_MAX_LENGTH = 10000;

/**
 * Formats a single page summary for list_pages output
 */
function formatPageSummary(page: Record<string, unknown>): string {
  const title = String(page.title ?? "(untitled)");
  const id = String(page.id ?? "");
  const createdDateTime = String(page.createdDateTime ?? "");
  const lastModifiedDateTime = String(page.lastModifiedDateTime ?? "");
  const level = page.level ?? 0;

  return [
    `Page: ${title}`,
    `ID: ${id}`,
    `Created: ${createdDateTime}`,
    `Modified: ${lastModifiedDateTime}`,
    `Level: ${level}`,
  ].join("\n");
}

/**
 * Formats page content detail for get_page_content output
 */
function formatPageDetail(page: Record<string, unknown>, content: string): string {
  const title = String(page.title ?? "(untitled)");
  const createdDateTime = String(page.createdDateTime ?? "");
  const lastModifiedDateTime = String(page.lastModifiedDateTime ?? "");

  const lines: string[] = [
    `# ${title}`,
    `Created: ${createdDateTime}`,
    `Modified: ${lastModifiedDateTime}`,
    "",
  ];

  lines.push(content);

  if (content.length >= GET_PAGE_CONTENT_MAX_LENGTH) {
    lines.push("", "(Content truncated at 10,000 characters)");
  }

  return lines.join("\n");
}

export function registerOneNotePagesTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  /**
   * list_pages: List pages in a section
   */
  server.tool(
    "list_pages",
    "List pages in a OneNote section. Returns page ID, title, created/modified dates, and hierarchy level. Use section_id from list_sections tool.",
    ListPagesParams.shape,
    async (params) => {
      try {
        const parsed = ListPagesParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/onenote/sections/${encodeGraphId(parsed.section_id)}/pages`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT_PAGES),
        });

        const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text =
          items.length === 0
            ? "No pages found in this section."
            : [...items.map((p) => formatPageSummary(p)), "", paginationHint].join("\n");

        logger.info(
          { tool: "list_pages", sectionId: parsed.section_id, pageCount: items.length },
          "list_pages completed",
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

  /**
   * get_page_content: Get the full HTML content of a page and convert to plain text
   */
  server.tool(
    "get_page_content",
    "Get the full content of a OneNote page. Returns page title, metadata, and content converted to plain text. Content is limited to 10,000 characters. Note: include_images is reserved for future use.",
    GetPageContentParams.shape,
    async (params) => {
      try {
        const parsed = GetPageContentParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        // Fetch page metadata first
        const pageUrl = `${userPath}/onenote/pages/${encodeGraphId(parsed.page_id)}`;
        const pageMetadata = (await graphClient
          .api(pageUrl)
          .select(buildSelectParam(["id", "title", "createdDateTime", "lastModifiedDateTime"]))
          .get()) as Record<string, unknown>;

        // Fetch page content as HTML
        const contentUrl = `${userPath}/onenote/pages/${encodeGraphId(parsed.page_id)}/content`;
        const contentResponse = await graphClient
          .api(contentUrl)
          .header("Accept", "text/html")
          .get();

        // The content is returned as a string containing HTML
        let htmlContent = "";
        if (typeof contentResponse === "string") {
          htmlContent = contentResponse;
        } else if (isRecordObject(contentResponse) && typeof contentResponse.value === "string") {
          htmlContent = contentResponse.value;
        }

        // Convert HTML to plain text
        const plainText = convertHtmlToText(htmlContent, GET_PAGE_CONTENT_MAX_LENGTH);

        const text = formatPageDetail(pageMetadata, plainText);

        logger.info(
          { tool: "get_page_content", pageId: parsed.page_id, contentLength: plainText.length },
          "get_page_content completed",
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
