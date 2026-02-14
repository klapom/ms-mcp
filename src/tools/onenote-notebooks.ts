import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { ListNotebooksParams } from "../schemas/onenote.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:onenote-notebooks");

const DEFAULT_SELECT = [
  "id",
  "displayName",
  "createdDateTime",
  "lastModifiedDateTime",
  "sectionsUrl",
];

function formatNotebookSummary(n: Record<string, unknown>): string {
  const name = String(n.displayName ?? "(unnamed)");
  const created = String(n.createdDateTime ?? "");
  const modified = String(n.lastModifiedDateTime ?? "");
  const sectionsUrl = String(n.sectionsUrl ?? "");
  const id = String(n.id ?? "");

  const lines: string[] = [
    `Notebook: ${name}`,
    `ID: ${id}`,
    `Created: ${created}`,
    `Modified: ${modified}`,
    `Sections URL: ${sectionsUrl}`,
  ];

  return lines.join("\n");
}

async function handleListNotebooks(
  graphClient: Client,
  parsed: {
    user_id?: string;
    top?: number;
    skip?: number;
  },
  config: Config,
): Promise<string> {
  const url = "/me/onenote/notebooks";

  const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
    top: parsed.top ?? config.limits.maxItems,
    skip: parsed.skip,
    select: buildSelectParam(DEFAULT_SELECT),
  });

  const { items, paginationHint } = shapeListResponse(page.items, page.totalCount, {
    maxItems: parsed.top ?? config.limits.maxItems,
    maxBodyLength: config.limits.maxBodyLength,
  });

  if (items.length === 0) {
    return "No notebooks found.";
  }

  const notebookTexts = items.filter(isRecordObject).map(formatNotebookSummary).join("\n\n");

  return [notebookTexts, "", paginationHint].join("\n");
}

export function registerOneNoteNotebooksTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_notebooks",
    "List OneNote notebooks for the user. Returns notebook name, ID, creation date, modification date, and sections URL.",
    ListNotebooksParams.shape,
    async (params) => {
      try {
        const parsed = ListNotebooksParams.parse(params);
        const text = await handleListNotebooks(graphClient, parsed, config);

        logger.info(
          { tool: "list_notebooks", top: parsed.top, skip: parsed.skip },
          "list_notebooks completed",
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
