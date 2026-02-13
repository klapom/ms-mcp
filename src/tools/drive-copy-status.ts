import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { PollCopyStatusParamsType } from "../schemas/file-upload.js";
import { PollCopyStatusParams } from "../schemas/file-upload.js";
import type { ToolResult } from "../types/tools.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { formatFileSize } from "../utils/file-size.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:drive-copy-status");

interface AsyncOperationStatus {
  status:
    | "notStarted"
    | "inProgress"
    | "completed"
    | "updating"
    | "failed"
    | "deletePending"
    | "deleteFailed"
    | "waiting";
  percentageComplete?: number;
  resourceId?: string;
  // When completed, may include result
  id?: string;
  name?: string;
  size?: number;
  webUrl?: string;
}

interface ErrorDetail {
  code: string;
  message: string;
}

interface AsyncOperationError extends AsyncOperationStatus {
  error?: ErrorDetail;
}

async function handlePollStatus(
  graphClient: Client,
  parsed: PollCopyStatusParamsType,
): Promise<ToolResult> {
  const startTime = Date.now();

  // Extract monitor URL (Graph API returns full URL in Location header)
  // Example: https://graph.microsoft.com/v1.0/me/drive/items/{id}/copy?$monitor
  const monitorUrl = parsed.monitor_url;

  // Extract the path portion from the full URL
  // The Graph client expects a path like /me/drive/items/{id}/copy?$monitor
  const urlObj = new URL(monitorUrl);
  const apiPath = urlObj.pathname + urlObj.search;

  // Remove /v1.0 prefix if present
  const cleanPath = apiPath.replace(/^\/v1\.0/, "");

  logger.debug({ monitorUrl, cleanPath }, "Polling copy status");

  // Use Graph client to poll (this will handle auth via middleware)
  const result = (await graphClient.api(cleanPath).get()) as
    | AsyncOperationStatus
    | AsyncOperationError;

  const endTime = Date.now();
  logger.info(
    {
      tool: "poll_copy_status",
      status: result.status,
      percentageComplete: result.percentageComplete,
      duration_ms: endTime - startTime,
    },
    "poll_copy_status completed",
  );

  // Handle different status values
  if (result.status === "failed") {
    const errorResult = result as AsyncOperationError;
    const errorMessage = errorResult.error?.message ?? "Unknown error";
    return {
      content: [
        {
          type: "text",
          text: `Copy operation failed.\n\nStatus: failed\nError: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }

  if (result.status === "completed") {
    // Check if result includes driveItem details
    if (result.id && result.name) {
      return {
        content: [
          {
            type: "text",
            text: `Copy operation completed.\n\nStatus: completed\nPercentage: 100%\n\nFile ID: ${result.id}\nName: ${result.name}\nSize: ${result.size ? formatFileSize(result.size) : "Unknown"}\nURL: ${result.webUrl ?? "N/A"}`,
          },
        ],
      };
    }

    // Completed but no driveItem details
    return {
      content: [
        {
          type: "text",
          text: "Copy operation completed.\n\nStatus: completed\nPercentage: 100%\n\nThe file has been copied successfully. Use list_files or get_file_metadata to retrieve details.",
        },
      ],
    };
  }

  // In progress or other status
  const percentage = result.percentageComplete ?? 0;
  return {
    content: [
      {
        type: "text",
        text: `Copy operation in progress.\n\nStatus: ${result.status}\nPercentage: ${percentage}%\n\nPoll again to check progress.`,
      },
    ],
  };
}

export function registerDriveCopyStatusTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "poll_copy_status",
    "Poll the status of an asynchronous file copy operation. Takes the monitor URL returned in the Location header from copy_file. Returns current status (notStarted, inProgress, completed, failed) and percentage complete. When completed, includes final driveItem details if available.",
    PollCopyStatusParams.shape,
    async (params) => {
      try {
        const parsed = PollCopyStatusParams.parse(params);
        return await handlePollStatus(graphClient, parsed);
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "poll_copy_status", status: error.httpStatus, code: error.code },
            "poll_copy_status failed",
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
