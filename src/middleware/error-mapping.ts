/**
 * Graph client error-mapping middleware.
 *
 * Catches HTTP error responses from downstream middleware and maps them
 * to the typed error hierarchy defined in `src/utils/errors.ts`.
 *
 * Also catches network-level errors (ECONNREFUSED, ETIMEDOUT, etc.)
 * and wraps them in NetworkError.
 */

import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import {
  AuthError,
  ConflictError,
  GraphApiError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServiceError,
  ValidationError,
} from "../utils/errors.js";

/** Shape of the Graph API JSON error body. */
interface GraphErrorBody {
  error?: {
    code?: string;
    message?: string;
    innerError?: {
      "request-id"?: string;
      date?: string;
    };
  };
}

/**
 * Safely parse the response body as JSON.
 * Returns undefined if the body cannot be parsed.
 */
async function tryParseErrorBody(response: Response): Promise<GraphErrorBody | undefined> {
  try {
    // Clone so the body remains available for downstream consumers.
    const cloned = response.clone();
    const json: unknown = await cloned.json();
    if (typeof json === "object" && json !== null) {
      return json as GraphErrorBody;
    }
  } catch {
    // Body is not JSON — ignore.
  }
  return undefined;
}

/**
 * Parse Retry-After header from a 429 response into milliseconds.
 */
function parseRetryAfterMs(response: Response): number {
  const header = response.headers.get("Retry-After");
  if (!header) {
    return 1000; // 1s default
  }

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return 1000;
}

/**
 * Detect a resource type hint from the URL path segments.
 * E.g. "/v1.0/me/messages/abc123" -> "messages"
 */
function guessResourceType(request: Context["request"]): string {
  try {
    const url = typeof request === "string" ? request : request.url;
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    // Walk backwards to find the first segment that looks like a collection name.
    for (let i = segments.length - 2; i >= 0; i--) {
      const seg = segments[i];
      // Skip version-like segments (v1.0, beta)
      if (!seg.startsWith("v") && seg !== "me" && seg !== "users") {
        return seg;
      }
    }
  } catch {
    // ignore
  }
  return "resource";
}

/**
 * Extract a resource ID from the URL if the path ends with an ID-like segment.
 */
function guessResourceId(request: Context["request"]): string {
  try {
    const url = typeof request === "string" ? request : request.url;
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const last = segments.at(-1);
    if (last && last.length > 0 && last !== "me") {
      return last;
    }
  } catch {
    // ignore
  }
  return "unknown";
}

/**
 * Check if an unknown error looks like a network-level error
 * (e.g. ECONNREFUSED, ENOTFOUND, ETIMEDOUT).
 */
function isNetworkError(error: unknown): error is Error & { code: string; syscall?: string } {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as unknown as Record<string, unknown>).code;
  if (typeof code !== "string") {
    return false;
  }
  const networkCodes = [
    "ECONNREFUSED",
    "ECONNRESET",
    "ENOTFOUND",
    "ETIMEDOUT",
    "EPIPE",
    "EAI_AGAIN",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "UND_ERR_CONNECT_TIMEOUT",
  ];
  return networkCodes.includes(code);
}

/**
 * Map an HTTP status + body to the appropriate typed error.
 */
async function mapResponseToError(
  context: Context,
  status: number,
  body: GraphErrorBody | undefined,
): Promise<void> {
  const errorCode = body?.error?.code ?? "UnknownError";
  const errorMessage = body?.error?.message ?? "Unknown error";

  switch (status) {
    case 400:
      throw new ValidationError(errorMessage);
    case 401:
      throw new AuthError(errorMessage, 401);
    case 403: {
      // Attempt to extract the required scope from the error message
      const scopeMatch = errorMessage.match(/insufficient.*?scope.*?[:\s]+(\S+)/i);
      const requiredScope = scopeMatch?.[1];
      throw new AuthError(errorMessage, 403, requiredScope);
    }
    case 404:
      throw new NotFoundError(guessResourceType(context.request), guessResourceId(context.request));
    case 409:
      throw new ConflictError(errorMessage);
    case 429:
      throw new RateLimitError(context.response ? parseRetryAfterMs(context.response) : 1000);
    default:
      if (status >= 500 && status <= 599) {
        throw new ServiceError(errorMessage, status);
      }
      throw new GraphApiError(errorMessage, status, errorCode);
  }
}

/**
 * Middleware that maps Graph API HTTP errors to the typed error hierarchy.
 */
export class ErrorMappingMiddleware implements Middleware {
  private nextMiddleware?: Middleware;

  async execute(context: Context): Promise<void> {
    try {
      if (this.nextMiddleware) {
        await this.nextMiddleware.execute(context);
      }
    } catch (error: unknown) {
      // Wrap network-level errors
      if (isNetworkError(error)) {
        throw new NetworkError(error.message, error.syscall);
      }
      throw error;
    }

    // After successful execution, check the response status.
    const response = context.response;
    if (!response) {
      return;
    }

    const status = response.status;
    if (status >= 400) {
      const body = await tryParseErrorBody(response);
      await mapResponseToError(context, status, body);
    }
  }

  setNext(next: Middleware): void {
    this.nextMiddleware = next;
  }
}
