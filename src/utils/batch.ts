import type { Logger } from "pino";

// TODO (Phase 7): $batch endpoint support

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
