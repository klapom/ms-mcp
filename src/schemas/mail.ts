import { z } from "zod";
import { BaseParams, ListParams, WriteParams } from "./common.js";

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

/**
 * Parameters for send_email tool.
 */
export const SendEmailParams = WriteParams.extend({
  to: z
    .array(z.string().email("Ungültige E-Mail-Adresse"))
    .min(1)
    .max(500)
    .describe("Empfänger-E-Mail-Adressen (mindestens 1, max 500)"),
  cc: z.array(z.string().email()).max(500).optional().describe("CC-Empfänger"),
  bcc: z.array(z.string().email()).max(500).optional().describe("BCC-Empfänger"),
  subject: z.string().min(1).max(255).describe("Betreff der E-Mail"),
  body: z
    .string()
    .min(1)
    .max(100_000)
    .describe("E-Mail-Body (Plain-Text oder HTML je nach body_type)"),
  body_type: z
    .enum(["text", "html"])
    .default("text")
    .describe("Body-Format: 'text' für Plain-Text, 'html' für HTML"),
  importance: z
    .enum(["low", "normal", "high"])
    .default("normal")
    .describe("Wichtigkeit der E-Mail"),
  save_to_sent_items: z
    .boolean()
    .default(true)
    .describe("E-Mail in 'Gesendete Elemente' speichern (default: true)"),
});

export type SendEmailParamsType = z.infer<typeof SendEmailParams>;

/**
 * Parameters for reply_email tool.
 */
export const ReplyEmailParams = WriteParams.extend({
  message_id: z.string().min(1).describe("ID der Original-E-Mail, auf die geantwortet wird"),
  comment: z
    .string()
    .min(1)
    .max(100_000)
    .describe("Antwort-Text (wird als Kommentar über die Original-Mail gesetzt)"),
  reply_all: z
    .boolean()
    .default(false)
    .describe("Wenn true: Reply-All an alle Empfänger. Wenn false: nur an den Absender."),
});

export type ReplyEmailParamsType = z.infer<typeof ReplyEmailParams>;

/**
 * Parameters for forward_email tool.
 */
export const ForwardEmailParams = WriteParams.extend({
  message_id: z.string().min(1).describe("ID der E-Mail, die weitergeleitet werden soll"),
  to: z
    .array(z.string().email("Ungültige E-Mail-Adresse"))
    .min(1)
    .max(500)
    .describe("Empfänger der Weiterleitung (mindestens 1)"),
  comment: z
    .string()
    .max(100_000)
    .optional()
    .describe("Optionaler Kommentar, der über die weitergeleitete E-Mail gesetzt wird"),
});

export type ForwardEmailParamsType = z.infer<typeof ForwardEmailParams>;

/**
 * Parameters for move_email tool.
 */
export const MoveEmailParams = WriteParams.extend({
  message_id: z.string().min(1).describe("ID der E-Mail"),
  destination_folder: z.string().min(1).describe("Zielordner: Well-Known-Name oder Folder-ID"),
  dry_run: z.boolean().default(false).describe("Vorschau ohne Ausführung, überschreibt confirm"),
});

export type MoveEmailParamsType = z.infer<typeof MoveEmailParams>;

/**
 * Parameters for list_attachments tool.
 */
export const ListAttachmentsParams = BaseParams.extend({
  message_id: z.string().min(1).describe("ID der E-Mail"),
});

export type ListAttachmentsParamsType = z.infer<typeof ListAttachmentsParams>;

/**
 * Parameters for download_attachment tool.
 */
export const DownloadAttachmentParams = BaseParams.extend({
  message_id: z.string().min(1).describe("ID der E-Mail"),
  attachment_id: z.string().min(1).describe("ID des Anhangs (aus list_attachments)"),
});

export type DownloadAttachmentParamsType = z.infer<typeof DownloadAttachmentParams>;
