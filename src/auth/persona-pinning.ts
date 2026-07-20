/**
 * Persona scope enforcement (Unit B5).
 *
 * Turns the declarative scopes from `persona-scopes.ts` into the actual checks
 * that run on every request:
 *  - {@link pinUserId}: clamps a tool's `user_id` to the persona's allowed
 *    mailbox(es) — the shared choke point behind both `resolveUserPath`
 *    (`schemas/common.ts`) and `resolveDrivePath` (`utils/drive-path.ts`).
 *  - {@link assertSiteAccessAllowed}: closes the SharePoint `site_id`/`drive_id`
 *    bypass, where a caller could reach a drive without ever naming a mailbox.
 *  - {@link enforceToolCapability} / {@link withPersonaCapabilityGate}: an
 *    operation-level gate (send-as, drive read/write) keyed on the tool name,
 *    applied centrally at tool-dispatch time.
 *
 * Three invariants hold across all of them, matching B4's rollout contract:
 *  1. `getCallerIdentity() === undefined` (auth `off`/stdio) → true no-op.
 *  2. `personaKey === "__operator__"` (bearer path) → unrestricted bypass.
 *  3. otherwise fail-closed: an unknown persona is denied entirely.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolResult } from "../types/tools.js";
import { AuthError, McpToolError } from "../utils/errors.js";
import { OPERATOR_PERSONA_KEY } from "./http-auth-middleware.js";
import { getPersonaScope } from "./persona-scopes.js";
import { type CallerIdentity, getCallerIdentity } from "./request-identity.js";

/**
 * Normalizes a caller-supplied mailbox reference. Mirrors `drive-path.ts`'s
 * `normalizeUserId`: a trimmed, leading-slash-stripped value, with the `/me`
 * and `me` sentinels collapsing to "no mailbox named".
 */
function normalizeMailboxRef(userId: string | undefined): string | undefined {
  if (!userId) return undefined;
  const trimmed = userId.trim().replace(/^\/+/, "");
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "me") return undefined;
  return trimmed;
}

function notAuthorized(personaKey: string | null): AuthError {
  return new AuthError(`persona '${personaKey}' is not authorized for Microsoft 365 access.`, 403);
}

/**
 * Resolves the effective mailbox a request may act as, enforcing the caller's
 * persona scope.
 *
 * - No identity (`off`/stdio) → returns `userId` unchanged (no enforcement).
 * - `__operator__` → returns `userId` unchanged (bypass).
 * - Unknown persona → throws 403.
 * - `userId` absent or the `me` sentinel → the persona's primary mailbox, or
 *   403 if the persona has no mailbox access (it cannot default to anything).
 * - `userId` present → must match an allowed mailbox case-insensitively, else
 *   403. The canonical form from the scope is returned.
 */
export function pinUserId(
  userId: string | undefined,
  identity: CallerIdentity | undefined,
): string | undefined {
  if (identity === undefined) return userId;
  if (identity.personaKey === OPERATOR_PERSONA_KEY) return userId;

  const scope = getPersonaScope(identity.personaKey);
  if (scope === null) throw notAuthorized(identity.personaKey);

  const requested = normalizeMailboxRef(userId);
  if (requested === undefined) {
    const primary = scope.mailboxes[0];
    if (primary === undefined) throw notAuthorized(identity.personaKey);
    return primary;
  }

  const match = scope.mailboxes.find((m) => m.toLowerCase() === requested.toLowerCase());
  if (match === undefined) {
    throw new AuthError(
      `persona '${identity.personaKey}' may not act as mailbox '${requested}'.`,
      403,
    );
  }
  return match;
}

/**
 * Enforces the SharePoint-site escape hatch: a `site_id`/`drive_id` addresses a
 * drive directly, bypassing any mailbox (`user_id`) identity check. A persona
 * may only address sites explicitly listed in its scope. No-op when no
 * site/drive is addressed, or under the `off`/operator bypass.
 */
export function assertSiteAccessAllowed(
  siteId: string | undefined,
  driveId: string | undefined,
  identity: CallerIdentity | undefined,
): void {
  if (identity === undefined) return;
  if (identity.personaKey === OPERATOR_PERSONA_KEY) return;

  const target = siteId ?? driveId;
  if (target === undefined) return;

  const scope = getPersonaScope(identity.personaKey);
  if (scope === null) throw notAuthorized(identity.personaKey);

  const allowed = scope.sites.some((s) => s.toLowerCase() === target.toLowerCase());
  if (!allowed) {
    throw new AuthError(
      `persona '${identity.personaKey}' may not access SharePoint site/drive '${target}'.`,
      403,
    );
  }
}

// ---------------------------------------------------------------------------
// Operation-level capability gate
// ---------------------------------------------------------------------------

type RequiredCapability = "sendAs" | "driveWrite" | "driveRead" | "mailboxWrite";

/**
 * Tool name → the capability it requires beyond mailbox/site pinning.
 * Anything that emails/notifies an external party (send/reply/forward, calendar
 * invitations, meeting responses, calendar sharing, cancellation notices) needs
 * `sendAs`; drive-mutating tools need `drive === "write"`; read-only drive tools
 * need `drive !== "none"`; bulk mailbox mutations need `mailboxWrite` (the
 * persona must own a mailbox to act on it). Tools absent from this table carry
 * no extra capability requirement.
 *
 * Fail-open by omission is the hazard this table guards against: a risky tool
 * left out gets NO check. {@link findToolsMissingCapability} + the completeness
 * test in `tests/persona-scopes.test.ts` fail loudly if a tool registered under
 * a risky module group is missing here, so a new risky tool cannot ship
 * silently unguarded.
 */
