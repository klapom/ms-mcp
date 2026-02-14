import { z } from "zod";
import { BaseParams, ListParams, WriteParams } from "./common.js";

/**
 * Schema for listing OneNote notebooks
 * GET /me/onenote/notebooks
 */
export const ListNotebooksParams = ListParams;
export type ListNotebooksParamsType = z.infer<typeof ListNotebooksParams>;

/**
 * Schema for listing sections in a notebook
 * GET /onenote/notebooks/{id}/sections
 */
export const ListSectionsParams = ListParams.extend({
  notebook_id: z.string().min(1).describe("ID of the notebook to list sections from"),
});
export type ListSectionsParamsType = z.infer<typeof ListSectionsParams>;

/**
 * Schema for listing pages in a section
 * GET /onenote/sections/{id}/pages
 */
export const ListPagesParams = ListParams.extend({
  section_id: z.string().min(1).describe("ID of the section to list pages from"),
});
export type ListPagesParamsType = z.infer<typeof ListPagesParams>;

/**
 * Schema for getting page content
 * GET /onenote/pages/{id}/content
 */
export const GetPageContentParams = BaseParams.extend({
  page_id: z.string().min(1).describe("ID of the page to retrieve content"),
  include_images: z
    .boolean()
    .default(false)
    .describe("Extract images as base64 (may increase response size significantly)"),
});
export type GetPageContentParamsType = z.infer<typeof GetPageContentParams>;

/**
 * Schema for creating a new page
 * POST /onenote/sections/{id}/pages
 */
export const CreatePageParams = WriteParams.extend({
  section_id: z.string().min(1).describe("ID of the section to create page in"),
  title: z.string().min(1).max(255).describe("Page title (max 255 characters)"),
  content: z
    .string()
    .min(1)
    .describe("HTML content (will be wrapped in proper OneNote HTML structure)"),
});
export type CreatePageParamsType = z.infer<typeof CreatePageParams>;

/**
 * Schema for searching notes
 * GET /me/onenote/pages?$search={query}
 */
export const SearchNotesParams = ListParams.extend({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe("Search query (full-text search across title and content)"),
});
export type SearchNotesParamsType = z.infer<typeof SearchNotesParams>;
