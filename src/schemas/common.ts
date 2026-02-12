import { z } from "zod";

/**
 * Base parameters shared by ALL tools.
 */
export const BaseParams = z.object({
  user_id: z.string().optional().describe("User ID or UPN for delegated access. Default: /me"),
});

/**
 * Extended base for write/destructive operations.
 */
export const WriteParams = BaseParams.extend({
  idempotency_key: z
    .string()
    .optional()
    .describe(
      "Optional idempotency key. If the same key is used, the operation is not repeated and the previous result is returned.",
    ),
  confirm: z
    .boolean()
    .default(false)
    .describe(
      "Confirmation for destructive operations. Without confirm=true, only a preview is returned.",
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
    .describe("Maximum number of results (default: 25, max: 100)"),
  skip: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Number of results to skip (for pagination)"),
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