const TOOL_CAPABILITY: Record<string, RequiredCapability> = {
  // send/reply/forward — act as a mailbox / channel on the caller's behalf.
  send_email: "sendAs",
  reply_email: "sendAs",
  forward_email: "sendAs",
  send_draft: "sendAs",
  send_channel_message: "sendAs",
  send_chat_message: "sendAs",
  reply_to_channel_message: "sendAs",
  // calendar operations that notify attendees / the organizer. The table sees
  // only the tool NAME, not its arguments, so it cannot tell an invite-bearing
  // create_event from an attendee-less one; every one of these is gated
  // unconditionally on `sendAs` — the safer, simpler choice (see completeness
  // test rationale) than letting a no-attendee call slip past a per-arg check.
  create_event: "sendAs",
  update_event: "sendAs",
  create_recurring_event: "sendAs",
  update_event_series: "sendAs",
  respond_to_event: "sendAs",
  delete_event: "sendAs",
  batch_delete_events: "sendAs",
  share_calendar: "sendAs",
  // drive writes.
  upload_file: "driveWrite",
  upload_large_file: "driveWrite",
  save_attachment_to_drive: "driveWrite",
  create_folder: "driveWrite",
  move_file: "driveWrite",
  copy_file: "driveWrite",
  share_file: "driveWrite",
  batch_move_files: "driveWrite",
  // SharePoint list writes — drive-write-shaped mutations of site content.
  create_list_item: "driveWrite",
  update_list_item: "driveWrite",
  delete_list_item: "driveWrite",
  // bulk mailbox mutations — require owning a mailbox to act on it.
  batch_move_emails: "mailboxWrite",
  batch_delete_emails: "mailboxWrite",
  batch_flag_emails: "mailboxWrite",
  // drive reads.
  list_files: "driveRead",
  download_file: "driveRead",
  download_attachment: "driveRead",
  search_files: "driveRead",
  get_file_metadata: "driveRead",
  get_recent_files: "driveRead",
  track_file_changes: "driveRead",
  poll_copy_status: "driveRead",
};

/**
 * Returns the names in `toolNames` that have NO entry in {@link TOOL_CAPABILITY}.
 * The capability-table completeness check feeds it the tools registered under
 * the risky module groups (mail send/reply/forward, bulk mailbox mutation, drive
 * write, SharePoint write); a non-empty result means one of them would ship
 * without any capability check.
 */
export function findToolsMissingCapability(toolNames: Iterable<string>): string[] {
  return [...toolNames].filter((name) => !(name in TOOL_CAPABILITY));
}

/**
 * Throws a 403 `AuthError` when the current persona lacks the capability a tool
 * requires. No-op for the `off`/operator bypass and for tools with no declared
 * requirement. Exposed for direct testing; the request path calls it through
 * {@link withPersonaCapabilityGate}.
 */
export function enforceToolCapability(
  toolName: string,
  identity: CallerIdentity | undefined = getCallerIdentity(),
): void {
  if (identity === undefined) return;
  if (identity.personaKey === OPERATOR_PERSONA_KEY) return;

  const required = TOOL_CAPABILITY[toolName];
  if (required === undefined) return;

  const scope = getPersonaScope(identity.personaKey);
  if (scope === null) throw notAuthorized(identity.personaKey);

  switch (required) {
    case "sendAs":
      if (!scope.sendAs) {
        throw new AuthError(
          `persona '${identity.personaKey}' lacks the 'send_as' capability required by '${toolName}'.`,
          403,
        );
      }
      return;
    case "driveWrite":
      if (scope.drive !== "write") {
        throw new AuthError(
          `persona '${identity.personaKey}' lacks the 'drive:write' capability required by '${toolName}'.`,
          403,
        );
      }
      return;
    case "driveRead":
      if (scope.drive === "none") {
        throw new AuthError(
          `persona '${identity.personaKey}' lacks the 'drive' capability required by '${toolName}'.`,
          403,
        );
      }
      return;
    case "mailboxWrite":
      if (scope.mailboxes.length === 0) {
        throw new AuthError(
          `persona '${identity.personaKey}' lacks a mailbox required by '${toolName}'.`,
          403,
        );
      }
      return;
  }
}

type ToolHandler = (...args: unknown[]) => Promise<ToolResult> | ToolResult;

/**
 * Wraps a tool handler so the capability gate runs before it. A gate rejection
 * becomes an `isError` result naming the missing capability (never reaching the
 * handler, so no Graph call happens); non-`McpToolError` failures propagate.
 */
export function gateToolHandler(toolName: string, handler: ToolHandler): ToolHandler {
  return async (...args: unknown[]): Promise<ToolResult> => {
    try {
      enforceToolCapability(toolName);
    } catch (err) {
      if (err instanceof McpToolError) {
        return { content: [{ type: "text", text: err.message }], isError: true };
      }
      throw err;
    }
    return handler(...args);
  };
}

/**
 * Returns a proxy over `server` that transparently wraps every tool handler
 * with {@link gateToolHandler}. The underlying server is registered against
 * directly (the proxy only intercepts `.tool`), so callers connect the real
 * server as usual. This is the single central place the capability gate is
 * applied to all tools.
 */
export function withPersonaCapabilityGate(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === "tool") {
        return (...toolArgs: unknown[]): unknown => {
          const name = toolArgs[0] as string;
          const handler = toolArgs[toolArgs.length - 1];
          if (typeof handler === "function") {
            toolArgs[toolArgs.length - 1] = gateToolHandler(name, handler as ToolHandler);
          }
          return (target.tool as (...a: unknown[]) => unknown)(...toolArgs);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function"
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
