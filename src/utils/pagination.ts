import type { Client } from "@microsoft/microsoft-graph-client";
import { createLogger } from "../utils/logger.js";

const log = createLogger("pagination");

export interface PaginatedResponse<T> {
  items: T[];
  totalCount?: number;
  nextLink?: string;
  hasMore: boolean;
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
    select?: string;
    filter?: string;
    orderby?: string;
  },
): Promise<PaginatedResponse<T>> {
  let request = client.api(url);

  if (params?.top !== undefined) {
    request = request.top(params.top);
  }
  if (params?.skip !== undefined) {
    request = request.skip(params.skip);
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
