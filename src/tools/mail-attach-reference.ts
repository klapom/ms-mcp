import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { AttachReferenceParamsType } from "../schemas/file-upload.js";
import { AttachReferenceParams } from "../schemas/file-upload.js";
import type { ToolResult } from "../types/tools.js";
import { formatPreview } from "../utils/confirmation.js";
import { resolveDrivePath } from "../utils/drive-path.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { formatFileSize } from "../utils/file-size.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:mail-attach-reference");

interface DriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
}

interface SharingLink {
  link: {
    webUrl: string;
    type: string;
    scope: string;
  };
}

async function createSharingLink(
  graphClient: Client,
  drivePath: string,
  fileId: string,
  permissionType: "view" | "edit",
): Promise<string> {
  const apiPath = `${drivePath}/items/${encodeGraphId(fileId)}/createLink`;

  const requestBody = {
    type: permissionType,
    scope: "organization",
  };

  const response = (await graphClient.api(apiPath).post(requestBody)) as SharingLink;

  return response.link.webUrl;
}

function buildReferenceAttachment(
  fileName: string,
  shareUrl: string,
  permissionType: "view" | "edit",
  displayName?: string,
): Record<string, unknown> {
  const name = displayName ?? fileName;

  return {
    "@odata.type": "#microsoft.graph.referenceAttachment",
    name,
    sourceUrl: shareUrl,
    providerType: "oneDriveConsumer",
    permission: permissionType,
  };
}

async function buildAttachPreview(
  graphClient: Client,
  parsed: AttachReferenceParamsType,
  drivePath: string,
): Promise<ToolResult> {
  // Fetch file metadata for preview
  const fileApiPath = `${drivePath}/items/${encodeGraphId(parsed.file_id)}`;
  const file = (await graphClient.api(fileApiPath).select("id,name,size").get()) as DriveItem;

  const previewText = formatPreview("Attach file reference to message", {
    "Message ID": parsed.message_id,
    "File name": file.name,
    "File ID": parsed.file_id,
    Size: file.size ? formatFileSize(file.size) : "Unknown",
    Permission: parsed.permission_type,
    "Display name": parsed.name ?? file.name,
  });

  return { content: [{ type: "text", text: previewText }] };
}

async function executeAttach(
  graphClient: Client,
  parsed: AttachReferenceParamsType,
  userPath: string,
  drivePath: string,
  startTime: number,
): Promise<ToolResult> {
  // Fetch file metadata
  const fileApiPath = `${drivePath}/items/${encodeGraphId(parsed.file_id)}`;
  const file = (await graphClient
    .api(fileApiPath)
    .select("id,name,size,webUrl")
    .get()) as DriveItem;

  // Create sharing link
  const shareUrl = await createSharingLink(
    graphClient,
    drivePath,
    parsed.file_id,
    parsed.permission_type,
  );

  logger.debug(
    { fileId: parsed.file_id, shareUrl, permissionType: parsed.permission_type },
    "Sharing link created",
  );

  // Build referenceAttachment payload
  const attachment = buildReferenceAttachment(
    file.name,
    shareUrl,
    parsed.permission_type,
    parsed.name,
  );

  // POST to /messages/{id}/attachments
  const apiPath = `${userPath}/messages/${encodeGraphId(parsed.message_id)}/attachments`;
  const result = (await graphClient.api(apiPath).post(attachment)) as Record<string, unknown>;

  const endTime = Date.now();
  logger.info(
    {
      tool: "attach_reference",
      messageId: parsed.message_id,
      fileId: parsed.file_id,
      fileName: file.name,
      attachmentId: result.id,
      permissionType: parsed.permission_type,
      status: 201,
      duration_ms: endTime - startTime,
    },
    "attach_reference completed",
  );

  const attachmentId = String(result.id ?? "");
  const attachmentName = String(result.name ?? file.name);

  return {
    content: [
      {
        type: "text",
        text: `File reference attached successfully.\n\nAttachment ID: ${attachmentId}\nName: ${attachmentName}\nFile: ${file.name}\nSize: ${file.size ? formatFileSize(file.size) : "Unknown"}\nPermission: ${parsed.permission_type}\nSharing link: ${shareUrl}`,
      },
    ],
  };
}

export function registerMailAttachReferenceTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "attach_reference",
    "Attach a OneDrive/SharePoint file as a reference (link) to a message. Requires confirm=true to actually attach — without it, returns a preview. Automatically creates a sharing link with specified permission (view/edit). Recipients access the file via link. Use idempotency_key to prevent duplicate attachments.",
    AttachReferenceParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = AttachReferenceParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);
        const drivePath = resolveDrivePath(parsed.user_id, parsed.site_id, parsed.drive_id);

        // Check confirmation
        if (!parsed.confirm) {
          return await buildAttachPreview(graphClient, parsed, drivePath);
        }

        // Check idempotency cache
        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "attach_reference",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        // Execute attach
        const result = await executeAttach(graphClient, parsed, userPath, drivePath, startTime);

        // Cache result
        if (parsed.idempotency_key) {
          idempotencyCache.set("attach_reference", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "attach_reference",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "attach_reference failed",
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
