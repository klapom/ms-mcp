import { z } from "zod";
import { BaseParams, ListParams } from "./common.js";

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
  message_id: z.string().min(1).describe("ID der E-Mail (aus list_emails oder search_emails)"),
  format: z
    .enum(["text", "html"])
    .default("text")
    .describe("Body-Format: 'text' konvertiert HTML zu Plain-Text, 'html' liefert Original-HTML"),
  max_body_length: z
    .number()
    .int()
    .positive()
    .max(50000)
    .optional()
    .describe(
      "Maximale Body-Länge in Zeichen (1–50000). Standard für read_email: 5000. Für vollständigen Body explizit 50000 angeben.",
    ),
  include_internet_headers: z
    .boolean()
    .default(false)
    .describe(
      "Wenn true, werden Internet-Message-Headers wie Message-ID und In-Reply-To mitgeliefert",
    ),
});

export type ReadEmailParamsType = z.infer<typeof ReadEmailParams>;

/**
 * Parameters for list_mail_folders tool.
 */
export const ListMailFoldersParams = ListParams.extend({
  include_children: z
    .boolean()
    .default(false)
    .describe(
      "Wenn true, werden auch Unterordner (1 Ebene tief) mit $expand=childFolders aufgelistet",
    ),
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
      "KQL-Suchbegriff, z.B. 'subject:Angebot', 'from:mueller', 'body:Projekt AND hasAttachments:true'",
    ),
  folder: z
    .string()
    .optional()
    .describe("Mail-Ordner einschränken (well-known name oder ID). Default: alle Ordner"),
  filter: z
    .string()
    .optional()
    .describe("Zusätzlicher OData $filter, z.B. 'receivedDateTime ge 2025-01-01T00:00:00Z'"),
  orderby: z
    .string()
    .optional()
    .describe(
      "OData $orderby — ACHTUNG: kann NICHT mit $search kombiniert werden. Wird bei $search ignoriert.",
    ),
});

export type SearchEmailsParamsType = z.infer<typeof SearchEmailsParams>;
