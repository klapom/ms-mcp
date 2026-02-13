import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { CreateFolderParamsType } from "../schemas/drive-write.js";
import { CreateFolderParams } from "../schemas/drive-write.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { resolveDrivePath } from "../utils/drive-path.js";
import { McpToolError, ValidationError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:drive-folder");

function resolveParentUrl(drivePath: string, parsed: CreateFolderParamsType): string {
  if (parsed.parent_id && parsed.parent_path) {
    throw new ValidationError(
      "parent_id and parent_path are mutually exclusive. Provide only one.",
    );
  }
  if (parsed.parent_id) {
    return `${drivePath}/items/${encodeGraphId(parsed.parent_id)}/children`;
  }
  if (parsed.parent_path) {
    const cleanPath = parsed.parent_path.startsWith("/")
      ? parsed.parent_path
      : `/${parsed.parent_path}`;
    return `${drivePath}/root:${cleanPath}:/children`;
  }
  return `${drivePath}/root/children`;
}

function buildFolderPreview(parsed: CreateFolderParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Create folder", {
      Name: parsed.name,
      Parent: parsed.parent_path ?? parsed.parent_id ?? "root",
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }
  return null;
}

async function executeCreateFolder(
  graphClient: Client,
  parsed: CreateFolderParamsType,
  startTime: number,
): Promise<ToolResult> {
  const drivePath = resolveDrivePath(parsed.user_id, parsed.site_id, parsed.drive_id);
  const url = resolveParentUrl(drivePath, parsed);

  const requestBody = {
    name: parsed.name,
    folder: {},
    "@microsoft.graph.conflictBehavior": "fail",
  };

  const result = (await graphClient.api(url).post(requestBody)) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    { tool: "create_folder", status: 201, duration_ms: endTime - startTime },
    "create_folder completed",
  );

  const id = String(result.id ?? "");
  const name = String(result.name ?? "");
  const webUrl = String(result.webUrl ?? "");

  return {
    content: [
      {
        type: "text",
        text: `Folder created successfully.\n\nName: ${name}\nID: ${id}\nURL: ${webUrl}`,
      },
    ],
  };
}

export function registerDriveFolderTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "create_folder",
    "Create a new folder in OneDrive. Requires confirm=true to actually create — without it, returns a preview. Fails if a folder with the same name already exists (409 conflict). Use idempotency_key to prevent duplicate creates.",
    CreateFolderParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = CreateFolderParams.parse(params);

        const previewResult = buildFolderPreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "create_folder",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeCreateFolder(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("create_folder", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "create_folder",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "create_folder failed",
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
