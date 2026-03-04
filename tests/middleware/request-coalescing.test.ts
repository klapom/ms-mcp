/**
 * Tests for Request Coalescing middleware
 */

import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestCoalescingMiddleware } from "../../src/middleware/request-coalescing.js";

describe("RequestCoalescingMiddleware", () => {
  let middleware: RequestCoalescingMiddleware;
  let executeCount: number;

  beforeEach(() => {
    middleware = new RequestCoalescingMiddleware();
    executeCount = 0;

    const mockNext: Middleware = {
      async execute(context: Context) {
        executeCount++;
        // Simulate a slight delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        context.response = new Response(JSON.stringify({ value: [{ id: "test" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      setNext: vi.fn(),
    };
    middleware.setNext(mockNext);
  });

  function createGetContext(url = "https://graph.microsoft.com/v1.0/me/messages"): Context {
    return { request: { method: "GET", url } } as Context;
  }

  function createPostContext(url = "https://graph.microsoft.com/v1.0/me/messages"): Context {
    return { request: { method: "POST", url } } as Context;
  }

  it("should pass through single GET request", async () => {
    const context = createGetContext();
    await middleware.execute(context);

    expect(context.response?.status).toBe(200);
    expect(executeCount).toBe(1);
  });

  it("should coalesce identical concurrent GET requests", async () => {
    const ctx1 = createGetContext();
    const ctx2 = createGetContext();

    await Promise.all([middleware.execute(ctx1), middleware.execute(ctx2)]);

    expect(executeCount).toBe(1);
    expect(ctx1.response?.status).toBe(200);
    expect(ctx2.response?.status).toBe(200);
  });

  it("should not coalesce different URLs", async () => {
    const ctx1 = createGetContext("https://graph.microsoft.com/v1.0/me/messages");
    const ctx2 = createGetContext("https://graph.microsoft.com/v1.0/me/events");

    await Promise.all([middleware.execute(ctx1), middleware.execute(ctx2)]);

    expect(executeCount).toBe(2);
  });

  it("should not coalesce POST requests", async () => {
    const ctx1 = createPostContext();
    const ctx2 = createPostContext();

    await Promise.all([middleware.execute(ctx1), middleware.execute(ctx2)]);

    expect(executeCount).toBe(2);
  });

  it("should clean up in-flight map after completion", async () => {
    const context = createGetContext();
    await middleware.execute(context);

    expect(middleware.pendingCount).toBe(0);
  });

  it("should allow new request after previous completes", async () => {
    const ctx1 = createGetContext();
    await middleware.execute(ctx1);
    expect(executeCount).toBe(1);

    const ctx2 = createGetContext();
    await middleware.execute(ctx2);
    expect(executeCount).toBe(2);
  });
});
