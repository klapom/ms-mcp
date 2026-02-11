import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkConfirmation, formatPreview } from "../src/utils/confirmation.js";
import {
  AuthError,
  ConflictError,
  McpToolError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServiceError,
  ValidationError,
  formatErrorForUser,
  isRetryableError,
} from "../src/utils/errors.js";
import { IdempotencyCache } from "../src/utils/idempotency.js";
import { RateLimiter } from "../src/utils/rate-limit.js";
import {
  DEFAULT_SELECT,
  buildSelectParam,
  shapeListResponse,
  truncateBody,
} from "../src/utils/response-shaper.js";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe("error classes", () => {
  describe("McpToolError", () => {
    it("should construct with all properties", () => {
      const error = new McpToolError("test message", "TEST_CODE", 400, false);
      expect(error.message).toBe("test message");
      expect(error.code).toBe("TEST_CODE");
      expect(error.httpStatus).toBe(400);
      expect(error.retryable).toBe(false);
      expect(error.name).toBe("McpToolError");
    });

    it("should default retryable to false", () => {
      const error = new McpToolError("msg", "CODE", 500);
      expect(error.retryable).toBe(false);
    });

    it("should be an instance of Error", () => {
      const error = new McpToolError("msg", "CODE");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("AuthError", () => {
    it("should construct with required scope", () => {
      const error = new AuthError("auth failed", 403, "Mail.ReadWrite");
      expect(error.code).toBe("AUTH_ERROR");
      expect(error.httpStatus).toBe(403);
      expect(error.requiredScope).toBe("Mail.ReadWrite");
      expect(error.retryable).toBe(false);
      expect(error.name).toBe("AuthError");
    });

    it("should construct without required scope", () => {
      const error = new AuthError("token expired", 401);
      expect(error.requiredScope).toBeUndefined();
    });
  });

  describe("ValidationError", () => {
    it("should construct with details", () => {
      const error = new ValidationError("field 'top' must be positive");
      expect(error.details).toBe("field 'top' must be positive");
      expect(error.httpStatus).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.name).toBe("ValidationError");
    });
  });

  describe("NotFoundError", () => {
    it("should construct with resource info", () => {
      const error = new NotFoundError("email", "msg-001");
      expect(error.resourceType).toBe("email");
      expect(error.resourceId).toBe("msg-001");
      expect(error.httpStatus).toBe(404);
      expect(error.code).toBe("NOT_FOUND_ERROR");
      expect(error.name).toBe("NotFoundError");
    });
  });

  describe("ConflictError", () => {
    it("should construct with details", () => {
      const error = new ConflictError("resource modified");
      expect(error.details).toBe("resource modified");
      expect(error.httpStatus).toBe(409);
      expect(error.code).toBe("CONFLICT_ERROR");
    });
  });

  describe("RateLimitError", () => {
    it("should construct with retryAfterMs", () => {
      const error = new RateLimitError(5000);
      expect(error.retryAfterMs).toBe(5000);
      expect(error.httpStatus).toBe(429);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe("RateLimitError");
    });
  });

  describe("ServiceError", () => {
    it("should be retryable", () => {
      const error = new ServiceError("service unavailable", 503);
      expect(error.retryable).toBe(true);
      expect(error.httpStatus).toBe(503);
      expect(error.name).toBe("ServiceError");
    });
  });

  describe("NetworkError", () => {
    it("should be retryable and store syscall", () => {
      const error = new NetworkError("connection refused", "ECONNREFUSED");
      expect(error.retryable).toBe(true);
      expect(error.syscall).toBe("ECONNREFUSED");
      expect(error.httpStatus).toBeUndefined();
      expect(error.name).toBe("NetworkError");
    });
  });
});

// ---------------------------------------------------------------------------
// formatErrorForUser (German messages)
// ---------------------------------------------------------------------------

describe("formatErrorForUser", () => {
  it("should format ValidationError in German", () => {
    const error = new ValidationError("invalid top");
    expect(formatErrorForUser(error)).toBe("Ungültige Parameter: invalid top");
  });

  it("should format AuthError 403 with scope", () => {
    const error = new AuthError("forbidden", 403, "Mail.ReadWrite");
    expect(formatErrorForUser(error)).toContain("Fehlende Berechtigung");
    expect(formatErrorForUser(error)).toContain("Mail.ReadWrite");
  });

  it("should format AuthError 401 as token expired", () => {
    const error = new AuthError("unauthorized", 401);
    expect(formatErrorForUser(error)).toContain("Anmeldung abgelaufen");
  });

  it("should format NotFoundError in German", () => {
    const error = new NotFoundError("email", "msg-001");
    expect(formatErrorForUser(error)).toContain("Ressource nicht gefunden");
    expect(formatErrorForUser(error)).toContain("email");
    expect(formatErrorForUser(error)).toContain("msg-001");
  });

  it("should format ConflictError in German", () => {
    const error = new ConflictError("already modified");
    expect(formatErrorForUser(error)).toContain("Konflikt");
  });

  it("should format RateLimitError with seconds", () => {
    const error = new RateLimitError(5000);
    const msg = formatErrorForUser(error);
    expect(msg).toContain("Rate-Limit");
    expect(msg).toContain("5 Sekunden");
  });

  it("should format ServiceError", () => {
    const error = new ServiceError("unavailable", 503);
    expect(formatErrorForUser(error)).toContain("temporär nicht verfügbar");
  });

  it("should format NetworkError", () => {
    const error = new NetworkError("no connection");
    expect(formatErrorForUser(error)).toContain("Keine Verbindung");
  });

  it("should fall back to error.message for generic McpToolError", () => {
    const error = new McpToolError("some generic error", "GENERIC");
    expect(formatErrorForUser(error)).toBe("some generic error");
  });
});

// ---------------------------------------------------------------------------
// isRetryableError
// ---------------------------------------------------------------------------

describe("isRetryableError", () => {
  it("should return true for RateLimitError", () => {
    expect(isRetryableError(new RateLimitError(1000))).toBe(true);
  });

  it("should return true for ServiceError", () => {
    expect(isRetryableError(new ServiceError("err", 500))).toBe(true);
  });

  it("should return true for NetworkError", () => {
    expect(isRetryableError(new NetworkError("err"))).toBe(true);
  });

  it("should return false for ValidationError", () => {
    expect(isRetryableError(new ValidationError("err"))).toBe(false);
  });

  it("should return false for AuthError", () => {
    expect(isRetryableError(new AuthError("err", 401))).toBe(false);
  });

  it("should return false for non-McpToolError", () => {
    expect(isRetryableError(new Error("plain error"))).toBe(false);
  });

  it("should return false for non-error values", () => {
    expect(isRetryableError("string")).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// response-shaper: truncateBody
// ---------------------------------------------------------------------------

describe("truncateBody", () => {
  it("should return body unchanged when under limit", () => {
    expect(truncateBody("short text", 100)).toBe("short text");
  });

  it("should truncate body at limit", () => {
    const long = "a".repeat(100);
    const result = truncateBody(long, 50);
    expect(result.length).toBe(50);
    expect(result).toContain("... [truncated]");
  });

  it("should handle body exactly at limit", () => {
    const exact = "a".repeat(50);
    expect(truncateBody(exact, 50)).toBe(exact);
  });

  it("should handle very small maxLength", () => {
    const result = truncateBody("hello world", 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("should use custom suffix", () => {
    const result = truncateBody("a".repeat(50), 20, "...");
    expect(result).toContain("...");
    expect(result.length).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// response-shaper: buildSelectParam
// ---------------------------------------------------------------------------

describe("buildSelectParam", () => {
  it("should join fields with commas", () => {
    expect(buildSelectParam(["id", "subject", "from"])).toBe("id,subject,from");
  });

  it("should handle single field", () => {
    expect(buildSelectParam(["id"])).toBe("id");
  });

  it("should handle empty array", () => {
    expect(buildSelectParam([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// response-shaper: DEFAULT_SELECT
// ---------------------------------------------------------------------------

describe("DEFAULT_SELECT", () => {
  it("should have mail fields", () => {
    expect(DEFAULT_SELECT.mail).toContain("id");
    expect(DEFAULT_SELECT.mail).toContain("subject");
    expect(DEFAULT_SELECT.mail).toContain("from");
    expect(DEFAULT_SELECT.mail).toContain("bodyPreview");
  });

  it("should have event fields", () => {
    expect(DEFAULT_SELECT.event).toContain("id");
    expect(DEFAULT_SELECT.event).toContain("subject");
  });

  it("should have file fields", () => {
    expect(DEFAULT_SELECT.file).toContain("id");
    expect(DEFAULT_SELECT.file).toContain("name");
  });
});

// ---------------------------------------------------------------------------
// response-shaper: shapeListResponse
// ---------------------------------------------------------------------------

describe("shapeListResponse", () => {
  const sampleItems = [
    { id: "1", subject: "Email 1", bodyPreview: "Preview text for email one" },
    { id: "2", subject: "Email 2", bodyPreview: "Preview text for email two" },
    { id: "3", subject: "Email 3", bodyPreview: "Preview text for email three" },
  ];

  // shapeListResponse calls loadConfig() internally, which requires these env vars
  const savedTenant = process.env.AZURE_TENANT_ID;
  const savedClient = process.env.AZURE_CLIENT_ID;

  beforeEach(() => {
    process.env.AZURE_TENANT_ID = "test-tenant";
    process.env.AZURE_CLIENT_ID = "test-client";
  });

  afterEach(() => {
    if (savedTenant === undefined) {
      // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset (assignment sets string "undefined")
      delete process.env.AZURE_TENANT_ID;
    } else {
      process.env.AZURE_TENANT_ID = savedTenant;
    }
    if (savedClient === undefined) {
      // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset (assignment sets string "undefined")
      delete process.env.AZURE_CLIENT_ID;
    } else {
      process.env.AZURE_CLIENT_ID = savedClient;
    }
  });

  it("should limit items to maxItems", () => {
    const { items } = shapeListResponse(sampleItems, 3, { maxItems: 2 });
    expect(items).toHaveLength(2);
  });

  it("should truncate body fields", () => {
    const { items } = shapeListResponse(sampleItems, 3, { maxBodyLength: 10 }, ["bodyPreview"]);
    for (const item of items) {
      expect(String(item.bodyPreview).length).toBeLessThanOrEqual(10);
    }
  });

  it("should include pagination hint with more results", () => {
    const { paginationHint } = shapeListResponse(sampleItems, 10, { maxItems: 3 });
    expect(paginationHint).toContain("3 von 10");
    expect(paginationHint).toContain("skip");
  });

  it("should show all results hint when no more pages", () => {
    const { paginationHint } = shapeListResponse(sampleItems, 3, { maxItems: 10 });
    expect(paginationHint).toContain("3 von 3");
    expect(paginationHint).not.toContain("skip");
  });

  it("should not mutate original items", () => {
    const original = [{ id: "1", bodyPreview: "a".repeat(100) }];
    shapeListResponse(original, 1, { maxBodyLength: 10 }, ["bodyPreview"]);
    expect(original[0].bodyPreview.length).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// confirmation: checkConfirmation
// ---------------------------------------------------------------------------

describe("checkConfirmation", () => {
  it("should return null for safe operations regardless of confirm", () => {
    expect(checkConfirmation("safe", false, "preview")).toBeNull();
    expect(checkConfirmation("safe", true, "preview")).toBeNull();
  });

  it("should return preview for moderate without confirm", () => {
    const result = checkConfirmation("moderate", false, "preview msg");
    expect(result).not.toBeNull();
    expect(result?.isPreview).toBe(true);
    expect(result?.message).toBe("preview msg");
  });

  it("should return null for moderate with confirm", () => {
    expect(checkConfirmation("moderate", true, "preview")).toBeNull();
  });

  it("should return preview for destructive without confirm", () => {
    const result = checkConfirmation("destructive", false, "danger preview");
    expect(result).not.toBeNull();
    expect(result?.isPreview).toBe(true);
  });

  it("should return null for destructive with confirm", () => {
    expect(checkConfirmation("destructive", true, "preview")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// confirmation: formatPreview
// ---------------------------------------------------------------------------

describe("formatPreview", () => {
  it("should format action and details", () => {
    const result = formatPreview("E-Mail löschen", {
      subject: "Test",
      id: "msg-001",
    });
    expect(result).toContain("Vorschau: E-Mail löschen");
    expect(result).toContain("subject: Test");
    expect(result).toContain("id: msg-001");
    expect(result).toContain("confirm: true");
  });

  it("should filter out undefined and null values", () => {
    const result = formatPreview("action", {
      present: "value",
      absent: undefined,
      empty: null,
    });
    expect(result).toContain("present: value");
    expect(result).not.toContain("absent");
    expect(result).not.toContain("empty");
  });
});

// ---------------------------------------------------------------------------
// idempotency: IdempotencyCache
// ---------------------------------------------------------------------------

describe("IdempotencyCache", () => {
  it("should set and get a cached result", () => {
    const cache = new IdempotencyCache();
    cache.set("tool1", "key1", { data: "result" });
    const result = cache.get("tool1", "key1");
    expect(result).toEqual({ data: "result" });
  });

  it("should return undefined for missing key", () => {
    const cache = new IdempotencyCache();
    expect(cache.get("tool1", "nonexistent")).toBeUndefined();
  });

  it("should expire entries after TTL", () => {
    vi.useFakeTimers();
    try {
      const cache = new IdempotencyCache(100); // 100ms TTL
      cache.set("tool1", "key1", "result");
      expect(cache.get("tool1", "key1")).toBe("result");

      vi.advanceTimersByTime(150);
      expect(cache.get("tool1", "key1")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("should cleanup expired entries", () => {
    vi.useFakeTimers();
    try {
      const cache = new IdempotencyCache(100);
      cache.set("tool1", "key1", "result1");
      cache.set("tool1", "key2", "result2");
      expect(cache.size).toBe(2);

      vi.advanceTimersByTime(150);
      cache.cleanup();
      expect(cache.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("should not expire entries within TTL", () => {
    vi.useFakeTimers();
    try {
      const cache = new IdempotencyCache(1000);
      cache.set("tool1", "key1", "result");

      vi.advanceTimersByTime(500);
      expect(cache.get("tool1", "key1")).toBe("result");
    } finally {
      vi.useRealTimers();
    }
  });

  it("should track cache size", () => {
    const cache = new IdempotencyCache();
    expect(cache.size).toBe(0);
    cache.set("tool1", "a", 1);
    expect(cache.size).toBe(1);
    cache.set("tool1", "b", 2);
    expect(cache.size).toBe(2);
  });

  it("should use composite key from tool name and idempotency key", () => {
    const cache = new IdempotencyCache();
    cache.set("tool_a", "key1", "result_a");
    cache.set("tool_b", "key1", "result_b");
    expect(cache.get("tool_a", "key1")).toBe("result_a");
    expect(cache.get("tool_b", "key1")).toBe("result_b");
  });
});

// ---------------------------------------------------------------------------
// rate-limit: RateLimiter
// ---------------------------------------------------------------------------

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return 0 wait time when not rate limited", () => {
    const limiter = new RateLimiter();
    expect(limiter.getWaitTime()).toBe(0);
  });

  it("should record retry-after and report wait time", () => {
    const limiter = new RateLimiter();
    limiter.setRetryAfter(5); // 5 seconds
    const waitTime = limiter.getWaitTime();
    expect(waitTime).toBeGreaterThan(0);
    expect(waitTime).toBeLessThanOrEqual(5000);
  });

  it("should return 0 wait time after retry-after expires", () => {
    const limiter = new RateLimiter();
    limiter.setRetryAfter(2);
    vi.advanceTimersByTime(2500);
    expect(limiter.getWaitTime()).toBe(0);
  });

  it("should wait if needed", async () => {
    const limiter = new RateLimiter();
    limiter.setRetryAfter(1);

    const waitPromise = limiter.waitIfNeeded();
    vi.advanceTimersByTime(1000);
    await waitPromise;

    expect(limiter.getWaitTime()).toBe(0);
  });

  it("should not wait when not rate limited", async () => {
    const limiter = new RateLimiter();
    await limiter.waitIfNeeded();
    expect(limiter.getWaitTime()).toBe(0);
  });
});
