import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { MarkEmailReadParams } from "../schemas/mail-extensions.js";
import { formatErrorForUser, McpToolError } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:mail-read-state");

export function registerMailReadStateTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "mark_email_read",
    "Mark an email as read (default) or unread. Reversible: call again with is_read=false to undo. Note: the message ID changes when an email is moved — mark before moving, or use the new ID returned by move_email.",
    MarkEmailReadParams.shape,
    async (params) => {
      try {
        const parsed = MarkEmailReadParams.parse(params);
        const url = `${resolveUserPath(parsed.user_id)}/messages/${encodeGraphId(parsed.message_id)}`;
        await graphClient.api(url).patch({ isRead: parsed.is_read });

        logger.info(
          { tool: "mark_email_read", message_id: parsed.message_id, is_read: parsed.is_read },
          "Email read state updated",
        );
        const state = parsed.is_read ? "read" : "unread";
        return {
          content: [
            {
              type: "text" as const,
              text: `Email marked as ${state}.\n\nMessage ID: ${parsed.message_id}`,
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
