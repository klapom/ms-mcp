import { mkdir } from "node:fs/promises";
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
 * @param cachePath - Absolute path to the token cache file.
 *                    Parent directories are created automatically.
 */
export async function createCachePlugin(cachePath: string): Promise<ICachePlugin> {
  const cacheDir = dirname(cachePath);
  await mkdir(cacheDir, { recursive: true });

  const persistence = await FilePersistence.create(cachePath);
  const plugin = new PersistenceCachePlugin(persistence);

  logger.info({ cachePath: cacheDir }, "Token cache plugin created");
  return plugin;
}
