/**
 * Request-scoped caller identity (Unit B4).
 *
 * Mirrors the gateway's own `ContextVar`-based request identity, but for Node:
 * an `AsyncLocalStorage` carries the authenticated caller through the async call
 * tree of a single request without threading it as an argument. Concurrent
 * in-flight requests each see their own store — a module-level variable could
 * not provide that isolation.
 *
 * Populated only by the HTTP auth middleware in `shadow`/`enforce` mode. In
 * `off` mode and in stdio mode there is no enclosing scope, so
 * {@link getCallerIdentity} returns `undefined` — callers must handle the
 * absent case rather than assuming an identity is always present.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface CallerIdentity {
  personaKey: string | null;
  sub: string | null;
}

const storage = new AsyncLocalStorage<CallerIdentity>();

/** Run `fn` with `identity` bound as the current caller for its async subtree. */
export function runWithIdentity<T>(identity: CallerIdentity, fn: () => T): T {
  return storage.run(identity, fn);
}

/** Current caller identity, or `undefined` when outside any {@link runWithIdentity} scope. */
export function getCallerIdentity(): CallerIdentity | undefined {
  return storage.getStore();
}
