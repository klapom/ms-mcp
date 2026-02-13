import { z } from "zod";
import { BaseParams, WriteParams } from "./common.js";

/**
 * Schema for deleting an email.
 */
export const DeleteEmailParams = WriteParams.extend({
  message_id: z.string().min(1).describe("Message ID to delete"),
});

/**
 * Schema for creating a draft email.
 */
export const CreateDraftParams = WriteParams.extend({
  subject: z.string().optional().describe("Email subject"),
  body: z.string().optional().describe("Email body content"),
  body_type: z.enum(["text", "html"]).default("text").describe("Body content type"),
  to: z
    .array(
      z.object({
        address: z.string().min(1),
        name: z.string().optional(),
      }),
    )
    .optional()
    .describe("To recipients"),
  cc: z
    .array(
      z.object({
        address: z.string().min(1),
        name: z.string().optional(),
      }),
    )
    .optional()
    .describe("CC recipients"),
  bcc: z
    .array(
      z.object({
        address: z.string().min(1),
        name: z.string().optional(),
      }),
    )
    .optional()
    .describe("BCC recipients"),
  importance: z.enum(["low", "normal", "high"]).default("normal").describe("Message importance"),
  save_to_sent_items: z.boolean().default(true).describe("Save to Sent Items after sending"),
});

/**
 * Schema for sending a draft email.
 */
export const SendDraftParams = WriteParams.extend({
  message_id: z.string().min(1).describe("Draft message ID to send"),
});

/**
 * Schema for adding an attachment to a message.
 */
export const AddAttachmentParams = WriteParams.extend({
  message_id: z.string().min(1).describe("Message ID to attach to"),
  name: z.string().min(1).describe("Attachment filename"),
  content_bytes: z.string().min(1).describe("Base64-encoded file content"),
  content_type: z.string().optional().describe("MIME type (e.g., application/pdf)"),
  is_inline: z.boolean().default(false).describe("Whether attachment is inline"),
});

/**
 * Schema for creating a mail folder.
 */
export const CreateMailFolderParams = WriteParams.extend({
  display_name: z.string().min(1).max(255).describe("Folder display name"),
  parent_folder_id: z
    .string()
    .min(1)
    .optional()
    .describe("Parent folder ID. Defaults to mailFolders root"),
});

/**
 * Schema for flagging an email.
 */
export const FlagEmailParams = WriteParams.extend({
  message_id: z.string().min(1).describe("Message ID to flag"),
  flag_status: z.enum(["flagged", "complete", "notFlagged"]).describe("Flag status to set"),
  due_date: z.string().optional().describe("Due date (ISO 8601)"),
  start_date: z.string().optional().describe("Start date (ISO 8601)"),
  completion_date: z.string().optional().describe("Completion date (ISO 8601)"),
});

/**
 * Schema for listing mail rules.
 */
export const ListMailRulesParams = BaseParams.extend({
  top: z.number().int().positive().max(999).optional().describe("Maximum number of results"),
  skip: z.number().int().nonnegative().optional().describe("Number of results to skip"),
});
