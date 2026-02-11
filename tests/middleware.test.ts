import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorMappingMiddleware } from "../src/middleware/error-mapping.js";
import { LoggingMiddleware } from "../src/middleware/logging.js";
import { RetryMiddleware } from "../src/middleware/retry.js";
import {
  AuthError,
  ConflictError,
  GraphApiError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServiceError,
  ValidationError,
} from "../src/utils/errors.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a mock Graph API context with a string URL and HTTP method. */
function createMockContext(
  url = "https://graph.microsoft.com/v1.0/me/messages",
  method = "GET",
): Context {
  return {
    request: url,
    options: { method },
    response: undefined as unknown as Response,
  } as Context;
}

/** Create a mock next middleware that sets the given response on the context. */
function createNextMiddleware(response: Response): Middleware {
  return {
    execute: vi.fn(async (context: Context) => {
      context.response = response;
    }),
    setNext: vi.fn(),
  };
}

/** Create a mock next middleware whose execute fn can be customised. */
function createNextMiddlewareWithFn(executeFn: (context: Context) => Promise<void>): Middleware {
  return {
    execute: vi.fn(executeFn),
    setNext: vi.fn(),
  };
}

/** Create a standard Response object for testing. */
function createMockResponse(
  status: number,
  body?: unknown,
  headers?: Record<string, string>,
): Response {
  const responseHeaders = new Headers(headers);
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: responseHeaders,
  });
}

// ---------------------------------------------------------------------------
// LoggingMiddleware
// ---------------------------------------------------------------------------

