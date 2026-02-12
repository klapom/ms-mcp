import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { ShareFileParamsType } from "../schemas/drive-write.js";
import { ShareFileParams } from "../schemas/drive-write.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:drive-share");

function buildSharePreview(parsed: ShareFileParamsType): ToolResult | null {
  const anonymousWarning =
    parsed.scope === "anonymous"
      ? "\n\n⚠ WARNING: Anonymous links are accessible by anyone with the link."
      : "";

  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Share file", {
      "File ID": parsed.file_id,
      "Link type": parsed.link_type,
      Scope: parsed.scope,
    }) + anonymousWarning,
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }
  return null;
}

async function executeShare(
  graphClient: Client,
  parsed: ShareFileParamsType,
  startTime: number,
): Promise<ToolResult> {
  const userPath = resolveUserPath(parsed.user_id);
  const url = `${userPath}/drive/items/${encodeGraphId(parsed.file_id)}/createLink`;

  const requestBody = {
    type: parsed.link_type,
    scope: parsed.scope,
  };

  const result = (await graphClient.api(url).post(requestBody)) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    { tool: "share_file", status: 200, duration_ms: endTime - startTime },
    "share_file completed",
  );

  let linkUrl = "";
  if (result.link && typeof result.link === "object" && "webUrl" in result.link) {
    linkUrl = String((result.link as Record<string, unknown>).webUrl ?? "");
  }

  const anonymousNote =
    parsed.scope === "anonymous" ? "\n\n⚠ This is an anonymous link accessible by anyone." : "";

  return {
    content: [
      {
        type: "text",
        text: `Sharing link created successfully.\n\nType: ${parsed.link_type}\nScope: ${parsed.scope}\nLink: ${linkUrl}${anonymousNote}`,
      },
    ],
  };
}

export function registerDriveShareTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "share_file",
    "Create a sharing link for a file or folder in OneDrive. Requires confirm=true to actually share — without it, returns a preview. Supports view/edit link types and organization/anonymous scopes. Anonymous links show a warning. Use idempotency_key to prevent duplicate shares.",
    ShareFileParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = ShareFileParams.parse(params);

        const previewResult = buildSharePreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get("share_file", parsed.idempotency_key, parsed.user_id);
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeShare(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("share_file", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "share_file",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "share_file failed",
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
