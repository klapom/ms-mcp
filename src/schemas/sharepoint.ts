import { z } from "zod";
import { BaseParams, ListParams, WriteParams } from "./common.js";

// ---------------------------------------------------------------------------
// search_sites
// ---------------------------------------------------------------------------

export const SearchSitesParams = ListParams.extend({
  query: z.string().min(1).max(200).describe("Search query for finding SharePoint sites."),
});
export type SearchSitesParamsType = z.infer<typeof SearchSitesParams>;

// ---------------------------------------------------------------------------
// get_site
// ---------------------------------------------------------------------------

export const GetSiteParams = BaseParams.extend({
  site_id: z
    .string()
    .min(1)
    .optional()
    .describe("The site ID. Mutually exclusive with hostname + site_path."),
  hostname: z
    .string()
    .optional()
    .describe("SharePoint hostname (e.g. 'contoso.sharepoint.com'). Use with site_path."),
  site_path: z
    .string()
    .optional()
    .describe("Site path (e.g. '/sites/engineering'). Use with hostname."),
});
export type GetSiteParamsType = z.infer<typeof GetSiteParams>;

// ---------------------------------------------------------------------------
// list_site_drives
// ---------------------------------------------------------------------------

export const ListSiteDrivesParams = ListParams.extend({
  site_id: z.string().min(1).describe("The ID of the SharePoint site."),
});
export type ListSiteDrivesParamsType = z.infer<typeof ListSiteDrivesParams>;

// ---------------------------------------------------------------------------
// list_site_lists
// ---------------------------------------------------------------------------

export const ListSiteListsParams = ListParams.extend({
  site_id: z.string().min(1).describe("The ID of the SharePoint site."),
  include_hidden: z.boolean().default(false).describe("Include hidden lists (default: false)."),
});
export type ListSiteListsParamsType = z.infer<typeof ListSiteListsParams>;

// ---------------------------------------------------------------------------
// list_list_items
// ---------------------------------------------------------------------------

export const ListListItemsParams = ListParams.extend({
  site_id: z.string().min(1).describe("The ID of the SharePoint site."),
  list_id: z.string().min(1).describe("The ID of the list."),
  filter: z.string().optional().describe("OData $filter expression for list items."),
  orderby: z.string().optional().describe("OData $orderby expression."),
});
export type ListListItemsParamsType = z.infer<typeof ListListItemsParams>;

// ---------------------------------------------------------------------------
// create_list_item
// ---------------------------------------------------------------------------

export const CreateListItemParams = WriteParams.extend({
  site_id: z.string().min(1).describe("The ID of the SharePoint site."),
  list_id: z.string().min(1).describe("The ID of the list."),
  fields: z.record(z.unknown()).describe("Field values for the new list item."),
});
export type CreateListItemParamsType = z.infer<typeof CreateListItemParams>;

// ---------------------------------------------------------------------------
// update_list_item
// ---------------------------------------------------------------------------

export const UpdateListItemParams = WriteParams.extend({
  site_id: z.string().min(1).describe("The ID of the SharePoint site."),
  list_id: z.string().min(1).describe("The ID of the list."),
  item_id: z.string().min(1).describe("The ID of the list item to update."),
  fields: z.record(z.unknown()).describe("Field values to update."),
});
export type UpdateListItemParamsType = z.infer<typeof UpdateListItemParams>;

// ---------------------------------------------------------------------------
// delete_list_item
// ---------------------------------------------------------------------------

export const DeleteListItemParams = WriteParams.extend({
  site_id: z.string().min(1).describe("The ID of the SharePoint site."),
  list_id: z.string().min(1).describe("The ID of the list."),
  item_id: z.string().min(1).describe("The ID of the list item to delete."),
});
export type DeleteListItemParamsType = z.infer<typeof DeleteListItemParams>;
