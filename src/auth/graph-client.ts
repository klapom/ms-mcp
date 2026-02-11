import { randomUUID } from "node:crypto";
import { Client, HTTPMessageHandler } from "@microsoft/microsoft-graph-client";
import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { ErrorMappingMiddleware } from "../middleware/error-mapping.js";
import { LoggingMiddleware } from "../middleware/logging.js";
import { RetryMiddleware } from "../middleware/retry.js";
import { createLogger } from "../utils/logger.js";
import type { MsalClient } from "./msal-client.js";

const logger = createLogger("graph-client");

/**
 * Middleware that attaches an OAuth Bearer token to outgoing requests.
 *
 * Acquires the token from the provided MsalClient on every request so that
 * expired tokens are transparently refreshed via MSAL's silent flow.
 */
class AuthMiddleware implements Middleware {
  private nextMiddleware?: Middleware;
  private readonly msalClient: MsalClient;

  constructor(msalClient: MsalClient) {
    this.msalClient = msalClient;
  }

  async execute(context: Context): Promise<void> {
    const token = await this.msalClient.getAccessToken();
    const bearerValue = `Bearer ${token}`;

    // Set the Authorization header on the request options.
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
 * Order: Logging -> Retry -> ErrorMapping -> Auth -> HTTPMessageHandler
 *
 * - LoggingMiddleware records structured request/response metadata.
 * - RetryMiddleware handles transient 429 / 5xx failures with exponential backoff.
 * - ErrorMappingMiddleware converts HTTP error responses to typed errors.
 * - AuthMiddleware attaches the Bearer token.
 * - HTTPMessageHandler performs the actual network fetch.
 */
function buildMiddlewareChain(msalClient: MsalClient): Middleware {
  const loggingMiddleware = new LoggingMiddleware();
  const retryMiddleware = new RetryMiddleware();
  const errorMappingMiddleware = new ErrorMappingMiddleware();
  const authMiddleware = new AuthMiddleware(msalClient);
  const httpMessageHandler = new HTTPMessageHandler();

  loggingMiddleware.setNext(retryMiddleware);
  retryMiddleware.setNext(errorMappingMiddleware);
  errorMappingMiddleware.setNext(authMiddleware);
  authMiddleware.setNext(httpMessageHandler);

  return loggingMiddleware;
}

/**
 * Creates a Microsoft Graph API client with a full middleware chain.
 *
 * Middleware order: Logging -> Retry -> ErrorMapping -> Auth -> HTTPMessageHandler
 */
export function createGraphClient(msalClient: MsalClient): Client {
  logger.debug("Creating Graph client with middleware chain");
  const middleware = buildMiddlewareChain(msalClient);
  return Client.initWithMiddleware({ middleware, defaultVersion: "v1.0" });
}

/**
 * Cache of Graph client instances keyed by "tenantId:clientId".
 *
 * Prevents redundant client creation for the same identity — each unique
 * MsalClient identity gets exactly one Graph client with its own middleware
 * chain.
 */
const clientCache = new Map<string, Client>();

/**
 * Returns a cached Graph client for the given MsalClient, creating one if
 * it does not already exist.
 *
 * The cache key is derived from the MsalClient's tenantId and clientId,
 * so identical credentials always share a single client instance.
 */
export function getGraphClient(msalClient: MsalClient): Client {
  const key = `${msalClient.tenantId}:${msalClient.clientId}`;
  let client = clientCache.get(key);
  if (!client) {
    client = createGraphClient(msalClient);
    clientCache.set(key, client);
    logger.debug({ tenantId: msalClient.tenantId }, "Graph client cached");
  }
  return client;
}

/**
 * Generates a unique request ID for Graph API call correlation.
 */
export function generateRequestId(): string {
  return randomUUID();
}
