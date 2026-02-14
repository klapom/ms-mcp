/**
 * Zod Schemas for Presence Tools (Sprint 9.4)
 *
 * Microsoft Graph API Presence endpoints for real-time status.
 */

import { z } from "zod";
import { BaseParams, WriteParams } from "./common.js";

/**
 * get_my_presence — Get current user's presence status
 *
 * @example
 * ```
 * {}
 * ```
 */
export const GetMyPresenceParams = BaseParams;

export type GetMyPresenceParams = z.infer<typeof GetMyPresenceParams>;

/**
 * get_presence — Get another user's presence status
 *
 * @example
 * ```
 * {
 *   "user_id": "user@example.com"
 * }
 * ```
 */
export const GetPresenceParams = BaseParams.extend({
  user_id: z
    .string()
    .min(1)
    .describe("User ID (GUID) or UPN (email) of the user to check presence for"),
});

export type GetPresenceParams = z.infer<typeof GetPresenceParams>;

/**
 * set_status_message — Set custom status message
 *
 * @example
 * ```
 * {
 *   "message": "Working from home",
 *   "expires_at": "2026-02-20T17:00:00Z",
 *   "confirm": true,
 *   "idempotency_key": "unique-key-123"
 * }
 * ```
 */
export const SetStatusMessageParams = WriteParams.extend({
  message: z
    .string()
    .max(280)
    .optional()
    .describe("Custom status message (max 280 chars, empty = clear)"),
  expires_at: z
    .string()
    .datetime()
    .optional()
    .describe("ISO 8601 datetime for expiration (optional)"),
});

export type SetStatusMessageParams = z.infer<typeof SetStatusMessageParams>;
