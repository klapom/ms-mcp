import { z } from "zod";
import { BaseParams, WriteParams } from "./common.js";

/**
 * Schema for upload_large_file (resumable upload for files >4MB).
 */
export const UploadLargeFileParams = WriteParams.extend({
  folder_id: z
    .string()
    .optional()
    .describe("Target folder ID (default: root). Use drive_id/site_id for non-user drives."),
  file_name: z
    .string()
    .min(1)
    .max(255)
    .describe("Name of file to create. Must not contain invalid characters."),
  content_bytes: z
    .string()
    .min(1)
    .describe("Base64-encoded file content. No size limit (chunked upload)."),
  conflict_behavior: z
    .enum(["fail", "replace", "rename"])
    .default("fail")
    .describe(
      "How to handle existing file with same name: fail (error), replace (overwrite), rename (add suffix).",
    ),
  site_id: z.string().optional().describe("SharePoint site ID (for SharePoint files)."),
  drive_id: z.string().optional().describe("Drive ID (for non-user drives)."),
});

export type UploadLargeFileParamsType = z.infer<typeof UploadLargeFileParams>;

/**
 * Schema for attach_item (embed email/event/contact as itemAttachment).
 */
export const AttachItemParams = WriteParams.extend({
  message_id: z.string().min(1).describe("ID of the draft or sent message to attach to."),
  item_type: z
    .enum(["message", "event", "contact"])
    .describe("Type of item to embed: message (email), event (meeting), contact."),
  item_id: z
    .string()
    .min(1)
    .describe("ID of the item to embed (message/event/contact ID from Graph API)."),
  name: z
    .string()
    .optional()
    .describe(
      "Display name for the attachment. If omitted, uses source item subject/title/displayName.",
    ),
});

export type AttachItemParamsType = z.infer<typeof AttachItemParams>;

/**
 * Schema for attach_reference (attach OneDrive/SharePoint file as link).
 */
export const AttachReferenceParams = WriteParams.extend({
  message_id: z.string().min(1).describe("ID of the draft or sent message to attach to."),
  file_id: z.string().min(1).describe("OneDrive or SharePoint file ID (driveItem ID)."),
  name: z
    .string()
    .optional()
    .describe("Display name for the attachment. If omitted, uses file name."),
  permission_type: z
    .enum(["view", "edit"])
    .default("view")
    .describe("Link permission level: view (read-only) or edit (read-write)."),
  site_id: z.string().optional().describe("SharePoint site ID (for SharePoint files)."),
  drive_id: z.string().optional().describe("Drive ID (for non-user drives)."),
});

export type AttachReferenceParamsType = z.infer<typeof AttachReferenceParams>;

/**
 * Schema for poll_copy_status (check async file copy progress).
 */
export const PollCopyStatusParams = BaseParams.extend({
  monitor_url: z
    .string()
    .url()
    .describe(
      "Status monitor URL returned in Location header from copy_file. Format: https://graph.microsoft.com/v1.0/...",
    ),
});

export type PollCopyStatusParamsType = z.infer<typeof PollCopyStatusParams>;
