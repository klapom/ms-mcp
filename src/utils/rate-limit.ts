import { createLogger } from "../utils/logger.js";

const log = createLogger("rate-limit");

export class RateLimiter {
  private retryAfterTimestamp = 0;

  /**
   * Check if we should wait before making a request.
   * Returns wait time in ms, or 0 if we can proceed.
   */
  getWaitTime(): number {
    const now = Date.now();
    if (this.retryAfterTimestamp <= now) {
      return 0;
    }
    return this.retryAfterTimestamp - now;
  }

  /**
   * Record a 429 response with Retry-After header value.
   */
  setRetryAfter(retryAfterSeconds: number): void {
    this.retryAfterTimestamp = Date.now() + retryAfterSeconds * 1000;
    log.warn(
      { retryAfterSeconds, retryAfterTimestamp: this.retryAfterTimestamp },
      "Rate limited by Graph API, backing off",
    );
  }

  /**
   * Wait if necessary before proceeding.
   */
  async waitIfNeeded(): Promise<void> {
    const waitTime = this.getWaitTime();
    if (waitTime > 0) {
      log.info({ waitTimeMs: waitTime }, "Waiting before next request due to rate limit");
      await new Promise<void>((resolve) => {
        setTimeout(resolve, waitTime);
      });
    }
  }
}

/** Singleton */
export const rateLimiter = new RateLimiter();
