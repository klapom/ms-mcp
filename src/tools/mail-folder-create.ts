import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { CreateMailFolderParams } from "../schemas/mail-extensions.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:mail-folder-create");

function generatePreview(displayName: string, parentFolderId?: string): string {
  const location = parentFolderId
    ? `Under parent folder: ${parentFolderId}`
    : "At root level (mailFolders)";

  return [
    "Create Mail Folder Preview:",
    "",
    `Name: ${displayName}`,
    `Location: ${location}`,
    "",
    "To proceed, call this tool again with confirm: true",
  ].join("\n");
}

async function handleConfirmed(
  graphClient: Client,
  url: string,
  parsed: { display_name: string; idempotency_key?: string; user_id?: string },
): Promise<{ folderId: string }> {
  const folder = { displayName: parsed.display_name };
  const response = (await graphClient.api(url).post(folder)) as Record<string, unknown>;
  const folderId = String(response.id ?? "");

  if (parsed.idempotency_key) {
    idempotencyCache.set(
      "create_mail_folder",
      parsed.idempotency_key,
      {
        folder_id: folderId,
        display_name: parsed.display_name,
      },
      parsed.user_id,
    );
  }

  logger.info(
    { tool: "create_mail_folder", folder_id: folderId, name: parsed.display_name },
    "Mail folder created",
  );

  return { folderId };
}

export function registerMailFolderCreateTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "create_mail_folder",
    "Create a new mail folder. Can be created at root level or under a parent folder. Use list_mail_folders to see existing folders.",
    CreateMailFolderParams.shape,
    async (params) => {
      try {
        const parsed = CreateMailFolderParams.parse(params);
        const idempotencyKey = parsed.idempotency_key;

        if (
          idempotencyKey &&
          idempotencyCache.get("create_mail_folder", idempotencyKey, parsed.user_id)
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: "This operation was already completed (idempotency key matched).",
              },
            ],
          };
        }

        const userPath = resolveUserPath(parsed.user_id);

        // Determine URL based on parent folder
        let url = `${userPath}/mailFolders`;
        if (parsed.parent_folder_id) {
          const encodedParentId = encodeGraphId(parsed.parent_folder_id);
          url = `${userPath}/mailFolders/${encodedParentId}/childFolders`;
        }

        // Preview mode
        if (parsed.confirm === false) {
          const preview = generatePreview(parsed.display_name, parsed.parent_folder_id);
          return { content: [{ type: "text" as const, text: preview }] };
        }

        const { folderId } = await handleConfirmed(graphClient, url, parsed);

        return {
          content: [
            {
              type: "text" as const,
              text: `Mail folder created successfully.\n\nFolder ID: ${folderId}\nName: ${parsed.display_name}`,
            },
          ],
        };
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
