/**
 * Cache TTL (Time-To-Live) Configuration
 *
 * Defines how long different resource types should be cached.
 * Balances data freshness against API rate limit relief.
 */

/**
 * TTL values in milliseconds per resource type
 */
export const CACHE_TTL_MS = {
  /** User profile data (rarely changes) */
  userProfile: 60 * 60 * 1000, // 1 hour

  /** Calendars list (rarely changes) */
  calendars: 60 * 60 * 1000, // 1 hour

  /** To Do lists (moderate change frequency) */
  todoLists: 30 * 60 * 1000, // 30 minutes

  /** Mail folders (moderate change frequency) */
  mailFolders: 30 * 60 * 1000, // 30 minutes

  /** OneNote notebooks (rarely changes) */
  notebooks: 60 * 60 * 1000, // 1 hour

  /** Presence status (frequently changes) */
  presence: 5 * 60 * 1000, // 5 minutes

  /** Teams (rarely changes) */
  teams: 60 * 60 * 1000, // 1 hour

  /** SharePoint sites (rarely changes) */
  sites: 60 * 60 * 1000, // 1 hour

  /** Contact folders (rarely changes) */
  contactFolders: 60 * 60 * 1000, // 1 hour

  /** Default for all other resources */
  default: 10 * 60 * 1000, // 10 minutes
} as const;

/**
 * Maximum number of entries in the LRU cache
 * Estimated memory usage: ~50 MB at 500 entries
 */
export const MAX_CACHE_SIZE = 500;

/**
 * Get the appropriate TTL for a given Graph API URL
 * @param url - The Graph API URL (e.g., "/me/mailFolders")
 * @returns TTL in milliseconds
 */
export function getTtlForResource(url: string): number {
  // User profile
  if (url.includes("/me/profile") || (url.includes("/users/") && url.includes("/profile"))) {
    return CACHE_TTL_MS.userProfile;
  }

  // Calendars
  if (url.includes("/calendar")) {
    return CACHE_TTL_MS.calendars;
  }

  // To Do lists
  if (url.includes("/todo/lists")) {
    return CACHE_TTL_MS.todoLists;
  }

  // Mail folders
  if (url.includes("/mailFolders")) {
    return CACHE_TTL_MS.mailFolders;
  }

  // OneNote notebooks
  if (url.includes("/onenote/notebooks")) {
    return CACHE_TTL_MS.notebooks;
  }

  // Presence
  if (url.includes("/presence")) {
    return CACHE_TTL_MS.presence;
  }

  // Teams
  if (url.includes("/teams") || url.includes("/joinedTeams")) {
    return CACHE_TTL_MS.teams;
  }

  // SharePoint sites
  if (url.includes("/sites")) {
    return CACHE_TTL_MS.sites;
  }

  // Contact folders
  if (url.includes("/contactFolders")) {
    return CACHE_TTL_MS.contactFolders;
  }

  // Default
  return CACHE_TTL_MS.default;
}
