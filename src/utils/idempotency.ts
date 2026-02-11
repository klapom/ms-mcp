import { createLogger } from "../utils/logger.js";

const log = createLogger("idempotency");

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface CachedResult {
  result: unknown;
  timestamp: number;
}

export class IdempotencyCache {
  private cache: Map<string, CachedResult>;
  private readonly ttlMs: number;

  constructor(ttlMs?: number) {
    this.cache = new Map();
    this.ttlMs = ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Build a composite key from tool name and idempotency key.
   */
  private buildKey(toolName: string, idempotencyKey: string): string {
    return `${toolName}:${idempotencyKey}`;
  }

  /**
   * Check if a result exists for this key.
   * Returns the cached result or undefined.
   */
  get(toolName: string, idempotencyKey: string): unknown | undefined {
    this.cleanup();
    const key = this.buildKey(toolName, idempotencyKey);
    const entry = this.cache.get(key);
    if (entry === undefined) {
      return undefined;
    }
    log.debug({ toolName, idempotencyKey }, "Idempotency cache hit");
    return entry.result;
  }

  /**
   * Store a result for an idempotency key.
   */
  set(toolName: string, idempotencyKey: string, result: unknown): void {
    this.cleanup();
    const key = this.buildKey(toolName, idempotencyKey);
    this.cache.set(key, { result, timestamp: Date.now() });
    log.debug({ toolName, idempotencyKey, cacheSize: this.cache.size }, "Idempotency cache set");
  }

  /**
   * Clean up expired entries.
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        expiredKeys.push(key);
      }
    }
    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
    if (expiredKeys.length > 0) {
      log.debug({ removed: expiredKeys.length, remaining: this.cache.size }, "Cleaned up cache");
    }
  }

  /**
   * Get cache size (for monitoring).
   */
  get size(): number {
    return this.cache.size;
  }
}

/** Singleton instance */
export const idempotencyCache = new IdempotencyCache();
