import { z } from "zod";
import { BaseParams, ListParams, WriteParams } from "./common.js";

/**
 * Parameters for list_emails tool.
 */
export const ListEmailsParams = ListParams.extend({
  folder: z
    .string()
    .optional()
    .describe("Mail folder ID or well-known name (inbox, sentitems, drafts, etc.). Default: inbox"),
  filter: z
    .string()
    .optional()
    .describe(
      "OData $filter expression, e.g. 'isRead eq false' or \"from/emailAddress/address eq 'user@example.com'\"",
    ),
  search: z.string().optional().describe("KQL search query, e.g. 'subject:important'"),
  orderby: z
    .string()
    .optional()
    .describe("OData $orderby expression. Default: receivedDateTime desc"),
});

export type ListEmailsParamsType = z.infer<typeof ListEmailsParams>;

/**
 * Parameters for read_email tool.
 */
export const ReadEmailParams = BaseParams.extend({
  message_id: z.string().min(1).describe("ID of the email (from list_emails or search_emails)"),
  format: z
    .enum(["text", "html"])
    .default("text")
    .describe("Body format: 'text' converts HTML to plain text, 'html' returns original HTML"),
  max_body_length: z
    .number()
    .int()
    .positive()
    .max(50000)
    .optional()
    .describe(
      "Maximum body length in characters (1–50000). Default for read_email: 5000. For full body, specify 50000 explicitly.",
    ),
  include_internet_headers: z
    .boolean()
    .default(false)
    .describe("If true, includes Internet message headers like Message-ID and In-Reply-To"),
});

export type ReadEmailParamsType = z.infer<typeof ReadEmailParams>;

/**
 * Parameters for list_mail_folders tool.
 */
export const ListMailFoldersParams = ListParams.extend({
  include_children: z
    .boolean()
    .default(false)
    .describe("If true, also lists subfolders (1 level deep) via $expand=childFolders"),
});

export type ListMailFoldersParamsType = z.infer<typeof ListMailFoldersParams>;

/**
 * Parameters for search_emails tool.
 */
export const SearchEmailsParams = ListParams.extend({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "KQL search query, e.g. 'subject:important', 'from:mueller', 'body:project AND hasAttachments:true'",
    ),
  folder: z
    .string()
    .optional()
    .describe("Restrict to mail folder (well-known name or ID). Default: all folders"),
  filter: z
    .string()
    .optional()
    .describe("Additional OData $filter, e.g. 'receivedDateTime ge 2025-01-01T00:00:00Z'"),
  orderby: z
    .string()
    .optional()
    .describe(
      "OData $orderby — NOTE: cannot be combined with $search. Ignored when $search is used.",
    ),
});

export type SearchEmailsParamsType = z.infer<typeof SearchEmailsParams>;

/**
 * Parameters for send_email tool.
 */
export const SendEmailParams = WriteParams.extend({
  to: z
    .array(z.string().email("Invalid email address"))
    .min(1)
    .max(500)
    .describe("Recipient email addresses (min 1, max 500)"),
  cc: z.array(z.string().email()).max(500).optional().describe("CC recipients"),
  bcc: z.array(z.string().email()).max(500).optional().describe("BCC recipients"),
  subject: z.string().min(1).max(255).describe("Email subject"),
  body: z
    .string()
    .min(1)
    .max(100_000)
    .describe("Email body (plain text or HTML depending on body_type)"),
  body_type: z
    .enum(["text", "html"])
    .default("text")
    .describe("Body format: 'text' for plain text, 'html' for HTML"),
  importance: z.enum(["low", "normal", "high"]).default("normal").describe("Email importance"),
  save_to_sent_items: z
    .boolean()
    .default(true)
    .describe("Save email to Sent Items (default: true)"),
});

export type SendEmailParamsType = z.infer<typeof SendEmailParams>;

/**
 * Parameters for reply_email tool.
 */
export const ReplyEmailParams = WriteParams.extend({
  message_id: z.string().min(1).describe("ID of the original email to reply to"),
  comment: z
    .string()
    .min(1)
    .max(100_000)
    .describe("Reply text (added as comment above the original email)"),
  reply_all: z
    .boolean()
    .default(false)
    .describe("If true: reply to all recipients. If false: reply to sender only."),
});

export type ReplyEmailParamsType = z.infer<typeof ReplyEmailParams>;

/**
 * Parameters for forward_email tool.
 */
export const ForwardEmailParams = WriteParams.extend({
  message_id: z.string().min(1).describe("ID of the email to forward"),
  to: z
    .array(z.string().email("Invalid email address"))
    .min(1)
    .max(500)
    .describe("Forward recipients (min 1)"),
  comment: z
    .string()
    .max(100_000)
    .optional()
    .describe("Optional comment added above the forwarded email"),
});

export type ForwardEmailParamsType = z.infer<typeof ForwardEmailParams>;

/**
 * Parameters for move_email tool.
 */
export const MoveEmailParams = WriteParams.extend({
  message_id: z.string().min(1).describe("ID of the email"),
  destination_folder: z
    .string()
    .min(1)
    .describe("Destination folder: well-known name or folder ID"),
  dry_run: z.boolean().default(false).describe("Preview without execution, overrides confirm"),
});

export type MoveEmailParamsType = z.infer<typeof MoveEmailParams>;

/**
 * Parameters for list_attachments tool.
 */
export const ListAttachmentsParams = BaseParams.extend({
  message_id: z.string().min(1).describe("ID der E-Mail"),
});

export type ListAttachmentsParamsType = z.infer<typeof ListAttachmentsParams>;

/**
 * Parameters for download_attachment tool.
 */
export const DownloadAttachmentParams = BaseParams.extend({
  message_id: z.string().min(1).describe("ID der E-Mail"),
  attachment_id: z.string().min(1).describe("ID des Anhangs (aus list_attachments)"),
});

export type DownloadAttachmentParamsType = z.infer<typeof DownloadAttachmentParams>;
