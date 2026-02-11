/**
 * Parse the Retry-After header value into milliseconds.
 * Supports both delta-seconds and HTTP-date formats.
 * Returns the provided defaultMs if the header is missing or unparseable.
 */
export function parseRetryAfterMs(response: Response, defaultMs = 1000): number {
  const header = response.headers.get("Retry-After");
  if (!header) return defaultMs;

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());

  return defaultMs;
}
