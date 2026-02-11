/**
 * Graph client logging middleware.
 *
 * Logs structured request/response metadata via pino.
 * NEVER logs PII, token values, request/response bodies, or email content.
 */

import { randomUUID } from "node:crypto";
import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("graph-http");

/**
 * Extracts the URL pathname from a Context request.
 * Handles both string URLs and Request objects.
 */
function extractEndpoint(request: Context["request"]): string {
  try {
    const url = typeof request === "string" ? request : request.url;
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return "unknown";
  }
}

/**
 * Extracts the HTTP method from a Context.
 * Defaults to "GET" if not determinable.
 */
function extractMethod(request: Context["request"], options?: Context["options"]): string {
  if (typeof request !== "string" && "method" in request) {
    return request.method.toUpperCase();
  }
  return options?.method?.toUpperCase() ?? "GET";
}

/**
 * Middleware that logs Graph API request/response metadata.
 *
 * Logged fields (safe, no PII):
 * - request_id, correlation_id
 * - method, endpoint
 * - status, duration_ms
 */
export class LoggingMiddleware implements Middleware {
  private nextMiddleware?: Middleware;

  async execute(context: Context): Promise<void> {
    const requestId = randomUUID();
    const method = extractMethod(context.request, context.options);
    const endpoint = extractEndpoint(context.request);
    const startTime = performance.now();

    logger.info({
      event: "graph_request",
      request_id: requestId,
      method,
      endpoint,
    });

    try {
      if (this.nextMiddleware) {
        await this.nextMiddleware.execute(context);
      }

      const durationMs = Math.round(performance.now() - startTime);
      const status = context.response?.status;
      const correlationId = context.response?.headers?.get("request-id") ?? undefined;

      logger.info({
        event: "graph_response",
        request_id: requestId,
        correlation_id: correlationId,
        method,
        endpoint,
        status,
        duration_ms: durationMs,
      });
    } catch (error: unknown) {
      const durationMs = Math.round(performance.now() - startTime);

      logger.error({
        event: "graph_error",
        request_id: requestId,
        method,
        endpoint,
        duration_ms: durationMs,
        error_name: error instanceof Error ? error.name : "UnknownError",
        error_code: isErrorWithCode(error) ? error.code : undefined,
      });

      throw error;
    }
  }

  setNext(next: Middleware): void {
    this.nextMiddleware = next;
  }
}

/**
 * Type guard: check if an unknown value is an Error-like object with a `code` property.
 */
function isErrorWithCode(value: unknown): value is Error & { code: string } {
  return (
    value instanceof Error && typeof (value as unknown as Record<string, unknown>).code === "string"
  );
}
