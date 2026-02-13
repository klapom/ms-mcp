import { z } from "zod";
import { ListParams } from "./common.js";

/**
 * Parameters for advanced_search_emails (POST /search/query with entityTypes: ["message"]).
 */
export const AdvancedSearchEmailsParams = ListParams.extend({
  kql_query: z
    .string()
    .min(1)
    .max(1000)
    .describe(
      "KQL query for email search. Examples: 'from:john@example.com', 'subject:\"quarterly report\"', 'hasAttachment:true received>=2026-01-01'",
    ),
  from: z.number().int().min(0).optional().describe("Result offset for pagination (default 0)"),
  size: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Number of results to return (default 25, max 50)"),
  enable_query_interpretation: z
    .boolean()
    .default(true)
    .describe("Enable query spelling correction and interpretation"),
  sort: z
    .array(
      z.object({
        property: z.enum(["receivedDateTime", "from", "subject"]),
        direction: z.enum(["ascending", "descending"]),
      }),
    )
    .optional()
    .describe("Sort criteria for results"),
});

export type AdvancedSearchEmailsParamsType = z.infer<typeof AdvancedSearchEmailsParams>;

/**
 * Parameters for search_events (POST /search/query with entityTypes: ["event"]).
 */
export const SearchEventsParams = ListParams.extend({
  kql_query: z
    .string()
    .min(1)
    .max(1000)
    .describe(
      "KQL query for event search. Examples: 'subject:\"sprint planning\"', 'location:\"conference room\"', 'attendees:john@example.com'",
    ),
  from: z.number().int().min(0).optional().describe("Result offset for pagination (default 0)"),
  size: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Number of results to return (default 25, max 50)"),
});

export type SearchEventsParamsType = z.infer<typeof SearchEventsParams>;

/**
 * Parameters for advanced_search_contacts (POST /search/query with entityTypes: ["person"]).
 */
export const AdvancedSearchContactsParams = ListParams.extend({
  kql_query: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "KQL query for contact search. Examples: 'displayName:john', 'emailAddress:@example.com', 'companyName:Microsoft'",
    ),
  from: z.number().int().min(0).optional().describe("Result offset for pagination (default 0)"),
  size: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Number of results to return (default 25, max 50)"),
});

export type AdvancedSearchContactsParamsType = z.infer<typeof AdvancedSearchContactsParams>;

/**
 * Parameters for search_teams_messages (POST /search/query with entityTypes: ["chatMessage"]).
 */
export const SearchTeamsMessagesParams = ListParams.extend({
  kql_query: z
    .string()
    .min(1)
    .max(1000)
    .describe(
      "KQL query for Teams message search. Examples: 'from:user@example.com', 'body:budget', 'created>=2026-01-01'",
    ),
  from: z.number().int().min(0).optional().describe("Result offset for pagination (default 0)"),
  size: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Number of results to return (default 25, max 50)"),
});

export type SearchTeamsMessagesParamsType = z.infer<typeof SearchTeamsMessagesParams>;

/**
 * Parameters for search_all (POST /search/query with multiple entityTypes).
 */
export const SearchAllParams = ListParams.extend({
  query: z.string().min(1).max(500).describe("Search query applied to all selected entity types"),
  entity_types: z
    .array(z.enum(["message", "event", "driveItem", "person", "chatMessage"]))
    .optional()
    .describe("Filter by entity types (default: all types)"),
  from: z.number().int().min(0).optional().describe("Result offset for pagination (default 0)"),
  size: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("Results per entity type (default 10, max 25)"),
});

export type SearchAllParamsType = z.infer<typeof SearchAllParams>;
