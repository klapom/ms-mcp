import { z } from "zod";
import { pinUserId } from "../auth/persona-pinning.js";
import { getCallerIdentity } from "../auth/request-identity.js";

/**
 * Base parameters shared by ALL tools.
 */
export const BaseParams = z.object({
  user_id: z
    .string()
    .optional()
    .describe(
      "UPN (e.g. 'alice@contoso.com') or Entra object ID of ANOTHER user to act on " +
        "behalf of (delegated admin access). Omit this field entirely to act as the " +
        "signed-in user. Do NOT pass '/me' or 'me' as a value — omit the field instead.",
    ),
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
 *
 * Under an authenticated persona (B4/B5) the `user_id` is first pinned to the
 * persona's allowed mailbox — throwing 403 on an unauthorized mailbox, and
 * resolving an absent one to the persona's primary mailbox. With no identity
 * (auth `off`/stdio) or the operator bypass, `user_id` passes through exactly
 * as before, preserving the pre-B5 behavior.
 */
export function resolveUserPath(userId?: string): string {
  const effective = pinUserId(userId, getCallerIdentity());
  return effective ? `/users/${effective}` : "/me";
}
