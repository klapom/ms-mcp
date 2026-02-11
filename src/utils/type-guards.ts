/**
 * Runtime type guard that checks if a value is a non-null object.
 * Useful for safely narrowing `unknown` to `Record<string, unknown>`.
 */
export function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
