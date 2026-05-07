import { encodeGraphId } from "./graph-id.js";
import { createLogger } from "./logger.js";

const logger = createLogger("utils:drive-path");

/**
 * Resolves the Graph API drive base path, supporting:
 * - OneDrive personal: /me/drive (default)
 * - Multi-tenant OneDrive: /users/{userId}/drive
 * - SharePoint document library: /sites/{siteId}/drives/{driveId}
 */
export function resolveDrivePath(userId?: string, siteId?: string, driveId?: string): string {
  if (siteId && driveId) {
    return `/sites/${encodeGraphId(siteId)}/drives/${encodeGraphId(driveId)}`;
  }
  const normalizedUserId = normalizeUserId(userId);
  const userPath = normalizedUserId ? `/users/${encodeGraphId(normalizedUserId)}` : "/me";
  return `${userPath}/drive`;
}

/**
 * LLMs frequently pass literal strings like "/me" or "me" as user_id because
 * they mirror the Graph API's `/me` endpoint. Those values are not valid user
 * identifiers and produce 404s when spliced into `/users/<id>/drive`. Treat
 * them as "no user_id" so the call falls back to `/me` as intended.
 */
export function normalizeUserId(userId?: string): string | undefined {
  if (!userId) return undefined;
  const trimmed = userId.trim().replace(/^\/+/, "");
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "me") return undefined;
  return trimmed;
}

/**
 * Normalizes a user-supplied drive path.
 *
 * OneDrive Personal/Business exposes the default library root directly (no
 * `/Documents` segment). LLMs frequently prefix paths with `/Documents` out of
 * habit — Graph answers those with 404. When no SharePoint site is addressed,
 * we transparently strip a leading `/Documents/` (or `/Documents`) so the call
 * succeeds instead of surfacing a confusing NotFound.
 *
 * On SharePoint sites `/Documents` CAN be a real folder, so we leave it alone
 * when siteId is set.
 *
 * Returns the path unchanged if nothing needs to be stripped.
 */
export function normalizeDrivePath(path: string, siteId?: string): string {
  if (siteId) return path;
  // Match "/Documents" or "/Documents/…" (case-insensitive), strip the prefix.
  const match = path.match(/^\/+Documents(\/.*)?$/i);
  if (!match) return path;
  const stripped = match[1] ?? "/";
  logger.warn(
    { original: path, normalized: stripped },
    "stripped /Documents prefix from personal-drive path",
  );
  return stripped;
}
