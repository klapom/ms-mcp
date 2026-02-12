import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { resolveUserPath } from "../schemas/common.js";
import type { DownloadAttachmentParamsType, ListAttachmentsParamsType } from "../schemas/mail.js";
import { DownloadAttachmentParams, ListAttachmentsParams } from "../schemas/mail.js";
import type { ToolResult } from "../types/tools.js";
import { McpToolError, formatErrorForUser } from "../utils/errors.js";
import { formatFileSize, isTextContent } from "../utils/file-size.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tools:mail-attachments");

const SIZE_WARNING_THRESHOLD = 4 * 1024 * 1024; // 4 MB
const SIZE_ABORT_THRESHOLD = 10 * 1024 * 1024; // 10 MB

function getAttachmentTypeName(odataType: string): string {
  if (odataType.includes("fileAttachment")) return "File Attachment";
  if (odataType.includes("itemAttachment")) return "Item Attachment";
  if (odataType.includes("referenceAttachment")) return "Reference Attachment";
  return "Attachment";
}

interface AttachmentListItem {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  "@odata.type": string;
}

function formatAttachmentLine(index: number, att: AttachmentListItem): string {
  const sizeStr = formatFileSize(att.size);
  const typeName = getAttachmentTypeName(att["@odata.type"]);
  const inlineMarker = att.isInline ? ", inline" : "";
  const prefix = att.size > SIZE_WARNING_THRESHOLD ? "[!]" : `[${index}]`;
  const warningNote = att.size > SIZE_WARNING_THRESHOLD ? " — Größer als 4 MB" : "";

  return `${prefix} ${att.name} (${att.contentType}, ${sizeStr}${inlineMarker}) — ${typeName}${warningNote}`;
}

