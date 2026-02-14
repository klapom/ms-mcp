/**
 * Tests for CachingMiddleware — Integration with Graph client middleware chain
 */

import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CachingMiddleware } from "../../src/middleware/caching-middleware.js";
import { CacheManager } from "../../src/utils/cache.js";

describe("CachingMiddleware", () => {
  let cache: CacheManager;
  let middleware: CachingMiddleware;
  let executeCount: number;

  beforeEach(() => {
    cache = new CacheManager();
    middleware = new CachingMiddleware(cache);
    executeCount = 0;

    // Mock next middleware that always succeeds
    const mockNext: Middleware = {
      async execute(context: Context) {
        executeCount++;
        // Simulate successful API response
        context.response = new Response(JSON.stringify({ value: [{ id: "test" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      setNext: vi.fn(),
    };
    middleware.setNext(mockNext);
  });

  function createContext(method: string, url: string): Context {
    return {
      request: {
        method,
        url,
      },
    } as Context;
  }

  describe("GET request caching", () => {
    it("should cache GET response", async () => {
      const context = createContext("GET", "/me/mailFolders");

      await middleware.execute(context);

      expect(context.response).toBeDefined();
      expect(executeCount).toBe(1);

      // Check that response was cached
      const cached = cache.get("GET:/me/mailFolders:me");
      expect(cached).toBeDefined();
      expect(cached?.value).toBe(context.response);
    });

    it("should return cached response on second GET", async () => {
      const context1 = createContext("GET", "/me/mailFolders");
      const context2 = createContext("GET", "/me/mailFolders");

      // First request — cache miss
      await middleware.execute(context1);
      expect(executeCount).toBe(1);

      // Second request — cache hit
      await middleware.execute(context2);
      expect(executeCount).toBe(1); // Still only 1 call to next middleware
      expect(context2.response).toBe(context1.response); // Same cached response
    });

    it("should cache responses with different user IDs separately", async () => {
      const context1 = createContext("GET", "/users/user1/mailFolders");
      const context2 = createContext("GET", "/users/user2/mailFolders");

      await middleware.execute(context1);
      await middleware.execute(context2);

      const cached1 = cache.get("GET:/users/user1/mailFolders:user1");
      const cached2 = cache.get("GET:/users/user2/mailFolders:user2");

      expect(cached1).toBeDefined();
      expect(cached2).toBeDefined();
      expect(cached1?.value).not.toBe(cached2?.value);
    });
  });

  describe("POST request invalidation", () => {
    it("should invalidate list cache on POST", async () => {
      const getContext = createContext("GET", "/me/messages");
      const postContext = createContext("POST", "/me/messages");

      // Cache a GET response
      await middleware.execute(getContext);
      expect(cache.get("GET:/me/messages:me")).toBeDefined();

      // POST to same resource
      await middleware.execute(postContext);

      // Cache should be invalidated
      expect(cache.get("GET:/me/messages:me")).toBeUndefined();
    });

    it("should not invalidate detail cache on POST to list", async () => {
      const detailContext = createContext("GET", "/me/messages/123");
      const postContext = createContext("POST", "/me/messages");

      // Cache detail response
      await middleware.execute(detailContext);
      expect(cache.get("GET:/me/messages/123:me")).toBeDefined();

      // POST to list
      await middleware.execute(postContext);

      // Detail cache should remain
      expect(cache.get("GET:/me/messages/123:me")).toBeDefined();
    });
  });

  describe("PATCH request invalidation", () => {
    it("should invalidate detail cache on PATCH", async () => {
      const getContext = createContext("GET", "/me/events/abc");
      const patchContext = createContext("PATCH", "/me/events/abc");

      // Cache GET response
      await middleware.execute(getContext);
      expect(cache.get("GET:/me/events/abc:me")).toBeDefined();

      // PATCH same resource
      await middleware.execute(patchContext);

      // Cache should be invalidated
      expect(cache.get("GET:/me/events/abc:me")).toBeUndefined();
    });

    it("should not invalidate list cache on PATCH detail", async () => {
      const listContext = createContext("GET", "/me/events");
      const patchContext = createContext("PATCH", "/me/events/abc");

      // Cache list response
      await middleware.execute(listContext);
      expect(cache.get("GET:/me/events:me")).toBeDefined();

      // PATCH detail
      await middleware.execute(patchContext);

      // List cache should remain (PATCH only invalidates detail)
      expect(cache.get("GET:/me/events:me")).toBeDefined();
    });
  });

  describe("DELETE request invalidation", () => {
    it("should invalidate both detail and list cache on DELETE", async () => {
      const listContext = createContext("GET", "/me/drive/items");
      const detailContext = createContext("GET", "/me/drive/items/xyz");
      const deleteContext = createContext("DELETE", "/me/drive/items/xyz");

      // Cache both list and detail
      await middleware.execute(listContext);
      await middleware.execute(detailContext);

      expect(cache.get("GET:/me/drive/items:me")).toBeDefined();
      expect(cache.get("GET:/me/drive/items/xyz:me")).toBeDefined();

      // DELETE
      await middleware.execute(deleteContext);

      // Both should be invalidated
      expect(cache.get("GET:/me/drive/items:me")).toBeUndefined();
      expect(cache.get("GET:/me/drive/items/xyz:me")).toBeUndefined();
    });

    it("should invalidate list with query params", async () => {
      const listContext = createContext("GET", "/me/messages?$filter=isRead eq false");
      const deleteContext = createContext("DELETE", "/me/messages/123");

      // Cache filtered list
      await middleware.execute(listContext);
      expect(cache.get("GET:/me/messages?$filter=isRead eq false:me")).toBeDefined();

      // DELETE
      await middleware.execute(deleteContext);

      // Filtered list should be invalidated (wildcard matching)
      expect(cache.get("GET:/me/messages?$filter=isRead eq false:me")).toBeUndefined();
    });
  });

  describe("write operations bypass cache", () => {
    it("should not cache POST responses", async () => {
      const context = createContext("POST", "/me/messages");

      await middleware.execute(context);

      expect(cache.get("POST:/me/messages:me")).toBeUndefined();
    });

    it("should not cache PATCH responses", async () => {
      const context = createContext("PATCH", "/me/events/123");

      await middleware.execute(context);

      expect(cache.get("PATCH:/me/events/123:me")).toBeUndefined();
    });

    it("should not cache DELETE responses", async () => {
      const context = createContext("DELETE", "/me/contacts/456");

      await middleware.execute(context);

      expect(cache.get("DELETE:/me/contacts/456:me")).toBeUndefined();
    });
  });
});
