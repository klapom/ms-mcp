import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { CreateChannelParams, type CreateChannelParamsType } from "../schemas/teams-write.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:teams-channels-write");

function buildCreatePreview(parsed: CreateChannelParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Create channel", {
      "Channel name": parsed.display_name,
      "Team ID": parsed.team_id,
      Type: parsed.membership_type,
      Description: parsed.description,
      "Owner (private)": parsed.owner_user_id,
    }),
  );
  if (preview) {
    return { content: [{ type: "text", text: preview.message }] };
  }
  return null;
}

async function executeCreate(
  graphClient: Client,
  parsed: CreateChannelParamsType,
  startTime: number,
): Promise<ToolResult> {
  const teamId = encodeGraphId(parsed.team_id);
  const url = `/teams/${teamId}/channels`;

  const body: Record<string, unknown> = {
    displayName: parsed.display_name,
    membershipType: parsed.membership_type,
  };
  if (parsed.description) {
    body.description = parsed.description;
  }
  if (parsed.membership_type === "private" && parsed.owner_user_id) {
    body.members = [
      {
        "@odata.type": "#microsoft.graph.aadUserConversationMember",
        roles: ["owner"],
        "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${parsed.owner_user_id}')`,
      },
    ];
  }

  const response = (await graphClient.api(url).post(body)) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    {
      tool: "create_channel",
      status: 201,
      duration_ms: endTime - startTime,
    },
    "create_channel completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Channel created successfully.\n\nChannel ID: ${String(response?.id ?? "")}\nName: ${String(response?.displayName ?? "")}\nType: ${String(response?.membershipType ?? "")}\nURL: ${String(response?.webUrl ?? "")}`,
      },
    ],
  };
}

export function registerTeamsChannelsWriteTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "create_channel",
    "Create a new channel in a Teams team. Supports standard and private channels. Requires confirm=true to execute — without it, returns a preview. Use idempotency_key to prevent duplicate creation.",
    CreateChannelParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = CreateChannelParams.parse(params);

        const previewResult = buildCreatePreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "create_channel",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeCreate(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("create_channel", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "create_channel",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "create_channel failed",
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
