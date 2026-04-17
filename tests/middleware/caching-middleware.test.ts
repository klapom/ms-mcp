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

      // Check that response was cached as JSON
      const cached = cache.get("GET:/me/mailFolders:me");
      expect(cached).toBeDefined();
      const entry = cached?.value as { status: number; body: unknown };
      expect(entry.status).toBe(200);
      expect(entry.body).toEqual({ value: [{ id: "test" }] });
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
      // Cached response is reconstructed from JSON, so check body content
      const body = await context2.response?.json();
      expect(body).toEqual({ value: [{ id: "test" }] });
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
      // Both are separate cache entries
      expect(cached1).not.toBe(cached2);
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

  // The Graph SDK's real call shape: POST/PATCH/DELETE set `context.request`
  // to a string URL and put the method on `context.options.method`. The
  // caching middleware must still recognise these as writes and must not
  // treat them as cacheable GETs.
  describe("Graph SDK-shaped contexts (request as URL string + options.method)", () => {
    function createSdkContext(method: string, url: string): Context {
      return {
        request: url,
        options: { method },
      } as unknown as Context;
    }

    it("should not cache a POST when context.request is a URL string", async () => {
      // First POST — response must not be stored as a GET cache entry.
      const firstCtx = createSdkContext("POST", "/me/messages");
      await middleware.execute(firstCtx);

      expect(executeCount).toBe(1);
      // No cache entry for either the fake "GET:" key or the "POST:" key.
      expect(cache.get("GET:/me/messages:me")).toBeUndefined();
      expect(cache.get("POST:/me/messages:me")).toBeUndefined();

      // Second POST — must actually hit the downstream middleware again,
      // not return a cached response from the first POST.
      const secondCtx = createSdkContext("POST", "/me/messages");
      await middleware.execute(secondCtx);

      expect(executeCount).toBe(2);
    });

    it("should invalidate list cache on SDK-shaped POST", async () => {
      // Seed a cached GET /me/messages list.
      const getCtx = createContext("GET", "/me/messages");
      await middleware.execute(getCtx);
      expect(cache.get("GET:/me/messages:me")).toBeDefined();

      // Now issue the POST in the real SDK shape.
      const postCtx = createSdkContext("POST", "/me/messages");
      await middleware.execute(postCtx);

      expect(cache.get("GET:/me/messages:me")).toBeUndefined();
    });

    it("should not cache a PATCH when context.request is a URL string", async () => {
      const ctx = createSdkContext("PATCH", "/me/events/abc");
      await middleware.execute(ctx);

      expect(cache.get("GET:/me/events/abc:me")).toBeUndefined();
      expect(cache.get("PATCH:/me/events/abc:me")).toBeUndefined();
    });

    it("should not cache a DELETE when context.request is a URL string", async () => {
      const ctx = createSdkContext("DELETE", "/me/messages/123");
      await middleware.execute(ctx);

      expect(cache.get("GET:/me/messages/123:me")).toBeUndefined();
      expect(cache.get("DELETE:/me/messages/123:me")).toBeUndefined();
    });
  });
});
