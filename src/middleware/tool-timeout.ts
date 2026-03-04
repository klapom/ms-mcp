/**
 * Tool Timeout Middleware — AbortController-based timeout for tool invocations
 *
 * Wraps tool handlers with a configurable timeout (default: 120s) to prevent
 * indefinite hangs. Uses AbortController for clean cancellation.
 */

import type { ToolResult } from "../types/tools.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tool-timeout");

/** Default timeout in milliseconds (120 seconds). */
export const DEFAULT_TOOL_TIMEOUT_MS = 120_000;

/**
 * Error thrown when a tool invocation exceeds the configured timeout.
 */
export class ToolTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number) {
    super(`Tool "${toolName}" timed out after ${Math.ceil(timeoutMs / 1000)}s`);
    this.name = "ToolTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Wraps a tool handler function with an AbortController-based timeout.
 *
 * @param toolName - Name of the tool (for logging and error messages)
 * @param handler - The original tool handler function
 * @param timeoutMs - Timeout in milliseconds (default: 120_000)
 * @returns Wrapped handler that rejects after the timeout
 */
export function withTimeout<TParams>(
  toolName: string,
  handler: (params: TParams) => Promise<ToolResult>,
  timeoutMs: number = DEFAULT_TOOL_TIMEOUT_MS,
): (params: TParams) => Promise<ToolResult> {
  return async (params: TParams): Promise<ToolResult> => {
    const controller = new AbortController();
    const { signal } = controller;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const result = await Promise.race([
        handler(params),
        createTimeoutPromise(signal, toolName, timeoutMs),
      ]);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

/**
 * Creates a promise that rejects when the abort signal fires.
 */
function createTimeoutPromise(
  signal: AbortSignal,
  toolName: string,
  timeoutMs: number,
): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const onAbort = () => {
      logger.warn({ tool: toolName, timeoutMs }, "Tool invocation timed out");
      reject(new ToolTimeoutError(toolName, timeoutMs));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
