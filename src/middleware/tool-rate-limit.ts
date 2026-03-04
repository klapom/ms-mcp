/**
 * Tool Rate Limiting — Per-user request counting for MCP tool invocations
 *
 * Tracks request counts per user with a sliding window.
 * Returns a rate limit error when the limit is exceeded.
 *
 * Default: 1000 requests per 15 minutes per user.
 */

import { createLogger } from "../utils/logger.js";

const logger = createLogger("tool-rate-limit");

export interface ToolRateLimitConfig {
  /** Maximum requests per window (default: 1000) */
  readonly maxRequests: number;
  /** Window duration in ms (default: 15 minutes) */
  readonly windowMs: number;
}

const DEFAULT_CONFIG: ToolRateLimitConfig = {
  maxRequests: 1000,
  windowMs: 15 * 60 * 1000,
};

interface UserCounter {
  count: number;
  resetAt: number;
}

/**
 * Error thrown when a user exceeds the rate limit.
 */
export class ToolRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Rate limit exceeded. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = "ToolRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Per-user rate limiter for tool invocations.
 */
export class ToolRateLimiter {
  private readonly counters = new Map<string, UserCounter>();
  private readonly config: ToolRateLimitConfig;

  constructor(config?: Partial<ToolRateLimitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a request is allowed for the given user.
   * Increments the counter if allowed.
   *
   * @param userId - The user identifier (defaults to "default")
   * @throws ToolRateLimitError if rate limit exceeded
   */
  checkLimit(userId = "default"): void {
    const now = Date.now();
    let counter = this.counters.get(userId);

    // Reset counter if window expired
    if (!counter || now >= counter.resetAt) {
      counter = { count: 0, resetAt: now + this.config.windowMs };
      this.counters.set(userId, counter);
    }

    counter.count++;

    if (counter.count > this.config.maxRequests) {
      const retryAfterMs = counter.resetAt - now;
      logger.warn({ userId, count: counter.count, retryAfterMs }, "Rate limit exceeded for user");
      throw new ToolRateLimitError(retryAfterMs);
    }
  }

  /**
   * Get the current count for a user (for testing/observability).
   */
  getCount(userId = "default"): number {
    const counter = this.counters.get(userId);
    if (!counter || Date.now() >= counter.resetAt) {
      return 0;
    }
    return counter.count;
  }

  /**
   * Reset all counters (for testing).
   */
  reset(): void {
    this.counters.clear();
  }
}
