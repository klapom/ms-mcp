import type { Client } from "@microsoft/microsoft-graph-client";
import { ValidationError } from "./errors.js";
import { createLogger } from "./logger.js";

const log = createLogger("pagination");

export interface PaginatedResponse<T> {
  items: T[];
  totalCount?: number;
  nextLink?: string;
  /**
   * Opaque `$skiptoken` value taken from `@odata.nextLink` (undefined when the
   * link is missing or does not use `$skiptoken`).
   */
  nextSkipToken?: string;
  hasMore: boolean;
}

/**
 * Allowed shape of an opaque page token. Deliberately excludes ':' and '&' / '?'
 * / '#', so a URL (or an extra query parameter) can never be smuggled in.
 */
const PAGE_TOKEN_REGEX = /^[A-Za-z0-9._~%=+/-]{1,4096}$/;

/**
 * Validates a caller-supplied page token (and its exclusivity with `skip`).
 * The token is only ever appended as `$skiptoken` to a request that is rebuilt
 * from the current parameters - it is never used as (part of) a URL.
 */
export function assertValidPageToken(pageToken: string | undefined, skip?: number): void {
  if (pageToken === undefined) return;
  if (skip !== undefined) {
    throw new ValidationError("page_token and skip are mutually exclusive. Provide only one.");
  }
  if (!PAGE_TOKEN_REGEX.test(pageToken) || pageToken.includes("//")) {
    throw new ValidationError(
      "page_token is invalid. Pass the opaque token exactly as returned by the previous page " +
        "(not a URL).",
    );
  }
}

/**
 * Extracts the raw (still URL-encoded, so it round-trips byte-exact) value of
 * `$skiptoken` from an `@odata.nextLink`. Returns undefined if absent/unparsable.
 */
export function extractSkipToken(nextLink: string | undefined): string | undefined {
  if (nextLink === undefined) return undefined;
  let search: string;
  try {
    search = new URL(nextLink).search;
  } catch {
    return undefined;
  }
  for (const part of search.replace(/^\?/, "").split("&")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    let key: string;
    try {
      key = decodeURIComponent(part.slice(0, idx));
    } catch {
      continue;
    }
    if (key.toLowerCase() === "$skiptoken") {
      const value = part.slice(idx + 1);
      return value === "" ? undefined : value;
    }
  }
  return undefined;
}

/**
 * Type guard for Graph API list responses.
 */
function isGraphListResponse(data: unknown): data is {
  value: unknown[];
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
} {
  return (
    typeof data === "object" &&
    data !== null &&
    "value" in data &&
    Array.isArray((data as Record<string, unknown>).value)
  );
}

/**
 * Fetches a single page from Graph API.
 */
export async function fetchPage<T>(
  client: Client,
  url: string,
  params?: {
    top?: number;
    skip?: number;
    /** Opaque `$skiptoken` from a previous page's nextSkipToken (validated by the caller). */
    skipToken?: string;
    select?: string;
    filter?: string;
    orderby?: string;
    /** Arbitrary query parameters (e.g. calendarView's startDateTime/endDateTime). */
    query?: Record<string, string>;
    /** HTTP headers to add to the request (e.g. Prefer for timezone). */
    headers?: Record<string, string>;
  },
): Promise<PaginatedResponse<T>> {
  let request = client.api(url);

  if (params?.headers) {
    for (const [key, value] of Object.entries(params.headers)) {
      request = request.header(key, value);
    }
  }
  if (params?.query) {
    request = request.query(params.query);
  }
  if (params?.top !== undefined) {
    request = request.top(params.top);
  }
  if (params?.skip !== undefined) {
    request = request.skip(params.skip);
  }
  if (params?.skipToken !== undefined) {
    request = request.query({ $skiptoken: params.skipToken });
  }
  if (params?.select) {
    request = request.select(params.select);
  }
  if (params?.filter) {
    request = request.filter(params.filter);
  }
  if (params?.orderby) {
    request = request.orderby(params.orderby);
  }

  const response: unknown = await request.get();

  if (!isGraphListResponse(response)) {
    log.warn({ url }, "Response is not a standard Graph list response");
    return {
      items: [],
      totalCount: undefined,
      nextLink: undefined,
      nextSkipToken: undefined,
      hasMore: false,
    };
  }

  const items = response.value as T[];
  const totalCount =
    typeof response["@odata.count"] === "number" ? response["@odata.count"] : undefined;
  const nextLink =
    typeof response["@odata.nextLink"] === "string" ? response["@odata.nextLink"] : undefined;

  log.debug({ url, itemCount: items.length, totalCount, hasNextLink: !!nextLink }, "Fetched page");

  return {
    items,
    totalCount,
    nextLink,
    nextSkipToken: extractSkipToken(nextLink),
    hasMore: nextLink !== undefined,
  };
}

/**
 * Extracts the @odata.nextLink from a Graph API response, if present.
 */
function extractNextLink(response: { "@odata.nextLink"?: string }): string | undefined {
  const link = response["@odata.nextLink"];
  return typeof link === "string" ? link : undefined;
}

/**
 * Limits items to the remaining budget and returns the trimmed array.
 */
function applyItemLimit<T>(items: T[], yielded: number, maxItems: number): T[] {
  const remaining = maxItems - yielded;
  if (items.length > remaining) {
    return items.slice(0, remaining);
  }
  return items;
}

/**
 * Async generator that yields items across multiple pages.
 * Respects maxItems limit.
 */
export async function* paginate<T>(
  client: Client,
  url: string,
  maxItems?: number,
): AsyncGenerator<T[], void, unknown> {
  let yielded = 0;
  let nextUrl: string | undefined = url;

  while (nextUrl !== undefined) {
    const response: unknown = await client.api(nextUrl).get();

    if (!isGraphListResponse(response)) {
      log.warn({ url: nextUrl }, "Non-list response during pagination");
      return;
    }

    const rawItems = response.value as T[];
    const items = maxItems !== undefined ? applyItemLimit(rawItems, yielded, maxItems) : rawItems;

    yield items;
    yielded += items.length;

    if (maxItems !== undefined && yielded >= maxItems) {
      log.debug({ yielded, maxItems }, "Reached maxItems limit");
      return;
    }

    nextUrl = extractNextLink(response);
  }
}

/**
 * Pagination hint for token-paged (OneDrive) lists. Graph returns no total
 * count for these endpoints, so none is invented.
 */
export function formatTokenPageHint(
  count: number,
  nextSkipToken: string | undefined,
  hasMore: boolean,
): string {
  if (nextSkipToken !== undefined) {
    return `\nShowing ${count} items. More available - next page: page_token: "${nextSkipToken}".`;
  }
  if (hasMore) {
    return `\nShowing ${count} items. More available, but Graph returned no $skiptoken for this list, so it cannot be paged further with this tool.`;
  }
  return `\nShowing ${count} items (complete).`;
}

/**
 * Appends a page_token hint to Graph's "$skip is not supported" error. The Graph
 * client may wrap middleware errors (so no instanceof check) - match on the message.
 */
export function withPageTokenHint(error: unknown): unknown {
  if (!(error instanceof Error) || /page_token/.test(error.message)) return error;
  if (!/\$skip is not supported/.test(error.message)) return error;
  const details = error.message.replace(/^Validation failed:\s*/, "");
  return new ValidationError(
    `${details} OneDrive lists cannot use skip - use page_token (opaque, from the previous page's hint).`,
  );
}
