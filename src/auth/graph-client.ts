import { randomUUID } from "node:crypto";
import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { CachingMiddleware } from "../middleware/caching-middleware.js";
import { ErrorMappingMiddleware } from "../middleware/error-mapping.js";
import { LoggingMiddleware } from "../middleware/logging.js";
import { RetryMiddleware } from "../middleware/retry.js";
import type { CacheManager } from "../utils/cache.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("graph-client");

/** Minimal interface for Graph client authentication dependencies. */
export interface GraphClientDeps {
  readonly tenantId: string;
  readonly clientId: string;
  getAccessToken(): Promise<string>;
  /** Silent-only token check; returns null when no cached token is available. */
  getAccessTokenSilentOnly?(): Promise<string | null>;
}

/**
 * Middleware that attaches an OAuth Bearer token to outgoing requests.
 *
 * Acquires the token from the provided GraphClientDeps on every request so that
 * expired tokens are transparently refreshed via MSAL's silent flow.
 */
class AuthMiddleware implements Middleware {
  private nextMiddleware?: Middleware;
  private readonly deps: GraphClientDeps;

  constructor(deps: GraphClientDeps) {
    this.deps = deps;
  }

  async execute(context: Context): Promise<void> {
    const token = await this.deps.getAccessToken();
    const bearerValue = `Bearer ${token}`;

    // The headers property follows the Fetch API's HeadersInit type which can be:
    // - Headers object: use .set()
    // - string[][]: push a tuple
    // - Record<string, string>: set as property
    // We handle all three variants to be compatible with the Graph SDK's FetchOptions.
    if (!context.options) {
      context.options = { headers: new Headers({ Authorization: bearerValue }) };
    } else if (!context.options.headers) {
      context.options.headers = new Headers({ Authorization: bearerValue });
    } else if (context.options.headers instanceof Headers) {
      context.options.headers.set("Authorization", bearerValue);
    } else if (Array.isArray(context.options.headers)) {
      (context.options.headers as string[][]).push(["Authorization", bearerValue]);
    } else {
      (context.options.headers as Record<string, string>).Authorization = bearerValue;
    }

    if (this.nextMiddleware) {
      await this.nextMiddleware.execute(context);
    }
  }

  setNext(next: Middleware): void {
    this.nextMiddleware = next;
  }
}

/**
 * Builds the middleware chain used by the Graph client.
 *
 * Order: Logging -> Caching (optional) -> Retry -> ErrorMapping -> Auth -> HTTPMessageHandler
 *
 * - LoggingMiddleware records structured request/response metadata.
 * - CachingMiddleware (if cache provided) caches GET responses and invalidates on writes.
 * - RetryMiddleware handles transient 429 / 5xx failures with exponential backoff.
 * - ErrorMappingMiddleware converts HTTP error responses to typed errors.
 * - AuthMiddleware attaches the Bearer token.
 * - HTTPMessageHandler performs the actual network fetch.
 *
 * @param deps - Authentication dependencies
 * @param cache - Optional cache manager for response caching
 */
function buildMiddlewareChain(deps: GraphClientDeps, cache?: CacheManager): Middleware {
  const loggingMiddleware = new LoggingMiddleware();
  const retryMiddleware = new RetryMiddleware();
  const errorMappingMiddleware = new ErrorMappingMiddleware();
  const authMiddleware = new AuthMiddleware(deps);
  const httpMessageHandler = new HTTPMessageHandler();

  // Build chain with optional caching middleware
  if (cache) {
    const cachingMiddleware = new CachingMiddleware(cache, logger);
    loggingMiddleware.setNext(cachingMiddleware);
    cachingMiddleware.setNext(retryMiddleware);
  } else {
    loggingMiddleware.setNext(retryMiddleware);
  }

  retryMiddleware.setNext(errorMappingMiddleware);
  errorMappingMiddleware.setNext(authMiddleware);
  authMiddleware.setNext(httpMessageHandler);

  return loggingMiddleware;
}

/**
 * Creates a Microsoft Graph API client with a full middleware chain.
 *
 * Middleware order: Logging -> Caching (optional) -> Retry -> ErrorMapping -> Auth -> HTTPMessageHandler
 *
 * @param deps - Authentication dependencies
 * @param cache - Optional cache manager for response caching
 */
export function createGraphClient(deps: GraphClientDeps, cache?: CacheManager): Client {
  logger.debug("Creating Graph client with middleware chain");
  const middleware = buildMiddlewareChain(deps, cache);
  return Client.initWithMiddleware({ middleware, defaultVersion: "v1.0" });
}

/**
 * Cache of Graph client instances keyed by "tenantId:clientId".
 *
 * Prevents redundant client creation for the same identity — each unique
 * GraphClientDeps identity gets exactly one Graph client with its own middleware
 * chain.
 *
 * NOTE: This cache has no eviction strategy. For the current single-tenant use case
 * this is fine (typically 1 entry). For multi-tenant scenarios (Phase 5+), consider
 * adding LRU eviction or TTL-based cleanup to prevent memory leaks.
 */
const clientCache = new Map<string, Client>();

/**
 * Returns a cached Graph client for the given GraphClientDeps, creating one if
 * it does not already exist.
 *
 * The cache key is derived from the GraphClientDeps's tenantId and clientId,
 * so identical credentials always share a single client instance.
 *
 * @param deps - Authentication dependencies
 * @param cache - Optional cache manager for response caching (shared across all clients)
 */
export function getGraphClient(deps: GraphClientDeps, cache?: CacheManager): Client {
  const key = `${deps.tenantId}:${deps.clientId}`;
  let client = clientCache.get(key);
  if (!client) {
    client = createGraphClient(deps, cache);
    clientCache.set(key, client);
    logger.debug({ tenantId: deps.tenantId }, "Graph client cached");
  }
  return client;
}

/**
 * Clears the client cache. Intended for testing only.
 */
export function clearClientCache(): void {
  clientCache.clear();
}

/**
 * Generates a unique request ID for Graph API call correlation.
 */
export function generateRequestId(): string {
  return randomUUID();
}
