/**
 * Per-persona Microsoft 365 access scopes (Unit B5).
 *
 * `ms-mcp` is a single shared Graph MCP server behind ~19 agent personas. B4
 * established *who* is calling (`request-identity.ts`); this module declares
 * *what each persona may reach*. The concrete policy lives in a JSON file
 * (path from `personaScopes.path`, default `config/persona-scopes.json`) so it
 * can be reviewed and shipped as data rather than baked into code.
 *
 * Fail-closed everywhere: an unknown persona key, a `null` key, or a not-yet-
 * loaded scope table all resolve to `null` (deny). Enforcement of these scopes
 * lives in `persona-pinning.ts`.
 */

import { readFileSync } from "node:fs";
import { z } from "zod";

export interface PersonaScope {
  /** Mailboxes this persona may act as. `mailboxes[0]` is the default when none is named. */
  mailboxes: string[];
  /** Whether send/reply/forward-shaped tools are permitted. */
  sendAs: boolean;
  /** OneDrive/SharePoint drive capability ceiling. */
  drive: "none" | "read" | "write";
  /** SharePoint site (or drive) IDs this persona may address directly. */
  sites: string[];
}

const PersonaScopeSchema = z.object({
  mailboxes: z.array(z.string()),
  sendAs: z.boolean(),
  drive: z.enum(["none", "read", "write"]),
  sites: z.array(z.string()),
});

const PersonaScopesFileSchema = z.record(z.string(), PersonaScopeSchema);

export type PersonaScopesMap = Record<string, PersonaScope>;

/**
 * The active scope table. `null` until {@link loadPersonaScopesFromFile} (or
 * {@link setLoadedPersonaScopes}) runs. A `null` table denies everything —
 * enforcement can only relax access once scopes are explicitly loaded.
 */
let loadedScopes: PersonaScopesMap | null = null;

/**
 * Reads, JSON-parses and shape-validates the persona-scopes file, caching the
 * result for {@link getPersonaScope}. Throws (loudly, for boot-time fail-closed)
 * if the file is missing, not valid JSON, or does not match the schema.
 */
export function loadPersonaScopesFromFile(path: string): PersonaScopesMap {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`persona-scopes file could not be read at '${path}': ${reason}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`persona-scopes file at '${path}' is not valid JSON: ${reason}`);
  }

  const result = PersonaScopesFileSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `persona-scopes file at '${path}' has an invalid shape: ${result.error.message}`,
    );
  }

  loadedScopes = result.data;
  return result.data;
}

/** Test/DI hook: install a scope table without touching the filesystem. */
export function setLoadedPersonaScopes(scopes: PersonaScopesMap): void {
  loadedScopes = scopes;
}

/** Test hook: revert to the fail-closed "nothing loaded" state. */
export function resetLoadedPersonaScopes(): void {
  loadedScopes = null;
}

/**
 * The scope for `personaKey`, or `null` when the key is unknown, is `null`, or
 * no scope table has been loaded — every one of which is a fail-closed deny.
 */
export function getPersonaScope(personaKey: string | null): PersonaScope | null {
  if (personaKey === null) return null;
  if (loadedScopes === null) return null;
  return loadedScopes[personaKey] ?? null;
}
