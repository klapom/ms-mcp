/**
 * Cache Manager — LRU cache with TTL and invalidation patterns
 *
 * Provides transparent caching for Graph API responses with:
 * - LRU eviction when max size reached
 * - TTL-based expiration
 * - Pattern-based invalidation for write operations
 * - Metrics for observability
 */

import { LRUCache } from "lru-cache";
import type { Logger } from "pino";
import { MAX_CACHE_SIZE } from "../config/cache-config.js";

/**
 * Cache entry with metadata
 */
export interface CacheEntry {
  /** Cached value (Graph API response) */
  value: unknown;
  /** Timestamp when entry was created (ms since epoch) */
  createdAt: number;
  /** TTL in milliseconds */
  ttl: number;
}

/**
 * Cache metrics for observability
 */
export interface CacheMetrics {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Current number of entries in cache */
  size: number;
  /** Hit rate (hits / total requests) */
  hitRate: number;
}

/**
 * LRU Cache Manager with TTL and invalidation support
 */
export class CacheManager {
  private cache: LRUCache<string, CacheEntry>;
  private hits = 0;
  private misses = 0;
  private logger: Logger | undefined;

  /**
   * Create a new cache manager
   * @param maxSize - Maximum number of entries (default: 500)
   * @param logger - Optional logger for metrics
   */
  constructor(maxSize = MAX_CACHE_SIZE, logger?: Logger) {
    this.cache = new LRUCache<string, CacheEntry>({
      max: maxSize,
      // No built-in TTL - we handle expiration manually in get()
    });
    this.logger = logger;
  }

  /**
   * Get a value from the cache
   * @param key - Cache key
   * @returns Cache entry if found and not expired, undefined otherwise
   */
  get(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);

    // Cache miss
    if (!entry) {
      this.misses++;
      this.logger?.debug({ key, result: "miss" }, "cache_access");
      return undefined;
    }

    // Check TTL expiration
    const now = Date.now();
    const age = now - entry.createdAt;
    if (age > entry.ttl) {
      // Expired, remove and count as miss
      this.cache.delete(key);
      this.misses++;
      this.logger?.debug({ key, result: "expired", age }, "cache_access");
      return undefined;
    }

    // Cache hit
    this.hits++;
    this.logger?.debug({ key, result: "hit", age }, "cache_access");
    return entry;
  }

  /**
   * Store a value in the cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlMs - TTL in milliseconds
   */
  set(key: string, value: unknown, ttlMs: number): void {
    const entry: CacheEntry = {
      value,
      createdAt: Date.now(),
      ttl: ttlMs,
    };
    this.cache.set(key, entry);
    this.logger?.debug({ key, ttl: ttlMs }, "cache_set");
  }

  /**
   * Invalidate cache entries matching a pattern
   *
   * Pattern matching rules:
   * - Exact match: "GET:/me/mailFolders:user123"
   * - Wildcard: "GET:/me/mailFolders/*" matches all mail folder requests
   * - Method only: "GET:*" matches all GET requests
   *
   * @param pattern - Invalidation pattern (supports * wildcard)
   */
  invalidate(pattern: string): void {
    // Escape regex special characters except *, then convert * to .*
    const escapedPattern = pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replace(/\*/g, ".*");
    const regex = new RegExp(`^${escapedPattern}$`);

    let count = 0;
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.logger?.info({ pattern, count }, "cache_invalidate");
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.logger?.info({ size }, "cache_clear");
  }

  /**
   * Get cache metrics
   * @returns Cache metrics for observability
   */
  getMetrics(): CacheMetrics {
    const totalRequests = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
    };
  }

  /**
   * Get current cache size
   * @returns Number of entries in cache
   */
  get size(): number {
    return this.cache.size;
  }
}
