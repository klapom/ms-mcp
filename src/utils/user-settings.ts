import type { Client } from "@microsoft/microsoft-graph-client";
import { createLogger } from "./logger.js";

const logger = createLogger("user-settings");

let cachedTimezone: string | null = null;

/**
 * Returns the user's mailbox timezone from Graph API mailboxSettings.
 * Lazy singleton: fetches once and caches for the server lifetime.
 * Falls back to "UTC" if the setting cannot be retrieved.
 */
export async function getUserTimezone(graphClient: Client): Promise<string> {
  if (cachedTimezone !== null) {
    return cachedTimezone;
  }

  try {
    const settings = (await graphClient
      .api("/me/mailboxSettings")
      .select("timeZone")
      .get()) as Record<string, unknown>;

    const tz = typeof settings.timeZone === "string" ? settings.timeZone : "UTC";
    cachedTimezone = tz;
    logger.info({ timezone: tz }, "User timezone resolved");
    return tz;
  } catch (error) {
    logger.warn({ error }, "Failed to resolve user timezone, falling back to UTC");
    cachedTimezone = "UTC";
    return "UTC";
  }
}

/**
 * Resets the cached timezone (for testing).
 */
export function resetTimezoneCache(): void {
  cachedTimezone = null;
}
