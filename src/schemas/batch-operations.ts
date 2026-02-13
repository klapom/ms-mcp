import { z } from "zod";
import { WriteParams } from "./common.js";

/**
 * Batch move emails — move up to 20 emails to a target folder.
 */
export const BatchMoveEmailsParams = WriteParams.extend({
  message_ids: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe("Array of email IDs to move (max 20)"),
  destination_folder_id: z.string().min(1).describe("Target folder ID"),
});

export type BatchMoveEmailsParamsType = z.infer<typeof BatchMoveEmailsParams>;

/**
 * Batch delete emails — permanently delete up to 20 emails.
 */
export const BatchDeleteEmailsParams = WriteParams.extend({
  message_ids: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe("Array of email IDs to delete (max 20)"),
});

export type BatchDeleteEmailsParamsType = z.infer<typeof BatchDeleteEmailsParams>;

/**
 * Batch flag emails — flag/unflag up to 20 emails.
 */
export const BatchFlagEmailsParams = WriteParams.extend({
  message_ids: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe("Array of email IDs to flag (max 20)"),
  flag_status: z
    .enum(["flagged", "complete", "notFlagged"])
    .describe("Flag status to apply to all emails"),
  due_date: z.string().optional().describe("Due date (ISO 8601, applied to all)"),
});

export type BatchFlagEmailsParamsType = z.infer<typeof BatchFlagEmailsParams>;

/**
 * Batch delete events — delete up to 20 calendar events.
 */
export const BatchDeleteEventsParams = WriteParams.extend({
  event_ids: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe("Array of event IDs to delete (max 20)"),
  send_cancellation_notifications: z
    .boolean()
    .default(true)
    .describe("Send meeting cancellation emails"),
});

export type BatchDeleteEventsParamsType = z.infer<typeof BatchDeleteEventsParams>;

/**
 * Batch move files — move up to 20 OneDrive files/folders.
 */
export const BatchMoveFilesParams = WriteParams.extend({
  file_ids: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe("Array of file/folder IDs to move (max 20)"),
  destination_folder_id: z.string().min(1).describe("Target folder ID"),
});

export type BatchMoveFilesParamsType = z.infer<typeof BatchMoveFilesParams>;
