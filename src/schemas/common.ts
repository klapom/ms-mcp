import { z } from "zod";

/**
 * Base parameters shared by ALL tools.
 */
export const BaseParams = z.object({
  user_id: z.string().optional().describe("User-ID oder UPN für delegierten Zugriff. Default: /me"),
});

/**
 * Extended base for write/destructive operations.
 */
export const WriteParams = BaseParams.extend({
  idempotency_key: z
    .string()
    .optional()
    .describe(
      "Optionaler Idempotenz-Schlüssel. Bei gleichem Key wird die Operation nicht wiederholt, sondern das vorherige Ergebnis zurückgegeben.",
    ),
  confirm: z
    .boolean()
    .default(false)
    .describe(
      "Bestätigung für destruktive Operationen. Ohne confirm=true wird nur eine Vorschau zurückgegeben.",
    ),
});

/**
 * Parameters for list/pagination operations.
 */
export const ListParams = BaseParams.extend({
  top: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Maximale Anzahl Ergebnisse (default: 25, max: 100)"),
  skip: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Anzahl Ergebnisse überspringen (für Pagination)"),
});

export type BaseParamsType = z.infer<typeof BaseParams>;
export type WriteParamsType = z.infer<typeof WriteParams>;
export type ListParamsType = z.infer<typeof ListParams>;

/**
 * Helper to resolve the Graph API base path depending on user_id.
 */
export function resolveUserPath(userId?: string): string {
  return userId ? `/users/${userId}` : "/me";
}
