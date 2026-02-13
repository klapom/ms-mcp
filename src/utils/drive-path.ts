import { encodeGraphId } from "./graph-id.js";

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
  const userPath = userId ? `/users/${encodeGraphId(userId)}` : "/me";
  return `${userPath}/drive`;
}
