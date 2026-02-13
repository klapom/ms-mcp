import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { GetUserPhotoParams } from "../schemas/user.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:user-photo");

export function registerUserPhotoTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "get_user_photo",
    "Get a user's profile photo. Returns the photo as base64-encoded image data. Supports multiple sizes from 48x48 to 648x648.",
    GetUserPhotoParams.shape,
    async (params) => {
      try {
        const parsed = GetUserPhotoParams.parse(params);
        const encodedUserId = encodeGraphId(parsed.user_id);

        // Build URL with optional size parameter
        const sizeSegment = parsed.size ? `/${parsed.size}` : "";
        const url = `/users/${encodedUserId}/photo${sizeSegment}/$value`;

        // Graph API returns binary data (ArrayBuffer)
        const photoBuffer = (await graphClient.api(url).get()) as ArrayBuffer;

        // Convert ArrayBuffer to base64
        const buffer = Buffer.from(photoBuffer);
        const base64Data = buffer.toString("base64");

        // Determine MIME type (Graph API typically returns JPEG)
        const mimeType = "image/jpeg";

        logger.info(
          { tool: "get_user_photo", size: parsed.size ?? "default", bytes: buffer.length },
          "get_user_photo completed",
        );

        return {
          content: [
            {
              type: "image" as const,
              data: base64Data,
              mimeType,
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
