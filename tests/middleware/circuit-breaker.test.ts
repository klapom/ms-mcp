/**
 * Tests for Circuit Breaker middleware
 */

import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreakerMiddleware } from "../../src/middleware/circuit-breaker.js";
import { ServiceError } from "../../src/utils/errors.js";

describe("CircuitBreakerMiddleware", () => {
  let middleware: CircuitBreakerMiddleware;
  let mockNext: Middleware;
  let nextStatus: number;

  beforeEach(() => {
    middleware = new CircuitBreakerMiddleware({
      failureThreshold: 3,
      failureWindowMs: 10_000,
      cooldownMs: 5_000,
    });
    nextStatus = 200;
    mockNext = {
      async execute(context: Context) {
        context.response = new Response("", { status: nextStatus });
      },
      setNext: vi.fn(),
    };
    middleware.setNext(mockNext);
  });

  function createContext(url = "https://graph.microsoft.com/v1.0/me/messages"): Context {
    return { request: { method: "GET", url } } as Context;
  }

  it("should pass through when circuit is CLOSED", async () => {
    const context = createContext();
    await middleware.execute(context);
    expect(context.response?.status).toBe(200);
  });

  it("should stay CLOSED with fewer failures than threshold", async () => {
    nextStatus = 500;
    for (let i = 0; i < 2; i++) {
      const ctx = createContext();
      await middleware.execute(ctx);
    }
    expect(middleware.getCircuitState("/v1.0/me/messages")).toBe("CLOSED");
  });

  it("should OPEN after reaching failure threshold", async () => {
    nextStatus = 500;
    for (let i = 0; i < 3; i++) {
      const ctx = createContext();
      await middleware.execute(ctx);
    }
    expect(middleware.getCircuitState("/v1.0/me/messages")).toBe("OPEN");
  });

  it("should block requests when OPEN", async () => {
    nextStatus = 500;
    for (let i = 0; i < 3; i++) {
      await middleware.execute(createContext());
    }

    nextStatus = 200;
    await expect(middleware.execute(createContext())).rejects.toThrow(ServiceError);
  });

  it("should transition to HALF_OPEN after cooldown", async () => {
    nextStatus = 500;
    for (let i = 0; i < 3; i++) {
      await middleware.execute(createContext());
    }

    // Fast-forward past cooldown
    vi.useFakeTimers();
    vi.advanceTimersByTime(6000);

    nextStatus = 200;
    const ctx = createContext();
    await middleware.execute(ctx);
    expect(ctx.response?.status).toBe(200);
    expect(middleware.getCircuitState("/v1.0/me/messages")).toBe("CLOSED");

    vi.useRealTimers();
  });

  it("should isolate circuits per endpoint", async () => {
    nextStatus = 500;
    for (let i = 0; i < 3; i++) {
      await middleware.execute(createContext("https://graph.microsoft.com/v1.0/me/messages"));
    }

    expect(middleware.getCircuitState("/v1.0/me/messages")).toBe("OPEN");
    expect(middleware.getCircuitState("/v1.0/me/events")).toBe("CLOSED");

    // Different endpoint should still work
    nextStatus = 200;
    const ctx = createContext("https://graph.microsoft.com/v1.0/me/events");
    await middleware.execute(ctx);
    expect(ctx.response?.status).toBe(200);
  });

  it("should reset all circuits", () => {
    middleware.resetAll();
    expect(middleware.getCircuitState("/v1.0/me/messages")).toBe("CLOSED");
  });

  it("should not count non-5xx as failures", async () => {
    nextStatus = 404;
    for (let i = 0; i < 5; i++) {
      await middleware.execute(createContext());
    }
    expect(middleware.getCircuitState("/v1.0/me/messages")).toBe("CLOSED");
  });
});
