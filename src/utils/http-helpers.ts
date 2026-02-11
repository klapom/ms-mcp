/**
 * Parse the Retry-After header value into milliseconds.
 * Supports both delta-seconds and HTTP-date formats.
 * Returns undefined if the header is missing or unparseable.
 */
export function parseRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (!header) return undefined;

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());

  return undefined;
}
