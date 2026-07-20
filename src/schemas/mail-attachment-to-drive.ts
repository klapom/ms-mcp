import { z } from "zod";
import { WriteParams } from "./common.js";

// ---------------------------------------------------------------------------
// save_attachment_to_drive
// ---------------------------------------------------------------------------

/**
 * Parameters for saving an email attachment directly into OneDrive.
 *
 * Identity is deliberately narrowed to `user_id` only (inherited from
 * WriteParams → BaseParams). Unlike the generic drive-write tools, this tool
 * does NOT expose `site_id`/`drive_id`: the same `user_id` must address both
 * the mailbox the attachment is read from and the drive it is written to, so
 * there is no identity-pinning escape hatch to a different drive.
 */
export const SaveAttachmentToDriveParams = WriteParams.extend({
  message_id: z.string().min(1).describe("ID of the email message that holds the attachment."),
  attachment_id: z.string().min(1).describe("ID of the attachment to save."),
  folder_path: z
    .string()
    .default("/")
    .describe("Destination folder in OneDrive (e.g. '/Invoices'). Default: root."),
  file_name: z
    .string()
    .optional()
    .describe(
      "Destination file name. If omitted, the attachment's own name is used. If that " +
        "name is not a safe OneDrive file name, supply this explicitly (it is not rewritten).",
    ),
});
export type SaveAttachmentToDriveParamsType = z.infer<typeof SaveAttachmentToDriveParams>;
