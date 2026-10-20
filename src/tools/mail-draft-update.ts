import { type Client, GraphError } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { DeleteDraftParamsType, UpdateDraftParamsType } from "../schemas/mail-extensions.js";
import { DeleteDraftParams, UpdateDraftParams } from "../schemas/mail-extensions.js";
import type { ToolResult } from "../types/tools.js";
import { formatPreview } from "../utils/confirmation.js";
import { formatErrorForUser, McpToolError, ValidationError } from "../utils/errors.js";
import { encodeGraphId } from "../utils/graph-id.js";
import { idempotencyCache } from "../utils/idempotency.js";
import { createLogger } from "../utils/logger.js";
import { toStyledHtmlBody } from "../utils/mail-html.js";
import { toNamedRecipients } from "../utils/recipients.js";

const logger = createLogger("tools:mail-draft-update");

const UPDATABLE_FIELDS = ["subject", "body", "to", "cc", "bcc", "importance"] as const;

const PREVIEW_SELECT =
  "id,subject,isDraft,toRecipients,ccRecipients,bccRecipients,importance,lastModifiedDateTime";

const NOT_A_DRAFT =
  "This message is not a draft (already sent or received). Only drafts can be changed; use reply_email/forward_email, or create_draft for a new message.";

type Recipient = { address: string; name?: string };

function hasUpdatableField(parsed: UpdateDraftParamsType): boolean {
  return UPDATABLE_FIELDS.some((f) => parsed[f] !== undefined);
}

function validateUpdate(parsed: UpdateDraftParamsType): void {
  if (parsed.body_type !== undefined && parsed.body === undefined) {
    throw new ValidationError("body_type requires body.");
  }
  if (!hasUpdatableField(parsed)) {
    throw new ValidationError(
      "At least one updatable field must be provided (subject, body, to, cc, bcc, importance).",
    );
  }
}

function buildPatchBody(parsed: UpdateDraftParamsType): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (parsed.subject !== undefined) body.subject = parsed.subject;
  if (parsed.body !== undefined) {
    body.body = toStyledHtmlBody(parsed.body, parsed.body_type ?? "text");
  }
  if (parsed.to !== undefined) body.toRecipients = toNamedRecipients(parsed.to);
  if (parsed.cc !== undefined) body.ccRecipients = toNamedRecipients(parsed.cc);
  if (parsed.bcc !== undefined) body.bccRecipients = toNamedRecipients(parsed.bcc);
  if (parsed.importance !== undefined) body.importance = parsed.importance;
  return body;
}

function addressesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((r: Record<string, unknown>) => {
    const emailAddress = r.emailAddress as Record<string, unknown> | undefined;
    return String(emailAddress?.address ?? "");
  });
}

function describeRecipientChange(next: Recipient[], current: unknown): string {
  if (next.length === 0) return "(cleared)";
  const currentCount = addressesOf(current).length;
  return `${next.map((r) => r.address).join(", ")} (replaces ${currentCount} current)`;
}

function describeBodyChange(parsed: UpdateDraftParamsType): Record<string, unknown> {
  const inputType = parsed.body_type === "html" ? "HTML" : "text";
  return {
    "New body": `${parsed.body?.length ?? 0} characters (${inputType} input, saved as HTML in Aptos 11pt black), replaces the entire current body`,
  };
}

function buildRecipientDetails(
  parsed: UpdateDraftParamsType,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  const lists = [
    ["To", parsed.to, current.toRecipients],
    ["CC", parsed.cc, current.ccRecipients],
    ["BCC", parsed.bcc, current.bccRecipients],
  ] as const;
  for (const [label, next, existing] of lists) {
    if (next === undefined) continue;
    details[`Current ${label}`] = addressesOf(existing).join(", ") || "(none)";
    details[`New ${label}`] = describeRecipientChange(next, existing);
  }
  if (parsed.to !== undefined && parsed.to.length === 0) {
    details.Note = "the draft will have no To recipients — send_draft will fail until you add some";
  }
  return details;
}

