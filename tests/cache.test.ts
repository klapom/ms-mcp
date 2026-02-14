/**
 * Tests for CacheManager — LRU cache with TTL and invalidation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CacheManager } from "../src/utils/cache.js";

describe("CacheManager", () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager(10); // Small size for testing
    vi.useFakeTimers();
  });

  describe("get and set", () => {
    it("should store and retrieve a value", () => {
      cache.set("key1", { data: "value1" }, 60000);
      const entry = cache.get("key1");

      expect(entry).toBeDefined();
      expect(entry?.value).toEqual({ data: "value1" });
    });

    it("should return undefined for missing key", () => {
      const entry = cache.get("nonexistent");
      expect(entry).toBeUndefined();
    });

    it("should track cache hits and misses", () => {
      cache.set("key1", "value1", 60000);

      cache.get("key1"); // hit
      cache.get("key2"); // miss
      cache.get("key1"); // hit
      cache.get("key3"); // miss

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(2);
      expect(metrics.hitRate).toBe(0.5);
    });
  });

  describe("TTL expiration", () => {
    it("should expire entry after TTL", () => {
      cache.set("key1", "value1", 5000); // 5 seconds TTL

      // Should exist before expiration
      expect(cache.get("key1")).toBeDefined();

      // Advance time past TTL
      vi.advanceTimersByTime(6000);

      // Should be expired now
      expect(cache.get("key1")).toBeUndefined();
    });

    it("should count expired entry as miss", () => {
      cache.set("key1", "value1", 5000);

      cache.get("key1"); // hit
      vi.advanceTimersByTime(6000);
      cache.get("key1"); // miss (expired)

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
    });

    it("should allow different TTLs for different entries", () => {
      cache.set("short", "value1", 1000); // 1 second
      cache.set("long", "value2", 10000); // 10 seconds

      // Advance 2 seconds
      vi.advanceTimersByTime(2000);

      // Short should expire, long should remain
      expect(cache.get("short")).toBeUndefined();
      expect(cache.get("long")).toBeDefined();
    });
  });

  describe("LRU eviction", () => {
    it("should evict oldest entry when max size reached", () => {
      const smallCache = new CacheManager(3);

      smallCache.set("key1", "value1", 60000);
      smallCache.set("key2", "value2", 60000);
      smallCache.set("key3", "value3", 60000);

      // Cache is full (3 entries)
      expect(smallCache.size).toBe(3);

      // Add one more — should evict oldest (key1)
      smallCache.set("key4", "value4", 60000);

      expect(smallCache.size).toBe(3);
      expect(smallCache.get("key1")).toBeUndefined();
      expect(smallCache.get("key2")).toBeDefined();
      expect(smallCache.get("key3")).toBeDefined();
      expect(smallCache.get("key4")).toBeDefined();
    });

    it("should refresh LRU on access", () => {
      const smallCache = new CacheManager(3);

      smallCache.set("key1", "value1", 60000);
      smallCache.set("key2", "value2", 60000);
      smallCache.set("key3", "value3", 60000);

      // Access key1 to refresh it
      smallCache.get("key1");

      // Add one more — should evict key2 (now oldest)
      smallCache.set("key4", "value4", 60000);

      expect(smallCache.get("key1")).toBeDefined();
      expect(smallCache.get("key2")).toBeUndefined();
      expect(smallCache.get("key3")).toBeDefined();
      expect(smallCache.get("key4")).toBeDefined();
    });
  });

  describe("invalidate", () => {
    beforeEach(() => {
      cache.set("GET:/me/mailFolders:user1", { data: "folders" }, 60000);
      cache.set("GET:/me/mailFolders/123:user1", { data: "folder" }, 60000);
      cache.set("GET:/me/messages:user1", { data: "messages" }, 60000);
      cache.set("GET:/me/messages/456:user1", { data: "message" }, 60000);
      cache.set("POST:/me/messages:user1", { data: "sent" }, 60000);
    });

    it("should invalidate exact match", () => {
      cache.invalidate("GET:/me/mailFolders:user1");

      expect(cache.get("GET:/me/mailFolders:user1")).toBeUndefined();
      expect(cache.get("GET:/me/mailFolders/123:user1")).toBeDefined();
      expect(cache.get("GET:/me/messages:user1")).toBeDefined();
    });

    it("should invalidate with wildcard", () => {
      cache.invalidate("GET:/me/mailFolders*:user1");

      expect(cache.get("GET:/me/mailFolders:user1")).toBeUndefined();
      expect(cache.get("GET:/me/mailFolders/123:user1")).toBeUndefined();
      expect(cache.get("GET:/me/messages:user1")).toBeDefined();
    });

    it("should invalidate all GET requests", () => {
      cache.invalidate("GET:*");

      expect(cache.get("GET:/me/mailFolders:user1")).toBeUndefined();
      expect(cache.get("GET:/me/messages:user1")).toBeUndefined();
      expect(cache.get("POST:/me/messages:user1")).toBeDefined();
    });

    it("should invalidate all requests for a user", () => {
      cache.set("GET:/me/calendar:user2", { data: "cal" }, 60000);

      cache.invalidate("*:user1");

      expect(cache.get("GET:/me/mailFolders:user1")).toBeUndefined();
      expect(cache.get("GET:/me/messages:user1")).toBeUndefined();
      expect(cache.get("GET:/me/calendar:user2")).toBeDefined();
    });

    it("should handle no matches gracefully", () => {
      cache.invalidate("GET:/nonexistent*");

      // All original entries should remain
      expect(cache.get("GET:/me/mailFolders:user1")).toBeDefined();
      expect(cache.get("GET:/me/messages:user1")).toBeDefined();
    });
  });

  describe("clear", () => {
    it("should remove all entries", () => {
      cache.set("key1", "value1", 60000);
      cache.set("key2", "value2", 60000);
      cache.set("key3", "value3", 60000);

      expect(cache.size).toBe(3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get("key1")).toBeUndefined();
      expect(cache.get("key2")).toBeUndefined();
      expect(cache.get("key3")).toBeUndefined();
    });

    it("should reset metrics", () => {
      cache.set("key1", "value1", 60000);
      cache.get("key1"); // hit
      cache.get("key2"); // miss

      const beforeClear = cache.getMetrics();
      expect(beforeClear.hits).toBe(1);
      expect(beforeClear.misses).toBe(1);

      cache.clear();

      const afterClear = cache.getMetrics();
      expect(afterClear.hits).toBe(0);
      expect(afterClear.misses).toBe(0);
    });
  });

  describe("metrics", () => {
    it("should return correct metrics", () => {
      cache.set("key1", "value1", 60000);
      cache.set("key2", "value2", 60000);

      cache.get("key1"); // hit
      cache.get("key1"); // hit
      cache.get("key3"); // miss
      cache.get("key4"); // miss

      const metrics = cache.getMetrics();

      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(2);
      expect(metrics.size).toBe(2);
      expect(metrics.hitRate).toBe(0.5);
    });

    it("should handle zero requests", () => {
      const metrics = cache.getMetrics();

      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.size).toBe(0);
      expect(metrics.hitRate).toBe(0);
    });
  });
});
