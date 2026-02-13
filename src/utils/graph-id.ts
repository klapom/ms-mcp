/**
 * Encodes a Graph API resource ID for safe use in URL path segments.
 *
 * Graph API IDs (especially message IDs, folder IDs, attachment IDs) are often
 * Base64-encoded strings that may contain characters like +, /, = which must
 * be percent-encoded when used in URL paths.
 */
export function encodeGraphId(id: string): string {
  // Encode URI-unsafe characters but preserve commas, which are used
  // in SharePoint composite site IDs (e.g. "hostname,guid,guid")
  // and are valid in URL path segments (RFC 3986 sub-delims).
  return encodeURIComponent(id).replace(/%2C/gi, ",");
}
