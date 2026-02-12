/**
 * Encodes a Graph API resource ID for safe use in URL path segments.
 *
 * Graph API IDs (especially message IDs, folder IDs, attachment IDs) are often
 * Base64-encoded strings that may contain characters like +, /, = which must
 * be percent-encoded when used in URL paths.
 */
export function encodeGraphId(id: string): string {
  return encodeURIComponent(id);
}
