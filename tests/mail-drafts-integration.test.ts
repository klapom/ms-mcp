/**
 * Integration test for create_draft regression.
 *
 * Verifies that two sequential `POST /me/messages` calls via the real Graph
 * SDK middleware chain (including the CachingMiddleware) actually hit the
 * network twice and return distinct message IDs.
 *
 * Regression background: the CachingMiddleware previously read `method`
 * off `context.request` which, for POST/PATCH/DELETE, is a URL string —
 * so the method defaulted to "GET", causing writes to be cached and
 * subsequent POSTs to return the first response's payload.
 */

import type { Middleware } from "@microsoft/microsoft-graph-client";
import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CachingMiddleware } from "../src/middleware/caching-middleware.js";
import { CacheManager } from "../src/utils/cache.js";
import { server as mswServer } from "./mocks/server.js";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

function buildClient(cache: CacheManager): { client: Client; getCallCount: () => number } {
  // Chain: Caching -> HTTPMessageHandler (fetch).
  // This mirrors the write-path portion of the production chain — the
  // pieces relevant to the regression.
  const caching = new CachingMiddleware(cache);
  const httpHandler = new HTTPMessageHandler();
  caching.setNext(httpHandler as Middleware);

  const client = Client.initWithMiddleware({
    middleware: caching,
    defaultVersion: "v1.0",
  });

  // Track how many times MSW actually served the POST.
  let calls = 0;
  mswServer.use(
    http.post(`${GRAPH_BASE_URL}/me/messages`, async ({ request }) => {
      calls += 1;
      const body = (await request.json()) as { subject?: string };
      return HttpResponse.json({
        id: `draft-${calls}-${Date.now()}`,
        subject: body.subject ?? "(no subject)",
        isDraft: true,
      });
    }),
  );

  return { client, getCallCount: () => calls };
}

describe("create_draft — POST is not cached (regression)", () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  afterEach(() => {
    cache.clear();
  });

  it("two sequential POST /me/messages calls hit Graph twice with distinct ids", async () => {
    const { client, getCallCount } = buildClient(cache);

    const first = (await client.api("/me/messages").post({ subject: "First" })) as {
      id: string;
      subject: string;
    };
    const second = (await client.api("/me/messages").post({ subject: "Second" })) as {
      id: string;
      subject: string;
    };

    expect(getCallCount()).toBe(2);
    expect(first.id).toBeDefined();
    expect(second.id).toBeDefined();
    expect(first.id).not.toBe(second.id);
    expect(first.subject).toBe("First");
    expect(second.subject).toBe("Second");
  });

  it("POST response is not stored under a GET cache key", async () => {
    const { client } = buildClient(cache);

    await client.api("/me/messages").post({ subject: "only" });

    expect(cache.get(`GET:${GRAPH_BASE_URL}/me/messages:me`)).toBeUndefined();
  });

  it("POST invalidates a previously cached GET list", async () => {
    const { client } = buildClient(cache);

    // Seed a cached GET /me/messages list.
    mswServer.use(
      http.get(`${GRAPH_BASE_URL}/me/messages`, () =>
        HttpResponse.json({ value: [{ id: "old-1" }] }),
      ),
    );
    await client.api("/me/messages").get();
    expect(cache.get(`GET:${GRAPH_BASE_URL}/me/messages:me`)).toBeDefined();

    // A POST to the same collection must invalidate the list cache.
    await client.api("/me/messages").post({ subject: "new" });

    expect(cache.get(`GET:${GRAPH_BASE_URL}/me/messages:me`)).toBeUndefined();
  });
});
