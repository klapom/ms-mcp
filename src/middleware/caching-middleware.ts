/**
 * Caching Middleware — Transparent response caching for Graph API
 *
 * Provides automatic caching of GET requests with:
 * - Cache-before-request check for GET
 * - Cache-after-response store for GET (as parsed JSON, not Response objects)
 * - Automatic invalidation on POST/PATCH/DELETE
 *
 * Caches parsed JSON + status code instead of Response objects for better
 * memory efficiency and serialization safety.
 */

import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import type { Logger } from "pino";
import { getTtlForResource } from "../config/cache-config.js";
import type { CacheManager } from "../utils/cache.js";

/**
 * Cached response shape — stores parsed JSON instead of Response objects.
 */
export interface CachedResponse {
  status: number;
  body: unknown;
}

/**
 * Extract the HTTP method from a Graph client context.
 *
 * The Graph SDK passes `context.request` either as:
 * - a `Request` object (has `.method`), or
 * - a URL string with the method on `context.options.method`
 *   (the path taken by GraphRequest#get/post/patch/delete — see Graph SDK
 *   `GraphRequest.ts`). Reading `.method` off a string silently yields
 *   `undefined`, which previously caused write requests to be treated
 *   as GETs and cached.
 */
function extractMethod(context: Context): string {
  const req = context.request;
  if (typeof req !== "string" && req && "method" in req) {
    return req.method.toUpperCase();
  }
  return context.options?.method?.toUpperCase() ?? "GET";
}

/**
 * Extract the request URL from a Graph client context (string or Request).
 */
function extractUrl(context: Context): string {
  const req = context.request;
  if (typeof req === "string") {
    return req;
  }
  if (req && "url" in req) {
    return req.url;
  }
  return "";
}

/**
 * Build cache key from request context
 * Format: {method}:{path}:{userId}
 *
 * @param context - Graph client context
 * @returns Cache key string
 */
function buildCacheKey(context: Context): string {
  const method = extractMethod(context);
  const url = extractUrl(context);
  // Extract user ID from URL if present (e.g., /users/{userId}/...)
  // Otherwise use "me" as identifier
  const userMatch = /\/users\/([^/]+)/.exec(url);
  const userId = userMatch ? userMatch[1] : "me";

  return `${method}:${url}:${userId}`;
}

/**
 * Invalidate related caches after write operations
 *
 * Rules:
 * - POST /resources → Invalidate GET /resources (list)
 * - PATCH /resources/{id} → Invalidate GET /resources/{id} (detail)
 * - DELETE /resources/{id} → Invalidate GET /resources (list) and GET /resources/{id} (detail)
 *
 * @param cache - Cache manager instance
 * @param context - Graph client context
 */
function invalidateRelatedCaches(cache: CacheManager, context: Context): void {
  const method = extractMethod(context);
  const url = extractUrl(context);

  // Extract resource path (remove query params)
  const resourcePath = url.split("?")[0];

  // Extract user ID
  const userMatch = /\/users\/([^/]+)/.exec(url);
  const userId = userMatch ? userMatch[1] : "me";

  switch (method) {
    case "POST": {
      // POST creates a new resource
      // Invalidate the list endpoint
      // e.g., POST /me/messages → invalidate GET:/me/messages:*
      const listPattern = `GET:${resourcePath}:${userId}`;
      cache.invalidate(listPattern);
      break;
    }

    case "PATCH": {
      // PATCH updates an existing resource
      // Invalidate the detail endpoint only
      // e.g., PATCH /me/events/123 → invalidate GET:/me/events/123:*
      const detailPattern = `GET:${resourcePath}:${userId}`;
      cache.invalidate(detailPattern);
      break;
    }

    case "DELETE": {
      // DELETE removes a resource
      // Invalidate both detail and list endpoints
      // e.g., DELETE /me/drive/items/abc → invalidate:
      //   - GET:/me/drive/items/abc:*
      //   - GET:/me/drive/items:*
      //   - GET:/me/drive/items?*:* (query param variants)

      // Invalidate detail
      const detailPattern = `GET:${resourcePath}:${userId}`;
      cache.invalidate(detailPattern);

      // Invalidate list (parent resource)
      const parentPath = resourcePath.substring(0, resourcePath.lastIndexOf("/"));
      if (parentPath) {
        const listPattern = `GET:${parentPath}*:${userId}`;
        cache.invalidate(listPattern);
      }
      break;
    }
  }
}

/**
 * Caching middleware for Graph API requests
 *
 * Implements transparent response caching with automatic invalidation.
 */
export class CachingMiddleware implements Middleware {
  private nextMiddleware?: Middleware;
  private readonly cache: CacheManager;
  private readonly logger?: Logger;

  constructor(cache: CacheManager, logger?: Logger) {
    this.cache = cache;
    this.logger = logger;
  }

  async execute(context: Context): Promise<void> {
    const method = extractMethod(context);
    const url = extractUrl(context);
    const cacheKey = buildCacheKey(context);

    // For GET requests, check cache first
    if (method === "GET") {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        // Cache hit - reconstruct Response from cached JSON
        const entry = cached.value as CachedResponse;
        context.response = new Response(JSON.stringify(entry.body), {
          status: entry.status,
          headers: { "Content-Type": "application/json" },
        });
        this.logger?.info({ url, method: "GET", cached: true }, "graph_request");
        return;
      }
    }

    // Cache miss or write operation - execute next middleware
    if (this.nextMiddleware) {
      await this.nextMiddleware.execute(context);
    }

    // For GET requests, store parsed JSON in cache
    if (method === "GET" && context.response && context.response.ok) {
      const ttl = getTtlForResource(url);
      try {
        const cloned = context.response.clone();
        const body: unknown = await cloned.json();
        const cachedResponse: CachedResponse = { status: context.response.status, body };
        this.cache.set(cacheKey, cachedResponse, ttl);
        this.logger?.info({ url, method: "GET", cached: false, ttl }, "graph_request");
      } catch {
        // Body is not JSON — skip caching
        this.logger?.debug({ url }, "Skipping cache: response is not JSON");
      }
    }

    // For write operations, invalidate related caches
    if (["POST", "PATCH", "DELETE"].includes(method)) {
      invalidateRelatedCaches(this.cache, context);
      this.logger?.info({ url, method, invalidated: true }, "graph_request");
    }
  }

  setNext(next: Middleware): void {
    this.nextMiddleware = next;
  }
}
