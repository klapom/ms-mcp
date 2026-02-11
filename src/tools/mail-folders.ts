import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { ListMailFoldersParams } from "../schemas/mail.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { fetchPage } from "../utils/pagination.js";
import { DEFAULT_SELECT, buildSelectParam, shapeListResponse } from "../utils/response-shaper.js";

const logger = createLogger("tools:mail-folders");

export function registerMailFolderTools(
  server: McpServer,
  graphClient: Client,
  config: Config,
): void {
  server.tool(
    "list_mail_folders",
    "List all mail folders in the mailbox. Returns folder name, item counts, and unread counts. Well-known folder names (inbox, sentitems, drafts, deleteditems, junkemail, outbox, archive) can be used as folder IDs in other mail tools. Use include_children=true to also list subfolders (1 level deep).",
    ListMailFoldersParams.shape,
    async (params) => {
      try {
        const parsed = ListMailFoldersParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = `${userPath}/mailFolders`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.mailFolder),
        });

        // If include_children is true, fetch child folders for each folder
        let items = page.items;
        if (parsed.include_children) {
          items = await expandChildFolders(graphClient, userPath, items);
        }

        const { items: shaped, paginationHint } = shapeListResponse(items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const text = [
          ...shaped.map((folder) => formatFolderSummary(folder)),
          "",
          paginationHint,
        ].join("\n");

        logger.info(
          { tool: "list_mail_folders", folderCount: shaped.length },
          "list_mail_folders completed",
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

async function expandChildFolders(
  client: Client,
  userPath: string,
  folders: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const expanded: Record<string, unknown>[] = [];
  for (const folder of folders) {
    expanded.push(folder);
    const childCount = typeof folder.childFolderCount === "number" ? folder.childFolderCount : 0;
    if (childCount > 0 && typeof folder.id === "string") {
      try {
        const childPage = await fetchPage<Record<string, unknown>>(
          client,
          `${userPath}/mailFolders/${folder.id}/childFolders`,
          { select: buildSelectParam(DEFAULT_SELECT.mailFolder) },
        );
        for (const child of childPage.items) {
          expanded.push({
            ...child,
            _isChild: true,
            _parentName: folder.displayName,
          });
        }
      } catch {
        // Skip child folder fetch errors silently
        logger.warn({ folderId: folder.id }, "Failed to fetch child folders");
      }
    }
  }
  return expanded;
}

function formatFolderSummary(folder: Record<string, unknown>): string {
  const name = String(folder.displayName ?? "(unnamed)");
  const total = typeof folder.totalItemCount === "number" ? folder.totalItemCount : 0;
  const unread = typeof folder.unreadItemCount === "number" ? folder.unreadItemCount : 0;
  const children = typeof folder.childFolderCount === "number" ? folder.childFolderCount : 0;
  const id = String(folder.id ?? "");
  const isChild = folder._isChild === true;
  const indent = isChild ? "  " : "";
  const parentHint =
    isChild && typeof folder._parentName === "string" ? ` (in ${folder._parentName})` : "";

  let line = `${indent}${name}${parentHint}`;
  line += ` | ${total} items`;
  if (unread > 0) line += `, ${unread} unread`;
  if (children > 0) line += `, ${children} subfolders`;
  line += ` | ID: ${id}`;
  return line;
}