/**
 * Fetch the message and refuse anything that is not a draft.
 * `fresh` bypasses the response cache — required right before a write.
 */
async function fetchDraft(
  graphClient: Client,
  url: string,
  select: string,
  fresh: boolean,
): Promise<Record<string, unknown>> {
  let request = graphClient.api(url).select(select);
  if (fresh) request = request.header("Cache-Control", "no-cache");
  const message = (await request.get()) as Record<string, unknown>;
  if (message.isDraft !== true) {
    throw new ValidationError(NOT_A_DRAFT);
  }
  return message;
}

async function buildUpdatePreview(
  graphClient: Client,
  parsed: UpdateDraftParamsType,
  url: string,
): Promise<ToolResult> {
  const current = await fetchDraft(graphClient, url, PREVIEW_SELECT, false);

  const details: Record<string, unknown> = {
    "Message ID": parsed.message_id,
    "Last modified": current.lastModifiedDateTime,
  };
  if (parsed.subject !== undefined) {
    details["Current subject"] = current.subject || "(no subject)";
    details["New subject"] = parsed.subject || "(no subject)";
  }
  Object.assign(details, buildRecipientDetails(parsed, current));
  if (parsed.importance !== undefined) {
    details["Current importance"] = current.importance;
    details["New importance"] = parsed.importance;
  }
  if (parsed.body !== undefined) Object.assign(details, describeBodyChange(parsed));

  return { content: [{ type: "text", text: formatPreview("Update draft", details) }] };
}

async function executeUpdate(
  graphClient: Client,
  parsed: UpdateDraftParamsType,
  url: string,
  startTime: number,
): Promise<ToolResult> {
  await fetchDraft(graphClient, url, "id,isDraft", true);

  const patchBody = buildPatchBody(parsed);
  const result = (await graphClient.api(url).patch(patchBody)) as Record<string, unknown>;

  const fields = Object.keys(patchBody);
  logger.info(
    {
      tool: "update_draft",
      fields,
      fieldCount: fields.length,
      status: 200,
      duration_ms: Date.now() - startTime,
    },
    "update_draft completed",
  );

  const subject = String(result?.subject ?? "") || "(no subject)";
  return {
    content: [
      {
        type: "text",
        text: `Draft updated successfully.\n\nMessage ID: ${parsed.message_id}\nSubject: ${subject}\nFields changed: ${fields.length} (${fields.join(", ")})\n\nUse send_draft to send it, or update_draft again for further changes.`,
      },
    ],
  };
}

async function handleUpdateConfirmed(
  graphClient: Client,
  parsed: UpdateDraftParamsType,
  url: string,
  startTime: number,
): Promise<ToolResult> {
  if (parsed.idempotency_key) {
    const cached = idempotencyCache.get("update_draft", parsed.idempotency_key, parsed.user_id);
    if (cached !== undefined) return cached as ToolResult;
  }

  const result = await executeUpdate(graphClient, parsed, url, startTime);

  if (parsed.idempotency_key) {
    idempotencyCache.set("update_draft", parsed.idempotency_key, result, parsed.user_id);
  }
  return result;
}

async function buildDeletePreview(
  graphClient: Client,
  parsed: DeleteDraftParamsType,
  url: string,
): Promise<ToolResult> {
  const current = await fetchDraft(
    graphClient,
    url,
    "id,subject,isDraft,lastModifiedDateTime",
    false,
  );
  const previewText = formatPreview("Delete draft — move to Deleted Items (reversible)", {
    "Message ID": parsed.message_id,
    Subject: current.subject || "(no subject)",
    "Last modified": current.lastModifiedDateTime,
  });
  return { content: [{ type: "text", text: previewText }] };
}

async function executeDelete(
  graphClient: Client,
  url: string,
  startTime: number,
): Promise<ToolResult> {
  await fetchDraft(graphClient, url, "id,isDraft", true);

  const moved = (await graphClient
    .api(`${url}/move`)
    .post({ destinationId: "deleteditems" })) as Record<string, unknown>;
  const newId = String(moved?.id ?? "");

  logger.info(
    { tool: "delete_draft", status: 201, duration_ms: Date.now() - startTime },
    "delete_draft completed",
  );

  return {
    content: [
      {
        type: "text",
        text: `Draft moved to Deleted Items.\n\nNew Message ID: ${newId}\n\nTo restore it, call move_email with message_id "${newId}" and destination_folder "drafts".`,
      },
    ],
  };
}

