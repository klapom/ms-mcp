import { z } from "zod";
import { BaseParams } from "./common.js";

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

/**
 * Paging fields shared by the OneDrive list tools. Graph does not support `$skip`
 * on driveItem children / search / recent - only opaque `$skiptoken` paging.
 * `top` may go up to 200 here (Graph maximum for children); ListParams stays at 100.
 */
const drivePagingFields = {
  top: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe("Maximum number of results per page (default: 25, max: 200)"),
  skip: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Not supported by OneDrive endpoints - use page_token instead."),
  page_token: z
    .string()
    .min(1)
    .max(4096)
    .optional()
    .describe(
      "Opaque token from the previous page's 'next page: page_token' hint. " +
        "Pass it unchanged, together with the same other parameters. Mutually exclusive with skip.",
    ),
};

// ---------------------------------------------------------------------------
// list_files
// ---------------------------------------------------------------------------

export const ListFilesParams = BaseParams.extend({
  ...drivePagingFields,
  ...driveLocationFields,
  folder_id: z
    .string()
    .optional()
    .describe("Folder ID to list children of. Mutually exclusive with path."),
  path: z
    .string()
    .optional()
    .describe(
      "Folder path relative to the drive root (e.g. '/Reports' or '/Brand/Logos'). " +
        "Do NOT prefix with '/Documents' — the drive root IS the Documents area in OneDrive Personal. " +
        "Empty string or '/' means root. Mutually exclusive with folder_id.",
    ),
});
export type ListFilesParamsType = z.infer<typeof ListFilesParams>;

// ---------------------------------------------------------------------------
// search_files
// ---------------------------------------------------------------------------

export const SearchFilesParams = BaseParams.extend({
  ...drivePagingFields,
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
  file_id: z
    .string()
    .min(1)
    .describe(
      "Either a Graph item ID (opaque string) OR a drive-root-relative path starting with '/' " +
        "(e.g. '/Brand/Logos/logo.svg'). Do NOT prefix paths with '/Documents'.",
    ),
});
export type DownloadFileParamsType = z.infer<typeof DownloadFileParams>;

// ---------------------------------------------------------------------------
// get_recent_files
// ---------------------------------------------------------------------------

export const GetRecentFilesParams = BaseParams.extend(drivePagingFields);
export type GetRecentFilesParamsType = z.infer<typeof GetRecentFilesParams>;
