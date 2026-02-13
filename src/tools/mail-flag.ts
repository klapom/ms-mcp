import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import { FlagEmailParams } from "../schemas/mail-extensions.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:mail-flag");

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

function getStatusText(flagStatus: string): string {
  if (flagStatus === "flagged") {
    return "Flagged for follow-up";
  }
  if (flagStatus === "complete") {
    return "Marked as complete";
  }
  return "Flag removed";
}

async function generatePreview(
  graphClient: Client,
  url: string,
  parsed: {
    message_id: string;
    flag_status: string;
    due_date?: string;
    start_date?: string;
    completion_date?: string;
  },
): Promise<string> {
  const message = (await graphClient.api(url).select("id,subject,from").get()) as Record<
    string,
    unknown
  >;

  const from = getEmailFromAddress(message.from);
  const statusText = getStatusText(parsed.flag_status);

  const preview = [
    "Flag Email Preview:",
    "",
    `Subject: ${message.subject ?? "(no subject)"}`,
    `From: ${from}`,
    `Message ID: ${message.id}`,
    "",
    `New Flag Status: ${statusText}`,
  ];

  if (parsed.due_date) preview.push(`Due Date: ${parsed.due_date}`);
  if (parsed.start_date) preview.push(`Start Date: ${parsed.start_date}`);
  if (parsed.completion_date) preview.push(`Completion Date: ${parsed.completion_date}`);

  preview.push("", "To proceed, call this tool again with confirm: true");

  return preview.join("\n");
}

function buildFlagObject(parsed: {
  flag_status: string;
  due_date?: string;
  start_date?: string;
  completion_date?: string;
}) {
  const flag: Record<string, unknown> = {
    flagStatus: parsed.flag_status,
  };

  if (parsed.due_date) {
    flag.dueDateTime = {
      dateTime: parsed.due_date,
      timeZone: "UTC",
    };
  }

  if (parsed.start_date) {
    flag.startDateTime = {
      dateTime: parsed.start_date,
      timeZone: "UTC",
    };
  }

  if (parsed.completion_date) {
    flag.completedDateTime = {
      dateTime: parsed.completion_date,
      timeZone: "UTC",
    };
  }

  return flag;
}

export function registerMailFlagTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "flag_email",
    "Set or clear a flag on an email message. Flags can mark messages for follow-up with optional due dates and completion status.",
    FlagEmailParams.shape,
    async (params) => {
      try {
        const parsed = FlagEmailParams.parse(params);
        const idempotencyKey = parsed.idempotency_key;

        if (idempotencyKey && idempotencyCache.get("flag_email", idempotencyKey, parsed.user_id)) {
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
        const encodedMessageId = encodeGraphId(parsed.message_id);
        const url = `${userPath}/messages/${encodedMessageId}`;

        // Preview mode
        if (parsed.confirm === false) {
          const preview = await generatePreview(graphClient, url, parsed);
          return { content: [{ type: "text" as const, text: preview }] };
        }

        const flag = buildFlagObject(parsed);
        await graphClient.api(url).patch({ flag });

        if (idempotencyKey) {
          idempotencyCache.set(
            "flag_email",
            idempotencyKey,
            {
              message_id: parsed.message_id,
              flag_status: parsed.flag_status,
            },
            parsed.user_id,
          );
        }

        logger.info(
          { tool: "flag_email", message_id: parsed.message_id, status: parsed.flag_status },
          "Email flag updated",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Email flag updated successfully.\n\nMessage ID: ${parsed.message_id}\nFlag Status: ${parsed.flag_status}`,
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
