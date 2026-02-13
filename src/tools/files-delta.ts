import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { TrackFileChangesParams } from "../schemas/files-delta.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { formatFileSize } from "../utils/file-size.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";
import { isRecordObject } from "../utils/type-guards.js";

const logger = createLogger("tools:files-delta");

interface DeltaItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  deleted?: boolean;
}

function parseDeltaResponse(response: unknown): {
  items: DeltaItem[];
  deltaLink: string | undefined;
} {
  if (!isRecordObject(response)) {
    return { items: [], deltaLink: undefined };
  }

  const value = Array.isArray(response.value) ? response.value : [];
  const deltaLink =
    typeof response["@odata.deltaLink"] === "string" ? response["@odata.deltaLink"] : undefined;

  const items: DeltaItem[] = (value as Record<string, unknown>[]).map((item) => ({
    id: String(item.id ?? ""),
    name: String(item.name ?? ""),
    size: typeof item.size === "number" ? item.size : undefined,
    lastModifiedDateTime:
      typeof item.lastModifiedDateTime === "string" ? item.lastModifiedDateTime : undefined,
    deleted: isRecordObject(item.deleted),
  }));

  return { items, deltaLink };
}

function extractDeltaToken(deltaLink: string): string | undefined {
  try {
    const url = new URL(deltaLink);
    return url.searchParams.get("token") ?? undefined;
  } catch {
    return undefined;
  }
}

function formatDeltaItem(item: DeltaItem, hasToken: boolean): string {
  if (item.deleted) {
    return `[Deleted] ${item.name}\n  ID: ${item.id}`;
  }

  const sizeStr = item.size !== undefined ? formatFileSize(item.size) : "";
  const dateStr = item.lastModifiedDateTime ?? "";
  const prefix = hasToken ? "[Modified]" : "[Added]";
  return `${prefix} ${item.name} | ${sizeStr} | ${dateStr}\n  ID: ${item.id}`;
}

function buildDeltaUrl(
  userPath: string,
  folderId: string | undefined,
  deltaToken: string | undefined,
): string {
  const basePath = folderId
    ? `${userPath}/drive/items/${encodeGraphId(folderId)}/delta`
    : `${userPath}/drive/root/delta`;

  return deltaToken ? `${basePath}?token=${encodeURIComponent(deltaToken)}` : basePath;
}

function buildDeltaOutput(
  items: DeltaItem[],
  hasToken: boolean,
  deltaToken: string | undefined,
): string[] {
  const lines: string[] = [];

  if (items.length === 0) {
    lines.push(hasToken ? "No changes since last sync." : "No files found.");
  } else {
    const header = hasToken
      ? `${items.length} change(s) since last sync:\n`
      : `${items.length} item(s) in initial sync:\n`;
    lines.push(header);
    for (const item of items) {
      lines.push(formatDeltaItem(item, hasToken));
    }
  }

  if (deltaToken) {
    lines.push(`\ndelta_token: ${deltaToken}`);
    lines.push("Use this token in your next request for incremental sync.");
  }

  return lines;
}

export function registerFilesDeltaTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "track_file_changes",
    "Track OneDrive file changes using delta queries. Returns added, modified, and deleted files since last sync. Provide the delta_token from a previous response for incremental sync, or omit it for an initial full listing. The response includes a new delta_token for the next request.",
    TrackFileChangesParams.shape,
    async (params) => {
      try {
        const parsed = TrackFileChangesParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const url = buildDeltaUrl(userPath, parsed.folder_id, parsed.delta_token);

        const response: unknown = await graphClient.api(url).get();
        const { items, deltaLink } = parseDeltaResponse(response);
        const deltaToken = deltaLink ? extractDeltaToken(deltaLink) : undefined;
        const hasToken = !!parsed.delta_token;

        const lines = buildDeltaOutput(items, hasToken, deltaToken);

        logger.info(
          { tool: "track_file_changes", itemCount: items.length, incremental: hasToken },
          "track_file_changes completed",
        );

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
