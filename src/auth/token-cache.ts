import { chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ICachePlugin } from "@azure/msal-node";
import { FilePersistence, PersistenceCachePlugin } from "@azure/msal-node-extensions";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("token-cache");

/**
 * Creates an MSAL cache plugin that persists tokens to a local JSON file.
 *
 * Uses FilePersistence (plaintext JSON) which is appropriate for local
 * developer tooling. For production multi-user scenarios, consider
 * DataProtection (Windows) or Keychain (macOS) persistence.
 *
 * Security: Sets restrictive file permissions (0600) on the cache file
 * to prevent other users on the system from reading OAuth tokens.
 *
 * @param cachePath - Absolute path to the token cache file.
 *                    Parent directories are created automatically.
 */
export async function createCachePlugin(cachePath: string): Promise<ICachePlugin> {
  const cacheDir = dirname(cachePath);
  await mkdir(cacheDir, { recursive: true });

  const persistence = await FilePersistence.create(cachePath);
  const plugin = new PersistenceCachePlugin(persistence);

  // Set restrictive permissions (owner read/write only) to protect tokens
  try {
    await chmod(cachePath, 0o600);
    logger.info(
      { cacheDir, permissions: "0600" },
      "Token cache plugin created with secure permissions",
    );
  } catch (error) {
    logger.warn({ cacheDir, error }, "Failed to set restrictive permissions on token cache file");
  }

  return plugin;
}
