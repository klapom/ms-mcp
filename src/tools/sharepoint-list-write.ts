import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type {
  CreateListItemParamsType,
  DeleteListItemParamsType,
  UpdateListItemParamsType,
} from "../schemas/sharepoint.js";
import {
  CreateListItemParams,
  DeleteListItemParams,
  UpdateListItemParams,
} from "../schemas/sharepoint.js";
import type { ToolResult } from "../types/tools.js";
import { checkConfirmation, formatPreview } from "../utils/confirmation.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:sharepoint-list-write");

function buildCreatePreview(parsed: CreateListItemParamsType): ToolResult | null {
  const fieldSummary = Object.keys(parsed.fields).join(", ");
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Create list item", {
      "Site ID": parsed.site_id,
      "List ID": parsed.list_id,
      Fields: fieldSummary,
    }),
  );
  if (preview) return { content: [{ type: "text", text: preview.message }] };
  return null;
}

function buildUpdatePreview(parsed: UpdateListItemParamsType): ToolResult | null {
  const fieldSummary = Object.keys(parsed.fields).join(", ");
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Update list item", {
      "Site ID": parsed.site_id,
      "List ID": parsed.list_id,
      "Item ID": parsed.item_id,
      Fields: fieldSummary,
    }),
  );
  if (preview) return { content: [{ type: "text", text: preview.message }] };
  return null;
}

function buildDeletePreview(parsed: DeleteListItemParamsType): ToolResult | null {
  const preview = checkConfirmation(
    "destructive",
    parsed.confirm,
    formatPreview("Delete list item", {
      "Site ID": parsed.site_id,
      "List ID": parsed.list_id,
      "Item ID": parsed.item_id,
    }),
  );
  if (preview) return { content: [{ type: "text", text: preview.message }] };
  return null;
}

async function executeCreate(
  graphClient: Client,
  parsed: CreateListItemParamsType,
  startTime: number,
): Promise<ToolResult> {
  const url = `/sites/${encodeGraphId(parsed.site_id)}/lists/${encodeGraphId(parsed.list_id)}/items`;
  const response = (await graphClient.api(url).post({ fields: parsed.fields })) as Record<
    string,
    unknown
  >;

  const endTime = Date.now();
  logger.info(
    { tool: "create_list_item", status: 201, duration_ms: endTime - startTime },
    "create_list_item completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `List item created successfully.\n\nItem ID: ${String(response?.id ?? "")}\nTimestamp: ${new Date(endTime).toISOString()}`,
      },
    ],
  };
}

async function executeUpdate(
  graphClient: Client,
  parsed: UpdateListItemParamsType,
  startTime: number,
): Promise<ToolResult> {
  const siteId = encodeGraphId(parsed.site_id);
  const listId = encodeGraphId(parsed.list_id);
  const itemId = encodeGraphId(parsed.item_id);
  const url = `/sites/${siteId}/lists/${listId}/items/${itemId}/fields`;
  await graphClient.api(url).patch(parsed.fields);

  const endTime = Date.now();
  logger.info(
    { tool: "update_list_item", status: 200, duration_ms: endTime - startTime },
    "update_list_item completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `List item updated successfully.\n\nItem ID: ${parsed.item_id}\nTimestamp: ${new Date(endTime).toISOString()}`,
      },
    ],
  };
}

async function executeDelete(
  graphClient: Client,
  parsed: DeleteListItemParamsType,
  startTime: number,
): Promise<ToolResult> {
  const siteId = encodeGraphId(parsed.site_id);
  const listId = encodeGraphId(parsed.list_id);
  const itemId = encodeGraphId(parsed.item_id);
  const url = `/sites/${siteId}/lists/${listId}/items/${itemId}`;
  await graphClient.api(url).delete();

  const endTime = Date.now();
  logger.info(
    { tool: "delete_list_item", status: 204, duration_ms: endTime - startTime },
    "delete_list_item completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `List item deleted successfully.\n\nItem ID: ${parsed.item_id}\nTimestamp: ${new Date(endTime).toISOString()}`,
      },
    ],
  };
}

export function registerSharePointListWriteTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "create_list_item",
    "Create a new item in a SharePoint list. Requires confirm=true to actually create — without it, returns a preview. Pass field values as a JSON object. Use idempotency_key to prevent duplicate creates.",
    CreateListItemParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = CreateListItemParams.parse(params);

        const previewResult = buildCreatePreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "create_list_item",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeCreate(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("create_list_item", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "create_list_item",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "create_list_item failed",
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

  server.tool(
    "update_list_item",
    "Update an existing item in a SharePoint list. Requires confirm=true to actually update — without it, returns a preview. Only provided fields are updated (partial update). Use idempotency_key to prevent duplicate updates.",
    UpdateListItemParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = UpdateListItemParams.parse(params);

        const previewResult = buildUpdatePreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "update_list_item",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeUpdate(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("update_list_item", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "update_list_item",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "update_list_item failed",
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

  server.tool(
    "delete_list_item",
    "Delete an item from a SharePoint list. Requires confirm=true to actually delete — without it, returns a preview. Use idempotency_key to prevent duplicate deletes.",
    DeleteListItemParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = DeleteListItemParams.parse(params);

        const previewResult = buildDeletePreview(parsed);
        if (previewResult) return previewResult;

        if (parsed.idempotency_key) {
          const cached = idempotencyCache.get(
            "delete_list_item",
            parsed.idempotency_key,
            parsed.user_id,
          );
          if (cached !== undefined) return cached as ToolResult;
        }

        const result = await executeDelete(graphClient, parsed, startTime);

        if (parsed.idempotency_key) {
          idempotencyCache.set("delete_list_item", parsed.idempotency_key, result, parsed.user_id);
        }

        return result;
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            {
              tool: "delete_list_item",
              status: error.httpStatus,
              code: error.code,
              duration_ms: Date.now() - startTime,
            },
            "delete_list_item failed",
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
