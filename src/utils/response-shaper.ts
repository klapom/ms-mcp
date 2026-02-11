import { createLogger } from "../utils/logger.js";

const log = createLogger("response-shaper");

export interface ShapeOptions {
  maxItems: number;
  maxBodyLength: number;
  fields?: string[];
  summaryMode?: boolean;
}

/**
 * Default $select fields per entity type (Context-Budget).
 */
export const DEFAULT_SELECT: Record<string, string[]> = {
  mail: ["id", "subject", "from", "receivedDateTime", "bodyPreview", "isRead", "importance"],
  event: ["id", "subject", "start", "end", "location", "organizer", "isAllDay"],
  file: ["id", "name", "size", "lastModifiedDateTime", "webUrl", "file", "folder"],
  contact: ["id", "displayName", "emailAddresses", "businessPhones", "companyName"],
  task: ["id", "title", "status", "dueDateTime", "importance"],
};

/**
 * Builds OData $select query parameter from fields array.
 */
export function buildSelectParam(fields: string[]): string {
  return fields.join(",");
}

/**
 * Truncates a string to maxLength, appending a suffix if truncated.
 */
export function truncateBody(body: string, maxLength: number, suffix = "... [truncated]"): string {
  if (body.length <= maxLength) {
    return body;
  }
  const truncatedLength = maxLength - suffix.length;
  if (truncatedLength <= 0) {
    return suffix.slice(0, maxLength);
  }
  return body.slice(0, truncatedLength) + suffix;
}

// The cast to Record<string, unknown> is intentional — these helpers operate
// on arbitrary nested objects where the shape is not statically known.

/**
 * Retrieves a nested property value from an object using a dot-separated path.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Sets a nested property value on an object using a dot-separated path.
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      current[part] === null ||
      current[part] === undefined ||
      typeof current[part] !== "object"
    ) {
      return;
    }
    current = current[part] as Record<string, unknown>;
  }
  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
}

/**
 * Shapes a Graph API list response for MCP output.
 * - Limits items to maxItems
 * - Truncates body fields
 * - Adds pagination hint
 */
export function shapeListResponse<T extends Record<string, unknown>>(
  items: T[],
  totalCount: number | undefined,
  options: ShapeOptions,
  bodyFields?: string[],
): { items: T[]; paginationHint: string } {
  const maxItems = options.maxItems;
  const maxBodyLength = options.maxBodyLength;

  const limited = items.slice(0, maxItems);

  const shaped = bodyFields
    ? limited.map((item) => {
        const clone = structuredClone(item);
        for (const field of bodyFields) {
          const value = getNestedValue(clone, field);
          if (typeof value === "string") {
            setNestedValue(clone, field, truncateBody(value, maxBodyLength));
          }
        }
        return clone;
      })
    : limited;

  const displayedCount = shaped.length;
  const total = totalCount ?? items.length;
  let paginationHint: string;

  if (displayedCount < total) {
    paginationHint =
      `Zeige ${displayedCount} von ${total} Ergebnissen. ` +
      `Nutze skip: ${displayedCount} für die nächste Seite.`;
  } else {
    paginationHint = `Zeige ${displayedCount} von ${total} Ergebnissen.`;
  }

  log.debug({ displayedCount, total, maxItems, maxBodyLength }, "Shaped list response");

  return { items: shaped, paginationHint };
}