async function handleDeleteConfirmed(
  graphClient: Client,
  parsed: DeleteDraftParamsType,
  url: string,
  startTime: number,
): Promise<ToolResult> {
  if (parsed.idempotency_key) {
    const cached = idempotencyCache.get("delete_draft", parsed.idempotency_key, parsed.user_id);
    if (cached !== undefined) return cached as ToolResult;
  }

  const result = await executeDelete(graphClient, url, startTime);

  if (parsed.idempotency_key) {
    idempotencyCache.set("delete_draft", parsed.idempotency_key, result, parsed.user_id);
  }
  return result;
}

function handleToolError(tool: string, error: unknown, startTime: number): ToolResult {
  // The Graph SDK re-wraps errors thrown by ErrorMappingMiddleware into a GraphError
  // that keeps only the mapped message and the error class name (as `code`).
  if (error instanceof GraphError) {
    logger.warn(
      { tool, status: error.statusCode, code: error.code, duration_ms: Date.now() - startTime },
      `${tool} failed`,
    );
    return { content: [{ type: "text", text: error.message }], isError: true };
  }
  if (error instanceof McpToolError) {
    logger.warn(
      {
        tool,
        status: error.httpStatus,
        code: error.code,
        duration_ms: Date.now() - startTime,
      },
      `${tool} failed`,
    );
    return {
      content: [{ type: "text", text: formatErrorForUser(error) }],
      isError: true,
    };
  }
  throw error;
}

export function registerMailDraftUpdateTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "update_draft",
    "Change, modify, edit or correct an EXISTING draft email (subject, body, To/CC/BCC, importance). This is the correct tool to alter a draft that already exists — do NOT create a new draft to change one. Get the message_id from the create_draft result or from list_emails on the drafts folder. Only the fields you pass are changed; to/cc/bcc each REPLACE the whole list (pass [] to clear); body REPLACES the entire body including any signature or edits the user made in Outlook (use read_email first if you need the current text). The body is always saved as HTML in Aptos 11pt black; plain-text input keeps its line breaks. Refuses messages that are not drafts. Requires confirm=true to actually update — without it, fetches the draft and returns a preview with current vs new values. Use idempotency_key to prevent duplicate updates.",
    UpdateDraftParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = UpdateDraftParams.parse(params);
        validateUpdate(parsed);

        const url = `${resolveUserPath(parsed.user_id)}/messages/${encodeGraphId(parsed.message_id)}`;

        if (!parsed.confirm) {
          return await buildUpdatePreview(graphClient, parsed, url);
        }
        return await handleUpdateConfirmed(graphClient, parsed, url, startTime);
      } catch (error) {
        return handleToolError("update_draft", error, startTime);
      }
    },
  );

  server.tool(
    "delete_draft",
    "Delete a superseded or unwanted DRAFT email by moving it to Deleted Items (reversible — restore it with move_email to the drafts folder). Use this to clean up an old draft after replacing it. Refuses messages that are not drafts. For permanent deletion of any message use delete_email. Requires confirm=true to actually delete — without it, returns a preview. Returns the new message ID (moving changes the ID). Use idempotency_key to prevent duplicate deletes.",
    DeleteDraftParams.shape,
    async (params) => {
      const startTime = Date.now();
      try {
        const parsed = DeleteDraftParams.parse(params);
        const url = `${resolveUserPath(parsed.user_id)}/messages/${encodeGraphId(parsed.message_id)}`;

        if (!parsed.confirm) {
          return await buildDeletePreview(graphClient, parsed, url);
        }
        return await handleDeleteConfirmed(graphClient, parsed, url, startTime);
      } catch (error) {
        return handleToolError("delete_draft", error, startTime);
      }
    },
  );
}
