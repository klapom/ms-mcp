import { z } from "zod";
import { ListParams } from "./common.js";

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