describe("LoggingMiddleware", () => {
  // Suppress pino output during tests
  beforeEach(() => {
    vi.mock("../src/utils/logger.js", () => ({
      createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call next middleware and pass through successful responses", async () => {
    const middleware = new LoggingMiddleware();
    const response = createMockResponse(200);
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();
    await middleware.execute(context);

    expect(next.execute).toHaveBeenCalledOnce();
    expect(context.response).toBe(response);
  });

  it("should not throw when no next middleware is set", async () => {
    const middleware = new LoggingMiddleware();
    const context = createMockContext();
    await expect(middleware.execute(context)).resolves.toBeUndefined();
  });

  it("should rethrow errors from next middleware", async () => {
    const middleware = new LoggingMiddleware();
    const error = new Error("downstream failure");
    const next = createNextMiddlewareWithFn(async () => {
      throw error;
    });
    middleware.setNext(next);

    const context = createMockContext();
    await expect(middleware.execute(context)).rejects.toThrow("downstream failure");
  });

  it("should handle missing response gracefully", async () => {
    const middleware = new LoggingMiddleware();
    // Next middleware does not set a response
    const next = createNextMiddlewareWithFn(async () => {
      // intentionally empty
    });
    middleware.setNext(next);

    const context = createMockContext();
    await expect(middleware.execute(context)).resolves.toBeUndefined();
  });

  it("should extract endpoint from URL correctly", async () => {
    const middleware = new LoggingMiddleware();
    const response = createMockResponse(200, undefined, {
      "request-id": "corr-123",
    });
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    // The important thing is it doesn't throw on various URL shapes
    const context = createMockContext(
      "https://graph.microsoft.com/v1.0/users/abc/mailFolders/inbox/messages",
    );
    await expect(middleware.execute(context)).resolves.toBeUndefined();
  });

  it("should handle an invalid URL without crashing", async () => {
    const middleware = new LoggingMiddleware();
    const response = createMockResponse(200);
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext("not-a-valid-url");
    await expect(middleware.execute(context)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// RetryMiddleware
// ---------------------------------------------------------------------------

describe("RetryMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Suppress pino logging during retry tests
    vi.mock("../src/utils/logger.js", () => ({
      createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should not retry on successful 200 response", async () => {
    const middleware = new RetryMiddleware({ maxRetries: 3, baseDelay: 100, maxDelay: 1000 });
    const response = createMockResponse(200);
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();
    await middleware.execute(context);

    expect(next.execute).toHaveBeenCalledOnce();
    expect(context.response.status).toBe(200);
  });

  it("should not retry on non-retryable 400 status", async () => {
    const middleware = new RetryMiddleware({ maxRetries: 3, baseDelay: 100, maxDelay: 1000 });
    const response = createMockResponse(400, { error: { message: "Bad request" } });
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();
    await middleware.execute(context);

    expect(next.execute).toHaveBeenCalledOnce();
    expect(context.response.status).toBe(400);
  });

  it("should retry on 429 status up to maxRetries", async () => {
    const maxRetries = 2;
    const middleware = new RetryMiddleware({
      maxRetries,
      baseDelay: 100,
      maxDelay: 1000,
      respectRetryAfter: false,
    });

    // Always return 429
    const next = createNextMiddlewareWithFn(async (ctx: Context) => {
      ctx.response = createMockResponse(429);
    });
    middleware.setNext(next);

    const context = createMockContext();
    const executePromise = middleware.execute(context);

    // Advance timers enough for all retries to complete
    for (let i = 0; i < maxRetries; i++) {
      await vi.advanceTimersByTimeAsync(2000);
    }

    await executePromise;

    // Initial attempt + maxRetries retries = maxRetries + 1 total calls
    expect(next.execute).toHaveBeenCalledTimes(maxRetries + 1);
  });

  it("should retry on 500 status with backoff", async () => {
    const middleware = new RetryMiddleware({
      maxRetries: 2,
      baseDelay: 100,
      maxDelay: 5000,
    });

    let callCount = 0;
    const next = createNextMiddlewareWithFn(async (ctx: Context) => {
      callCount++;
      if (callCount < 3) {
        ctx.response = createMockResponse(500, { error: { message: "Internal error" } });
      } else {
        ctx.response = createMockResponse(200);
      }
    });
    middleware.setNext(next);

    const context = createMockContext();
    const executePromise = middleware.execute(context);

    // Advance timers generously to allow retries to proceed
    await vi.advanceTimersByTimeAsync(10000);
    await executePromise;

    expect(callCount).toBe(3);
    expect(context.response.status).toBe(200);
  });

  it("should respect Retry-After header on 429", async () => {
    const middleware = new RetryMiddleware({
      maxRetries: 1,
      baseDelay: 100,
      maxDelay: 60000,
      respectRetryAfter: true,
    });

    let callCount = 0;
    const next = createNextMiddlewareWithFn(async (ctx: Context) => {
      callCount++;
      if (callCount === 1) {
        ctx.response = createMockResponse(429, null, { "Retry-After": "5" });
      } else {
        ctx.response = createMockResponse(200);
      }
    });
    middleware.setNext(next);

    const context = createMockContext();
    const executePromise = middleware.execute(context);

    // Retry-After: 5 means 5000ms wait
    await vi.advanceTimersByTimeAsync(6000);
    await executePromise;

    expect(callCount).toBe(2);
    expect(context.response.status).toBe(200);
  });

  it("should stop retrying after maxRetries exhausted", async () => {
    const maxRetries = 2;
    const middleware = new RetryMiddleware({
      maxRetries,
      baseDelay: 50,
      maxDelay: 500,
      respectRetryAfter: false,
    });

    // Always return 503
    const next = createNextMiddlewareWithFn(async (ctx: Context) => {
      ctx.response = createMockResponse(503);
    });
    middleware.setNext(next);

    const context = createMockContext();
    const executePromise = middleware.execute(context);

    await vi.advanceTimersByTimeAsync(10000);
    await executePromise;

    // 1 initial + maxRetries retries
    expect(next.execute).toHaveBeenCalledTimes(maxRetries + 1);
    // Response should be the last 503
    expect(context.response.status).toBe(503);
  });

  it("should respect custom config", async () => {
    const middleware = new RetryMiddleware({
      maxRetries: 1,
      baseDelay: 50,
      maxDelay: 200,
      retryableStatuses: [502],
      respectRetryAfter: false,
    });

    // 502 should be retried, 503 should not
    let callCount = 0;
    const next = createNextMiddlewareWithFn(async (ctx: Context) => {
      callCount++;
      ctx.response = createMockResponse(502);
    });
    middleware.setNext(next);

    const context = createMockContext();
    const executePromise = middleware.execute(context);

    await vi.advanceTimersByTimeAsync(5000);
    await executePromise;

    // maxRetries = 1 -> 2 total calls (initial + 1 retry)
    expect(callCount).toBe(2);
  });

  it("should not retry when retryableStatuses does not include the status", async () => {
    const middleware = new RetryMiddleware({
      maxRetries: 3,
      baseDelay: 50,
      maxDelay: 200,
      retryableStatuses: [429], // only 429 is retryable
    });

    const next = createNextMiddlewareWithFn(async (ctx: Context) => {
      ctx.response = createMockResponse(503);
    });
    middleware.setNext(next);

    const context = createMockContext();
    await middleware.execute(context);

    // Should not retry at all since 503 is not in retryableStatuses
    expect(next.execute).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// ErrorMappingMiddleware
// ---------------------------------------------------------------------------

describe("ErrorMappingMiddleware", () => {
  beforeEach(() => {
    vi.mock("../src/utils/logger.js", () => ({
      createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should pass through successful 200 responses", async () => {
    const middleware = new ErrorMappingMiddleware();
    const response = createMockResponse(200, { value: [] });
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();
    await middleware.execute(context);

    expect(context.response.status).toBe(200);
  });

  it("should throw ValidationError for 400", async () => {
    const middleware = new ErrorMappingMiddleware();
    const body = { error: { code: "BadRequest", message: "Invalid filter" } };
    const response = createMockResponse(400, body);
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();
    await expect(middleware.execute(context)).rejects.toThrow(ValidationError);

    try {
      await middleware.execute(createMockContext());
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).httpStatus).toBe(400);
    }
  });

  it("should throw AuthError for 401", async () => {
    const middleware = new ErrorMappingMiddleware();
    const body = { error: { code: "Unauthorized", message: "Token expired" } };
    const response = createMockResponse(401, body);
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();

    try {
      await middleware.execute(context);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).httpStatus).toBe(401);
    }
  });

  it("should throw AuthError with scope for 403", async () => {
    const middleware = new ErrorMappingMiddleware();
    const body = {
      error: {
        code: "Forbidden",
        message: "Insufficient scope: Mail.ReadWrite required",
      },
    };
    const response = createMockResponse(403, body);
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();

    try {
      await middleware.execute(context);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).httpStatus).toBe(403);
    }
  });

  it("should throw NotFoundError for 404", async () => {
    const middleware = new ErrorMappingMiddleware();
    const body = { error: { code: "ResourceNotFound", message: "Not found" } };
    const response = createMockResponse(404, body);
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext("https://graph.microsoft.com/v1.0/me/messages/msg-001");

    try {
      await middleware.execute(context);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundError);
      expect((e as NotFoundError).httpStatus).toBe(404);
      expect((e as NotFoundError).resourceId).toBe("msg-001");
      expect((e as NotFoundError).resourceType).toBe("messages");
    }
  });

  it("should throw ConflictError for 409", async () => {
    const middleware = new ErrorMappingMiddleware();
    const body = { error: { code: "Conflict", message: "Resource modified" } };
    const response = createMockResponse(409, body);
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();

    try {
      await middleware.execute(context);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictError);
      expect((e as ConflictError).httpStatus).toBe(409);
    }
  });

  it("should throw RateLimitError for 429", async () => {
    const middleware = new ErrorMappingMiddleware();
    const body = { error: { code: "TooManyRequests", message: "Throttled" } };
    const response = createMockResponse(429, body, { "Retry-After": "10" });
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();

    try {
      await middleware.execute(context);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).httpStatus).toBe(429);
      expect((e as RateLimitError).retryAfterMs).toBe(10000);
    }
  });

  it("should throw ServiceError for 500", async () => {
    const middleware = new ErrorMappingMiddleware();
    const body = {
      error: { code: "InternalServerError", message: "Server error" },
    };
    const response = createMockResponse(500, body);
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();

    try {
      await middleware.execute(context);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceError);
      expect((e as ServiceError).httpStatus).toBe(500);
    }
  });

  it("should throw ServiceError for 502", async () => {
    const middleware = new ErrorMappingMiddleware();
    const response = createMockResponse(502, {
      error: { code: "BadGateway", message: "Bad gateway" },
    });
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();
    await expect(middleware.execute(context)).rejects.toThrow(ServiceError);
  });

  it("should throw ServiceError for 503", async () => {
    const middleware = new ErrorMappingMiddleware();
    const response = createMockResponse(503, {
      error: { code: "ServiceUnavailable", message: "Unavailable" },
    });
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();
    await expect(middleware.execute(context)).rejects.toThrow(ServiceError);
  });

  it("should throw NetworkError for ECONNREFUSED-like errors", async () => {
    const middleware = new ErrorMappingMiddleware();
    const networkErr = new Error("connect ECONNREFUSED 127.0.0.1:443");
    Object.assign(networkErr, { code: "ECONNREFUSED", syscall: "connect" });

    const next = createNextMiddlewareWithFn(async () => {
      throw networkErr;
    });
    middleware.setNext(next);

    const context = createMockContext();

    try {
      await middleware.execute(context);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(NetworkError);
      expect((e as NetworkError).syscall).toBe("connect");
    }
  });

  it("should throw NetworkError for ETIMEDOUT", async () => {
    const middleware = new ErrorMappingMiddleware();
    const networkErr = new Error("connect ETIMEDOUT");
    Object.assign(networkErr, { code: "ETIMEDOUT" });

    const next = createNextMiddlewareWithFn(async () => {
      throw networkErr;
    });
    middleware.setNext(next);

    const context = createMockContext();
    await expect(middleware.execute(context)).rejects.toThrow(NetworkError);
  });

  it("should rethrow non-network errors as-is", async () => {
    const middleware = new ErrorMappingMiddleware();
    const genericErr = new Error("something unexpected");

    const next = createNextMiddlewareWithFn(async () => {
      throw genericErr;
    });
    middleware.setNext(next);

    const context = createMockContext();

    try {
      await middleware.execute(context);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBe(genericErr);
      expect(e).not.toBeInstanceOf(NetworkError);
    }
  });

  it("should parse Graph API error body for error details", async () => {
    const middleware = new ErrorMappingMiddleware();
    const body = {
      error: {
        code: "BadRequest",
        message: "The filter clause is not valid.",
        innerError: {
          "request-id": "req-abc-123",
          date: "2024-01-01T00:00:00Z",
        },
      },
    };
    const response = createMockResponse(400, body);
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();

    try {
      await middleware.execute(context);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      // The error message should contain the parsed message from the body
      expect((e as ValidationError).message).toContain("The filter clause is not valid.");
    }
  });

  it("should handle non-JSON error body gracefully", async () => {
    const middleware = new ErrorMappingMiddleware();
    // Create a response with a non-JSON body
    const response = new Response("This is not JSON", {
      status: 500,
      headers: new Headers(),
    });
    const next = createNextMiddlewareWithFn(async (ctx: Context) => {
      ctx.response = response;
    });
    middleware.setNext(next);

    const context = createMockContext();

    try {
      await middleware.execute(context);
      expect.unreachable("Should have thrown");
    } catch (e) {
      // Should still throw a ServiceError with default message
      expect(e).toBeInstanceOf(ServiceError);
      expect((e as ServiceError).message).toContain("Unknown error");
    }
  });

  it("should handle response with empty body", async () => {
    const middleware = new ErrorMappingMiddleware();
    const response = new Response(null, { status: 404 });
    const next = createNextMiddlewareWithFn(async (ctx: Context) => {
      ctx.response = response;
    });
    middleware.setNext(next);

    const context = createMockContext("https://graph.microsoft.com/v1.0/me/messages/nonexistent");

    await expect(middleware.execute(context)).rejects.toThrow(NotFoundError);
  });

  it("should return without error when no response is set", async () => {
    const middleware = new ErrorMappingMiddleware();
    // Next middleware does nothing, leaving context.response undefined
    const next = createNextMiddlewareWithFn(async () => {
      // intentionally empty
    });
    middleware.setNext(next);

    const context = createMockContext();
    await expect(middleware.execute(context)).resolves.toBeUndefined();
  });

  it("should throw GraphApiError for unmapped 4xx status codes", async () => {
    const middleware = new ErrorMappingMiddleware();
    const body = {
      error: { code: "MethodNotAllowed", message: "Method not allowed" },
    };
    const response = createMockResponse(405, body);
    const next = createNextMiddleware(response);
    middleware.setNext(next);

    const context = createMockContext();

    try {
      await middleware.execute(context);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(GraphApiError);
      expect((e as GraphApiError).httpStatus).toBe(405);
      expect((e as GraphApiError).errorCode).toBe("MethodNotAllowed");
    }
  });
});
