/**
 * Error class hierarchy for MS-MCP.
 *
 * Maps Microsoft Graph API HTTP errors to typed, user-friendly errors
 * with German-language messages as required by the project spec.
 */

// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

export class McpToolError extends Error {
  readonly code: string;
  readonly httpStatus?: number;
  readonly retryable: boolean;

  constructor(message: string, code: string, httpStatus?: number, retryable = false) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

// ---------------------------------------------------------------------------
// Graph API error (generic wrapper for Graph HTTP errors)
// ---------------------------------------------------------------------------

export class GraphApiError extends McpToolError {
  readonly errorCode: string;
  readonly requiredScope?: string;

  constructor(
    message: string,
    httpStatus: number,
    errorCode: string,
    requiredScope?: string,
    retryable = false,
  ) {
    super(message, "GRAPH_API_ERROR", httpStatus, retryable);
    this.name = "GraphApiError";
    this.errorCode = errorCode;
    this.requiredScope = requiredScope;
  }
}

// ---------------------------------------------------------------------------
// Auth error (401 / 403)
// ---------------------------------------------------------------------------

export class AuthError extends McpToolError {
  readonly requiredScope?: string;

  constructor(message: string, httpStatus: number, requiredScope?: string) {
    super(message, "AUTH_ERROR", httpStatus, false);
    this.name = "AuthError";
    this.requiredScope = requiredScope;
  }
}

// ---------------------------------------------------------------------------
// Validation error (400)
// ---------------------------------------------------------------------------

export class ValidationError extends McpToolError {
  readonly details: string;

  constructor(details: string) {
    super(`Validation failed: ${details}`, "VALIDATION_ERROR", 400, false);
    this.name = "ValidationError";
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Not found error (404)
// ---------------------------------------------------------------------------

export class NotFoundError extends McpToolError {
  readonly resourceType: string;
  readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(
      `Resource not found: ${resourceType} with ID ${resourceId}`,
      "NOT_FOUND_ERROR",
      404,
      false,
    );
    this.name = "NotFoundError";
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

// ---------------------------------------------------------------------------
// Conflict error (409)
// ---------------------------------------------------------------------------

export class ConflictError extends McpToolError {
  readonly details: string;

  constructor(details: string) {
    super(`Conflict: ${details}`, "CONFLICT_ERROR", 409, false);
    this.name = "ConflictError";
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Rate limit error (429)
// ---------------------------------------------------------------------------

export class RateLimitError extends McpToolError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded. Retry after ${Math.ceil(retryAfterMs / 1000)}s`,
      "RATE_LIMIT_ERROR",
      429,
      true,
    );
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// Service error (500-503, retryable)
// ---------------------------------------------------------------------------

export class ServiceError extends McpToolError {
  constructor(message: string, httpStatus: number) {
    super(message, "SERVICE_ERROR", httpStatus, true);
    this.name = "ServiceError";
  }
}

// ---------------------------------------------------------------------------
// Network error (ECONNREFUSED, ETIMEDOUT, etc.)
// ---------------------------------------------------------------------------

export class NetworkError extends McpToolError {
  readonly syscall?: string;

  constructor(message: string, syscall?: string) {
    super(message, "NETWORK_ERROR", undefined, true);
    this.name = "NetworkError";
    this.syscall = syscall;
  }
}

// ---------------------------------------------------------------------------
// Helper: check if an error is retryable
// ---------------------------------------------------------------------------

export function isRetryableError(error: unknown): boolean {
  if (error instanceof McpToolError) {
    return error.retryable;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helper: format error for user
// ---------------------------------------------------------------------------

export function formatErrorForUser(error: McpToolError): string {
  if (error instanceof ValidationError) {
    return `Invalid parameters: ${error.details}`;
  }

  if (error instanceof AuthError) {
    if (error.httpStatus === 403 && error.requiredScope) {
      return `Missing permission: ${error.requiredScope}. Admin consent required.`;
    }
    return "Authentication expired. Please refresh your token.";
  }

  if (error instanceof NotFoundError) {
    return `Resource not found: ${error.resourceType} with ID ${error.resourceId}`;
  }

  if (error instanceof ConflictError) {
    return `Conflict: ${error.details}. Resource was modified in the meantime.`;
  }

  if (error instanceof RateLimitError) {
    const seconds = Math.ceil(error.retryAfterMs / 1000);
    return `Rate limit reached. Automatic retry in ${seconds} seconds.`;
  }

  if (error instanceof ServiceError) {
    return "Microsoft Graph API temporarily unavailable.";
  }

  if (error instanceof NetworkError) {
    return "No connection to Microsoft Graph. Check your network.";
  }

  // Fallback for generic McpToolError / GraphApiError
  return error.message;
}
