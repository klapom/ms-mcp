import { z } from "zod";
import { WriteParams } from "./common.js";

// ---------------------------------------------------------------------------
// upload_file
// ---------------------------------------------------------------------------

export const UploadFileParams = WriteParams.extend({
  path: z.string().min(1).describe("Destination path in OneDrive (e.g. '/Documents/report.pdf')."),
  content: z.string().min(1).describe("Base64-encoded file content."),
});
export type UploadFileParamsType = z.infer<typeof UploadFileParams>;

// ---------------------------------------------------------------------------
// create_folder
// ---------------------------------------------------------------------------

export const CreateFolderParams = WriteParams.extend({
  name: z.string().min(1).describe("Name of the new folder."),
  parent_id: z
    .string()
    .optional()
    .describe("Parent folder ID. Mutually exclusive with parent_path. Default: root."),
  parent_path: z
    .string()
    .optional()
    .describe("Parent folder path (e.g. '/Documents'). Mutually exclusive with parent_id."),
});
export type CreateFolderParamsType = z.infer<typeof CreateFolderParams>;

// ---------------------------------------------------------------------------
// move_file
// ---------------------------------------------------------------------------

export const MoveFileParams = WriteParams.extend({
  file_id: z.string().min(1).describe("ID of the file or folder to move."),
  destination_folder_id: z.string().min(1).describe("ID of the destination folder."),
  new_name: z.string().optional().describe("Optional new name for the moved item."),
});
export type MoveFileParamsType = z.infer<typeof MoveFileParams>;

// ---------------------------------------------------------------------------
// copy_file
// ---------------------------------------------------------------------------

export const CopyFileParams = WriteParams.extend({
  file_id: z.string().min(1).describe("ID of the file or folder to copy."),
  destination_folder_id: z.string().min(1).describe("ID of the destination folder."),
  new_name: z.string().optional().describe("Optional new name for the copy."),
});
export type CopyFileParamsType = z.infer<typeof CopyFileParams>;

// ---------------------------------------------------------------------------
// share_file
// ---------------------------------------------------------------------------

export const ShareFileParams = WriteParams.extend({
  file_id: z.string().min(1).describe("ID of the file or folder to share."),
  link_type: z
    .enum(["view", "edit"])
    .describe("Type of sharing link: 'view' (read-only) or 'edit' (read-write)."),
  scope: z
    .enum(["organization", "anonymous"])
    .describe("Link scope: 'organization' (tenant only) or 'anonymous' (anyone with link)."),
});
export type ShareFileParamsType = z.infer<typeof ShareFileParams>;
