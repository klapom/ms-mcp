/**
 * Request Coalescing Middleware — Deduplicates identical concurrent GET requests
 *
 * When multiple identical GET requests arrive simultaneously, only one actual
 * network request is made. All callers receive the same response.
 *
 * Request key format: GET:{url}
 * Only GET requests are coalesced (write operations are never deduplicated).
 */

import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("request-coalescing");

/**
 * Extract the request method from a Graph context.
 */
function extractMethod(context: Context): string {
  if (typeof context.request !== "string" && "method" in context.request) {
    return context.request.method.toUpperCase();
  }
  return context.options?.method?.toUpperCase() ?? "GET";
}

/**
 * Extract the full URL from a Graph context.
 */
function extractUrl(context: Context): string {
  return typeof context.request === "string" ? context.request : context.request.url;
}

/**
 * Middleware that deduplicates identical concurrent GET requests.
 *
 * If a GET request for the same URL is already in-flight, subsequent
 * callers wait for the same result instead of making a new request.
 */
export class RequestCoalescingMiddleware implements Middleware {
  private nextMiddleware?: Middleware;
  private readonly inFlight = new Map<string, Promise<Response>>();

  async execute(context: Context): Promise<void> {
    const method = extractMethod(context);

    // Only coalesce GET requests
    if (method !== "GET") {
      if (this.nextMiddleware) {
        await this.nextMiddleware.execute(context);
      }
      return;
    }

    const url = extractUrl(context);
    const key = `GET:${url}`;

    const existing = this.inFlight.get(key);
    if (existing) {
      logger.debug({ url }, "Coalescing duplicate GET request");
      context.response = (await existing).clone();
      return;
    }

    // Create a deferred promise for this request
    const responsePromise = this.executeAndCapture(context);
    this.inFlight.set(key, responsePromise);

    try {
      context.response = (await responsePromise).clone();
    } finally {
      this.inFlight.delete(key);
    }
  }

  setNext(next: Middleware): void {
    this.nextMiddleware = next;
  }

  /**
   * Get the number of in-flight requests (for testing/observability).
   */
  get pendingCount(): number {
    return this.inFlight.size;
  }

  private async executeAndCapture(context: Context): Promise<Response> {
    if (this.nextMiddleware) {
      await this.nextMiddleware.execute(context);
    }

    if (!context.response) {
      throw new Error("No response received from downstream middleware");
    }

    return context.response.clone();
  }
}
