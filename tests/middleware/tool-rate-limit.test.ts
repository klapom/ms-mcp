/**
 * Tests for Tool Rate Limiter
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRateLimitError, ToolRateLimiter } from "../../src/middleware/tool-rate-limit.js";

describe("ToolRateLimiter", () => {
  let limiter: ToolRateLimiter;

  beforeEach(() => {
    limiter = new ToolRateLimiter({ maxRequests: 5, windowMs: 10_000 });
  });

  it("should allow requests within limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(() => limiter.checkLimit("user1")).not.toThrow();
    }
  });

  it("should throw ToolRateLimitError when limit exceeded", () => {
    for (let i = 0; i < 5; i++) {
      limiter.checkLimit("user1");
    }
    expect(() => limiter.checkLimit("user1")).toThrow(ToolRateLimitError);
  });

  it("should track users independently", () => {
    for (let i = 0; i < 5; i++) {
      limiter.checkLimit("user1");
    }
    // user2 should still be allowed
    expect(() => limiter.checkLimit("user2")).not.toThrow();
  });

  it("should reset counter after window expires", () => {
    vi.useFakeTimers();

    for (let i = 0; i < 5; i++) {
      limiter.checkLimit("user1");
    }
    expect(() => limiter.checkLimit("user1")).toThrow(ToolRateLimitError);

    // Advance past window
    vi.advanceTimersByTime(11_000);

    expect(() => limiter.checkLimit("user1")).not.toThrow();

    vi.useRealTimers();
  });

  it("should report correct count", () => {
    limiter.checkLimit("user1");
    limiter.checkLimit("user1");
    expect(limiter.getCount("user1")).toBe(2);
    expect(limiter.getCount("user2")).toBe(0);
  });

  it("should use 'default' user when no userId provided", () => {
    limiter.checkLimit();
    expect(limiter.getCount("default")).toBe(1);
  });

  it("should include retryAfterMs in error", () => {
    for (let i = 0; i < 5; i++) {
      limiter.checkLimit("user1");
    }
    try {
      limiter.checkLimit("user1");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolRateLimitError);
      expect((error as ToolRateLimitError).retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("should reset all counters", () => {
    limiter.checkLimit("user1");
    limiter.checkLimit("user2");
    limiter.reset();
    expect(limiter.getCount("user1")).toBe(0);
    expect(limiter.getCount("user2")).toBe(0);
  });
});
