/**
 * Graph client retry middleware with exponential backoff.
 *
 * Handles transient failures (429, 5xx) with:
 * - Respect for Retry-After header on 429 responses
 * - Exponential backoff with jitter for 5xx errors
 * - Configurable max retries and delay bounds
 */

import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("graph-retry");

export interface RetryConfig {
  /** Maximum number of retry attempts. */
  readonly maxRetries: number;
  /** Base delay in milliseconds for exponential backoff. */
  readonly baseDelay: number;
  /** Maximum delay in milliseconds (cap). */
  readonly maxDelay: number;
  /** HTTP status codes eligible for retry. */
  readonly retryableStatuses: readonly number[];
  /** Whether to respect the Retry-After header for 429 responses. */
  readonly respectRetryAfter: boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 32000,
  retryableStatuses: [429, 500, 502, 503, 504],
  respectRetryAfter: true,
};

/**
 * Compute delay in milliseconds using exponential backoff with jitter.
 */
function computeBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponential = baseDelay * 2 ** attempt;
  const jitter = Math.random() * baseDelay;
  return Math.min(exponential + jitter, maxDelay);
}

/**
 * Parse the Retry-After header value into milliseconds.
 * Supports both delta-seconds and HTTP-date formats.
 * Returns undefined if the header is missing or unparseable.
 */
function parseRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (!header) {
    return undefined;
  }

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try HTTP-date format
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Middleware that retries failed Graph API requests using exponential backoff.
 */
export class RetryMiddleware implements Middleware {
  private nextMiddleware?: Middleware;
  private readonly config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  async execute(context: Context): Promise<void> {
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (this.nextMiddleware) {
        await this.nextMiddleware.execute(context);
      }

      lastResponse = context.response;

      // If there is no response or the status is not retryable, stop.
      if (!lastResponse || !this.isRetryableStatus(lastResponse.status)) {
        return;
      }

      // Last attempt exhausted -- do not retry further.
      if (attempt === this.config.maxRetries) {
        break;
      }

      const delayMs = this.getDelayMs(lastResponse, attempt);

      logger.warn({
        event: "graph_retry",
        attempt: attempt + 1,
        max_retries: this.config.maxRetries,
        status: lastResponse.status,
        delay_ms: Math.round(delayMs),
      });

      await sleep(delayMs);
    }
  }

  setNext(next: Middleware): void {
    this.nextMiddleware = next;
  }

  /**
   * Determine if a status code is eligible for retry.
   */
  private isRetryableStatus(status: number): boolean {
    return this.config.retryableStatuses.includes(status);
  }

  /**
   * Compute the delay before the next retry attempt.
   * For 429, prefer the Retry-After header; otherwise use exponential backoff.
   */
  private getDelayMs(response: Response, attempt: number): number {
    if (this.config.respectRetryAfter && response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response);
      if (retryAfterMs !== undefined) {
        return Math.min(retryAfterMs, this.config.maxDelay);
      }
    }
    return computeBackoffDelay(attempt, this.config.baseDelay, this.config.maxDelay);
  }
}
