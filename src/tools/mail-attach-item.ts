import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { AttachItemParamsType } from "../schemas/file-upload.js";
import { AttachItemParams } from "../schemas/file-upload.js";
import type { ToolResult } from "../types/tools.js";
import { formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:mail-attach-item");

interface MessageItem {
  "@odata.type"?: string;
  id: string;
  subject?: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress: { name: string; address: string } };
  toRecipients?: Array<{ emailAddress: { name: string; address: string } }>;
  ccRecipients?: Array<{ emailAddress: { name: string; address: string } }>;
  receivedDateTime?: string;
}

interface EventItem {
  "@odata.type"?: string;
  id: string;
  subject?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  attendees?: Array<{
    emailAddress: { name: string; address: string };
    type: string;
  }>;
  organizer?: { emailAddress: { name: string; address: string } };
}

interface ContactItem {
  "@odata.type"?: string;
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  emailAddresses?: Array<{ name: string; address: string }>;
  businessPhones?: string[];
  mobilePhone?: string;
}

type SourceItem = MessageItem | EventItem | ContactItem;

async function fetchSourceItem(
  graphClient: Client,
  userPath: string,
  itemType: "message" | "event" | "contact",
  itemId: string,
): Promise<SourceItem> {
  const encodedId = encodeGraphId(itemId);

  let apiPath: string;
  switch (itemType) {
    case "message":
      apiPath = `${userPath}/messages/${encodedId}`;
      break;
    case "event":
      apiPath = `${userPath}/events/${encodedId}`;
      break;
    case "contact":
      apiPath = `${userPath}/contacts/${encodedId}`;
      break;
  }

  const item = (await graphClient.api(apiPath).get()) as SourceItem;

  // Add @odata.type if not present
  if (!item["@odata.type"]) {
    const typeMap = {
      message: "#microsoft.graph.message",
      event: "#microsoft.graph.event",
      contact: "#microsoft.graph.contact",
    };
    item["@odata.type"] = typeMap[itemType];
  }

  return item;
}

function getItemTitle(item: SourceItem): string {
  if ("subject" in item && item.subject) {
    return item.subject;
  }
  if ("displayName" in item && item.displayName) {
    return item.displayName;
  }
  return "Untitled";
}

function estimateItemSize(item: SourceItem): number {
  // Rough estimate: JSON.stringify size
  const jsonStr = JSON.stringify(item);
  return Buffer.byteLength(jsonStr, "utf-8");
}

function buildItemAttachment(item: SourceItem, displayName?: string): Record<string, unknown> {
  const name = displayName ?? getItemTitle(item);

  return {
    "@odata.type": "#microsoft.graph.itemAttachment",
    name,
    item,
  };
}

async function buildAttachPreview(
  graphClient: Client,
  parsed: AttachItemParamsType,
  userPath: string,
): Promise<ToolResult> {
  // Fetch source item to show details in preview
  const sourceItem = await fetchSourceItem(graphClient, userPath, parsed.item_type, parsed.item_id);

  const itemTitle = getItemTitle(sourceItem);
  const itemSize = estimateItemSize(sourceItem);

  const previewText = formatPreview("Attach item to message", {
    "Message ID": parsed.message_id,
    "Item type": parsed.item_type,
    "Item title": itemTitle,
    "Item ID": parsed.item_id,
    "Estimated size": `~${Math.round(itemSize / 1024)} KB`,
    "Display name": parsed.name ?? itemTitle,
  });

  return { content: [{ type: "text", text: previewText }] };
}

async function executeAttach(
  graphClient: Client,
  parsed: AttachItemParamsType,
  userPath: string,
  startTime: number,
): Promise<ToolResult> {
  // Fetch source item
  const sourceItem = await fetchSourceItem(graphClient, userPath, parsed.item_type, parsed.item_id);

  // Build itemAttachment payload
  const attachment = buildItemAttachment(sourceItem, parsed.name);

  // POST to /messages/{id}/attachments
  const apiPath = `${userPath}/messages/${encodeGraphId(parsed.message_id)}/attachments`;
  const result = (await graphClient.api(apiPath).post(attachment)) as Record<string, unknown>;

  const endTime = Date.now();
  const itemTitle = getItemTitle(sourceItem);
  logger.info(
    {
      tool: "attach_item",
      messageId: parsed.message_id,
      itemType: parsed.item_type,
      itemId: parsed.item_id,
      attachmentId: result.id,
      status: 201,
      duration_ms: endTime - startTime,
    },
    "attach_item completed",
  );

  const attachmentId = String(result.id ?? "");
  const attachmentName = String(result.name ?? itemTitle);

  return {
    content: [
      {
        type: "text",
        text: `Item attached successfully.\n\nAttachment ID: ${attachmentId}\nName: ${attachmentName}\nType: ${parsed.item_type}\nSource item: ${itemTitle}`,
      },
    ],
  };
}

export function registerMailAttachItemTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "attach_item",
    "Attach an email, event, or contact as an embedded itemAttachment to a message. Requires confirm=true to actually attach — without it, returns a preview. The source item is fetched and embedded in full. Use idempotency_key to prevent duplicate attachments.",
    AttachItemParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = AttachItemParams.parse(params);
        const userPath = resolveUserPath(parsed.user_id);

        // Check confirmation
        if (!parsed.confirm) {
          return await buildAttachPreview(graphClient, parsed, userPath);
        }

        // Check idempotency cache
        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "attach_item",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        // Execute attach
        const result = await executeAttach(graphClient, parsed, userPath, startTime);

        // Cache result
        if (parsed.idempotency_key) {
          idempotencyCache.set("attach_item", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "attach_item",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "attach_item failed",
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
