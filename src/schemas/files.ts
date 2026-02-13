import { z } from "zod";
import { BaseParams, ListParams } from "./common.js";

const driveLocationFields = {
  site_id: z
    .string()
    .min(1)
    .optional()
    .describe("SharePoint site ID. Use with drive_id to access a SharePoint document library."),
  drive_id: z
    .string()
    .min(1)
    .optional()
    .describe("Drive ID within a SharePoint site. Use with site_id."),
};

// ---------------------------------------------------------------------------
// list_files
// ---------------------------------------------------------------------------

export const ListFilesParams = ListParams.extend({
  ...driveLocationFields,
  folder_id: z
    .string()
    .optional()
    .describe("Folder ID to list children of. Mutually exclusive with path."),
  path: z
    .string()
    .optional()
    .describe("Folder path (e.g. '/Documents/Reports'). Mutually exclusive with folder_id."),
});
export type ListFilesParamsType = z.infer<typeof ListFilesParams>;

// ---------------------------------------------------------------------------
// search_files
// ---------------------------------------------------------------------------

export const SearchFilesParams = ListParams.extend({
  ...driveLocationFields,
  query: z
    .string()
    .min(1)
    .max(500)
    .describe("Search query for full-text search across file names and content."),
});
export type SearchFilesParamsType = z.infer<typeof SearchFilesParams>;

// ---------------------------------------------------------------------------
// get_file_metadata
// ---------------------------------------------------------------------------

export const GetFileMetadataParams = BaseParams.extend({
  ...driveLocationFields,
  file_id: z.string().min(1).describe("The ID of the file or folder."),
});
export type GetFileMetadataParamsType = z.infer<typeof GetFileMetadataParams>;

// ---------------------------------------------------------------------------
// download_file
// ---------------------------------------------------------------------------

export const DownloadFileParams = BaseParams.extend({
  ...driveLocationFields,
  file_id: z.string().min(1).describe("The ID of the file to download."),
});
export type DownloadFileParamsType = z.infer<typeof DownloadFileParams>;

// ---------------------------------------------------------------------------
// get_recent_files
// ---------------------------------------------------------------------------

export const GetRecentFilesParams = ListParams;
export type GetRecentFilesParamsType = z.infer<typeof GetRecentFilesParams>;
