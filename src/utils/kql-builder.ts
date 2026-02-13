/**
 * KQL (Keyword Query Language) builder utilities for Microsoft Graph Search API.
 *
 * KQL is used by POST /search/query to express complex search queries.
 * See: https://learn.microsoft.com/en-us/graph/search-concept-kql
 */

export interface KqlFilter {
  property: string;
  operator: "=" | ":" | ">=" | "<=" | ">" | "<";
  value: string;
}

/**
 * Builds a KQL query string from structured filters.
 * Values containing spaces are automatically quoted.
 *
 * Example:
 *   buildKqlQuery([
 *     { property: "from", operator: ":", value: "john@example.com" },
 *     { property: "subject", operator: ":", value: "quarterly report" },
 *   ])
 *   // → 'from:john@example.com subject:"quarterly report"'
 */
export function buildKqlQuery(filters: KqlFilter[]): string {
  return filters
    .map((f) => {
      const value = f.value.includes(" ") ? `"${f.value}"` : f.value;
      return `${f.property}${f.operator}${value}`;
    })
    .join(" ");
}

/**
 * Converts an ISO 8601 datetime string to KQL date format (YYYY-MM-DD).
 * KQL date comparisons use the date portion only.
 *
 * Example: parseKqlDate("2026-02-15T10:00:00Z") → "2026-02-15"
 */
export function parseKqlDate(dateStr: string): string {
  return dateStr.split("T")[0];
}

/**
 * Sanitizes a user-provided KQL query string by trimming whitespace.
 * The actual KQL syntax validation is delegated to the Graph API,
 * which returns HTTP 400 for invalid queries.
 */
export function sanitizeKqlQuery(query: string): string {
  return query.trim();
}
