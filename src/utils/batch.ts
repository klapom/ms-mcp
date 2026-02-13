import type { Client } from "@microsoft/microsoft-graph-client";
import type { Logger } from "pino";

// ---------------------------------------------------------------------------
// Legacy: Promise.allSettled batch helper (kept for backward compatibility)
// ---------------------------------------------------------------------------

export interface BatchResult<T> {
  results: T[];
  failedCount: number;
}

/**
 * Runs multiple promises in parallel via Promise.allSettled.
 * Collects successful results and counts failures.
 * Logs each failure with the actual error for debugging.
 */
export async function batchFetchSettled<T>(
  tasks: Promise<T>[],
  logger: Logger,
  context: string,
): Promise<BatchResult<T>> {
  const settled = await Promise.allSettled(tasks);
  const results: T[] = [];
  let failedCount = 0;

  for (const result of settled) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      failedCount++;
      logger.warn({ error: result.reason, context }, "Batch item failed");
    }
  }

  return { results, failedCount };
}

// ---------------------------------------------------------------------------
// Graph $batch endpoint support
// ---------------------------------------------------------------------------

export interface GraphBatchRequest {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface GraphBatchResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface GraphBatchResult {
  responses: GraphBatchResponse[];
}

/**
 * Builds a $batch request payload. Throws if >20 requests.
 */
export function buildBatchRequest(requests: GraphBatchRequest[]): {
  requests: GraphBatchRequest[];
} {
  if (requests.length > 20) {
    throw new Error("Graph API $batch supports max 20 requests");
  }
  return { requests };
}

/**
 * Executes a $batch POST against the Graph API.
 */
export async function executeBatch(
  graphClient: Client,
  requests: GraphBatchRequest[],
): Promise<GraphBatchResult> {
  const batchBody = buildBatchRequest(requests);
  const result = await graphClient.api("/$batch").post(batchBody);
  return result as GraphBatchResult;
}

export interface GraphBatchSummary {
  successCount: number;
  failureCount: number;
  failures: Array<{ id: string; status: number; error?: string }>;
}

/**
 * Summarizes a $batch result into success/failure counts.
 */
export function summarizeBatchResult(result: GraphBatchResult): GraphBatchSummary {
  const failures: Array<{ id: string; status: number; error?: string }> = [];
  let successCount = 0;

  for (const response of result.responses) {
    if (response.status >= 200 && response.status < 300) {
      successCount++;
    } else {
      failures.push({
        id: response.id,
        status: response.status,
        error: extractErrorMessage(response.body),
      });
    }
  }

  return { successCount, failureCount: failures.length, failures };
}

function extractErrorMessage(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null) {
    const errObj = (body as { error?: { message?: string } }).error;
    return errObj?.message;
  }
  return undefined;
}

/**
 * Formats a batch summary into a human-readable string.
 */
export function formatBatchSummary(
  summary: GraphBatchSummary,
  successVerb: string,
  failedVerb: string,
): string {
  const parts: string[] = [`\u2713 ${summary.successCount} ${successVerb}`];

  if (summary.failureCount > 0) {
    const failDetails = summary.failures
      .map((f) => `${f.id} (${f.status}${f.error ? ` ${f.error}` : ""})`)
      .join(", ");
    parts.push(`\u2717 ${summary.failureCount} ${failedVerb}: ${failDetails}`);
  } else {
    parts.push(`\u2717 ${summary.failureCount} ${failedVerb}`);
  }

  return parts.join(", ");
}
