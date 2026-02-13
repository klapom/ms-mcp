import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { DeleteEmailParams } from "../schemas/mail-extensions.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:mail-delete");

function getEmailFromAddress(from: unknown): string {
  if (
    typeof from === "object" &&
    from !== null &&
    "emailAddress" in from &&
    typeof (from as Record<string, unknown>).emailAddress === "object"
  ) {
    const emailAddress = (from as Record<string, unknown>).emailAddress as Record<string, unknown>;
    if (typeof emailAddress.address === "string") {
      return emailAddress.address;
    }
  }
  return "Unknown";
}

async function generatePreview(graphClient: Client, url: string): Promise<string> {
  const message = (await graphClient
    .api(url)
    .select("id,subject,from,receivedDateTime")
    .get()) as Record<string, unknown>;

  const from = getEmailFromAddress(message.from);

  return [
    "⚠️  PERMANENT DELETION - This action cannot be undone!",
    "",
    `Subject: ${message.subject ?? "(no subject)"}`,
    `From: ${from}`,
    `Received: ${message.receivedDateTime ?? "Unknown"}`,
    `Message ID: ${message.id}`,
    "",
    "The message will be permanently deleted (not moved to Deleted Items).",
    "",
    "To proceed, call this tool again with confirm: true",
  ].join("\n");
}

export function registerMailDeleteTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "delete_email",
    "Permanently delete an email message. This action cannot be undone - the message is deleted permanently, not moved to Deleted Items.",
    DeleteEmailParams.shape,
    async (params) => {
      try {
        const parsed = DeleteEmailParams.parse(params);
        const idempotencyKey = parsed.idempotency_key;

        // Check idempotency
        if (idempotencyKey) {
          const cached = idempotencyCache.get("delete_email", idempotencyKey, parsed.user_id);
          if (cached) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "This operation was already completed (idempotency key matched).",
                },
              ],
            };
          }
        }

        const userPath = resolveUserPath(parsed.user_id);
        const encodedMessageId = encodeGraphId(parsed.message_id);
        const url = `${userPath}/messages/${encodedMessageId}`;

        // Preview mode
        if (parsed.confirm === false) {
          const preview = await generatePreview(graphClient, url);
          return { content: [{ type: "text" as const, text: preview }] };
        }

        // Execute deletion

        await graphClient.api(url).delete();

        if (idempotencyKey) {
          idempotencyCache.set(
            "delete_email",
            idempotencyKey,
            { message_id: parsed.message_id },
            parsed.user_id,
          );
        }

        logger.info({ tool: "delete_email", message_id: parsed.message_id }, "Email deleted");

        return {
          content: [
            {
              type: "text" as const,
              text: `Email permanently deleted.\nMessage ID: ${parsed.message_id}`,
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
