import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { ListMailFoldersParams } from "../schemas/mail.js";
import { batchFetchSettled } from "../utils/batch.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
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
    "List mail folders. Without parent_folder_id: lists all top-level folders. " +
      "With parent_folder_id: lists direct subfolders of that folder (use this to explore nested folders like Inbox subfolders). " +
      "Well-known names for parent_folder_id: inbox, sentitems, drafts, deleteditems, junkemail, archive. " +
      "Use include_children=true (only without parent_folder_id) to expand one level of subfolders for each top-level folder.",
    ListMailFoldersParams.shape,
    async (params) => {
      try {
        const parsed = ListMailFoldersParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        // If parent_folder_id is given, directly list that folder's children
        const url = parsed.parent_folder_id
          ? `${userPath}/mailFolders/${encodeGraphId(parsed.parent_folder_id)}/childFolders`
          : `${userPath}/mailFolders`;

        const page = await fetchPage<Record<string, unknown>>(graphClient, url, {
          top: parsed.top ?? config.limits.maxItems,
          skip: parsed.skip,
          select: buildSelectParam(DEFAULT_SELECT.mailFolder),
        });

        // include_children only applies when listing top-level folders
        let items = page.items;
        let failedCount = 0;
        if (!parsed.parent_folder_id && parsed.include_children) {
          const result = await expandChildFolders(graphClient, userPath, items);
          items = result.expanded;
          failedCount = result.failedCount;
        }

        const { items: shaped, paginationHint } = shapeListResponse(items, page.totalCount, {
          maxItems: parsed.top ?? config.limits.maxItems,
          maxBodyLength: config.limits.maxBodyLength,
        });

        const lines = [...shaped.map((folder) => formatFolderSummary(folder)), "", paginationHint];
        if (parsed.include_children && failedCount > 0) {
          lines.push(
            `Hinweis: Unterordner von ${failedCount} Ordner(n) konnten nicht geladen werden (fehlende Berechtigung?).`,
          );
        }
        const text = lines.join("\n");

        logger.info(
          {
            tool: "list_mail_folders",
            folderCount: shaped.length,
            parentFolderId: parsed.parent_folder_id,
          },
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
): Promise<{ expanded: Record<string, unknown>[]; failedCount: number }> {
  // Identify folders that have children
  const foldersWithChildren = folders.filter(
    (f) =>
      typeof f.childFolderCount === "number" && f.childFolderCount > 0 && typeof f.id === "string",
  );

  // Fetch all child folders in parallel with graceful error handling
  // Use top=100 to ensure ALL child folders are fetched in one request —
  // the default Graph API page size for childFolders is 10, which caused
  // subfolders beyond the first 10 to silently disappear.
  const { results, failedCount } = await batchFetchSettled(
    foldersWithChildren.map((folder) =>
      fetchPage<Record<string, unknown>>(
        client,
        `${userPath}/mailFolders/${encodeGraphId(folder.id as string)}/childFolders`,
        { select: buildSelectParam(DEFAULT_SELECT.mailFolder), top: 100 },
      ).then((page) => ({
        parentId: folder.id as string,
        parentName: folder.displayName,
        children: page.items,
      })),
    ),
    logger,
    "expandChildFolders",
  );

  // Build a map of parentId -> children
  const childMap = new Map<string, Record<string, unknown>[]>();
  for (const result of results) {
    childMap.set(
      result.parentId,
      result.children.map((child) => ({
        ...child,
        _isChild: true,
        _parentName: result.parentName,
      })),
    );
  }

  // Build expanded list maintaining order
  const expanded: Record<string, unknown>[] = [];
  for (const folder of folders) {
    expanded.push(folder);
    if (typeof folder.id === "string") {
      const children = childMap.get(folder.id);
      if (children) {
        expanded.push(...children);
      }
    }
  }

  return { expanded, failedCount };
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