async function handleListAttachments(
  graphClient: Client,
  parsed: ListAttachmentsParamsType,
): Promise<ToolResult> {
  const startTime = Date.now();
  const userPath = resolveUserPath(parsed.user_id);

  const response = (await graphClient
    .api(`${userPath}/messages/${encodeURIComponent(parsed.message_id)}/attachments`)
    .select("id,name,contentType,size,isInline,lastModifiedDateTime")
    .get()) as Record<string, unknown>;

  const attachments = (response.value ?? []) as AttachmentListItem[];

  if (attachments.length === 0) {
    logger.info(
      { tool: "list_attachments", count: 0, duration_ms: Date.now() - startTime },
      "list_attachments completed",
    );
    return { content: [{ type: "text", text: "Diese E-Mail hat keine Anhänge." }] };
  }

  const lines = attachments.map((att, i) => formatAttachmentLine(i + 1, att));

  logger.info(
    { tool: "list_attachments", count: attachments.length, duration_ms: Date.now() - startTime },
    "list_attachments completed",
  );

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

interface AttachmentMetadata {
  "@odata.type": string;
  name: string;
  contentType: string;
  size: number;
  isInline?: boolean;
  contentId?: string;
}

interface FileAttachmentFull extends AttachmentMetadata {
  contentBytes: string;
}

function buildMetadataHeader(meta: AttachmentMetadata): string {
  const lines = [
    `Name: ${meta.name}`,
    `Content-Type: ${meta.contentType}`,
    `Größe: ${formatFileSize(meta.size)}`,
  ];
  if (meta.isInline) {
    lines.push("Inline: Ja");
  }
  if (meta.contentId) {
    lines.push(`Content-ID: ${meta.contentId}`);
  }
  return lines.join("\n");
}

function checkUnsupportedType(odataType: string): ToolResult | null {
  if (odataType.includes("itemAttachment")) {
    return {
      content: [
        {
          type: "text",
          text: "Dieser Anhang ist ein eingebettetes Outlook-Element (Item Attachment) und kann nicht als Datei heruntergeladen werden. Item Attachments (z.B. weitergeleitete E-Mails, Kalendereinladungen) werden noch nicht unterstützt.",
        },
      ],
      isError: true,
    };
  }
  if (odataType.includes("referenceAttachment")) {
    return {
      content: [
        {
          type: "text",
          text: "Dieser Anhang ist eine Cloud-Referenz (Reference Attachment) auf eine Datei in OneDrive/SharePoint und enthält keine herunterladbaren Daten. Reference Attachments werden noch nicht unterstützt.",
        },
      ],
      isError: true,
    };
  }
  return null;
}

function buildDownloadResult(full: FileAttachmentFull, warning: string | null): ToolResult {
  const header = buildMetadataHeader(full);
  const isText = isTextContent(full.contentType, full.name);

  let body: string;
  if (isText) {
    body = Buffer.from(full.contentBytes, "base64").toString("utf-8");
  } else {
    body = `Base64-encoded content (${full.contentType}):\n${full.contentBytes}`;
  }

  const parts = [header];
  if (warning) {
    parts.push(`\nWarnung: ${warning}`);
  }
  parts.push(`\n${body}`);

  return { content: [{ type: "text", text: parts.join("\n") }] };
}

async function handleDownloadAttachment(
  graphClient: Client,
  parsed: DownloadAttachmentParamsType,
): Promise<ToolResult> {
  const startTime = Date.now();
  const userPath = resolveUserPath(parsed.user_id);
  const apiPath = `${userPath}/messages/${encodeURIComponent(parsed.message_id)}/attachments/${encodeURIComponent(parsed.attachment_id)}`;

  // Step 1: Metadata-only GET
  const meta = (await graphClient
    .api(apiPath)
    .select("@odata.type,name,contentType,size,isInline,contentId")
    .get()) as AttachmentMetadata;

  // Type check
  const unsupported = checkUnsupportedType(meta["@odata.type"]);
  if (unsupported) return unsupported;

  // Size check: >10MB → abort
  if (meta.size > SIZE_ABORT_THRESHOLD) {
    logger.warn(
      { tool: "download_attachment", sizeBytes: meta.size, duration_ms: Date.now() - startTime },
      "download_attachment aborted: file too large",
    );
    return {
      content: [
        {
          type: "text",
          text: `Anhang zu groß: ${formatFileSize(meta.size)} (max. 10 MB). Der Download wurde abgebrochen.`,
        },
      ],
      isError: true,
    };
  }

  // Size warning: >4MB
  const warning =
    meta.size > SIZE_WARNING_THRESHOLD
      ? `Dieser Anhang ist ${formatFileSize(meta.size)} groß.`
      : null;

  // Step 2: Full GET (with contentBytes)
  const full = (await graphClient.api(apiPath).get()) as FileAttachmentFull;

  const endTime = Date.now();
  logger.info(
    {
      tool: "download_attachment",
      contentType: meta.contentType,
      sizeBytes: meta.size,
      status: 200,
      duration_ms: endTime - startTime,
    },
    "download_attachment completed",
  );

  return buildDownloadResult(full, warning);
}

export function registerMailAttachmentTools(
  server: McpServer,
  graphClient: Client,
  _config: Config,
): void {
  server.tool(
    "list_attachments",
    "List all attachments of an email with name, type, size, and inline status. Use download_attachment to retrieve file content.",
    ListAttachmentsParams.shape,
    async (params) => {
      try {
        const parsed = ListAttachmentsParams.parse(params);
        return await handleListAttachments(graphClient, parsed);
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "list_attachments", status: error.httpStatus, code: error.code },
            "list_attachments failed",
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
    "download_attachment",
    "Download a single attachment by ID. Only file attachments are supported. Text files are returned as UTF-8, binary files as base64. Files >4MB show a warning, >10MB are rejected.",
    DownloadAttachmentParams.shape,
    async (params) => {
      try {
        const parsed = DownloadAttachmentParams.parse(params);
        return await handleDownloadAttachment(graphClient, parsed);
      } catch (error) {
        if (error instanceof McpToolError) {
          logger.warn(
            { tool: "download_attachment", status: error.httpStatus, code: error.code },
            "download_attachment failed",
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
