/**
 * HTTP request-authentication middleware (Unit B4).
 *
 * Sits in front of the `/mcp` route(s) and, depending on `GATEWAY_JWT_MODE`,
 * authenticates each request via the operator bearer token (`AUTH_TOKEN`), the
 * dedicated low-privilege boot bearer token (`BOOT_AUTH_TOKEN`, see
 * {@link BOOT_PERSONA_KEY}), or a gateway-minted upstream JWT
 * (`X-Pommer-Gateway-Jwt`, verified by {@link GatewayJwtVerifier}). On success
 * the resolved caller identity is bound for the downstream handler through
 * {@link runWithIdentity}.
 *
 * Mode semantics:
 *  - `off`     — true no-op: `next()` immediately, behavior unchanged (the
 *                pre-existing `isAuthorized` gate in the route still applies).
 *  - `shadow`  — pure observability: NEVER binds an identity and NEVER blocks,
 *                for any caller regardless of credential validity. A valid JWT
 *                is verified only to log what enforce WOULD have decided
 *                (`gateway_jwt.shadow_verify_ok`); bad/absent credentials are
 *                logged (`gateway_jwt.shadow_reject`). Because no identity is
 *                bound, `getCallerIdentity()` stays `undefined` downstream and
 *                persona-pinning never fires — access control is identical to
 *                `off`, governed solely by the legacy `isAuthorized`/AUTH_TOKEN
 *                gate in the route, which runs in both `off` and `shadow`.
 *  - `enforce` — bad/absent credentials are rejected: 401 for a bad/missing
 *                token, 503 when the JWKS is unavailable (a gateway outage is
 *                not an auth failure). A valid JWT binds the caller identity
 *                and persona-pinning enforces against it.
 *
 * `/health` is never routed through this middleware (see `index.ts`), so it is
 * reachable with zero credentials in every mode.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, RequestHandler, Response } from "express";
import type { VerifyResult } from "./gateway-jwt.js";
import type { CallerIdentity } from "./request-identity.js";
import { runWithIdentity } from "./request-identity.js";

/** The header the gateway stamps its minted upstream JWT into (see `mcp-gateway`). */
export const GATEWAY_JWT_HEADER = "x-pommer-gateway-jwt";

/** Identity assigned to a request authenticated with the operator bearer token. */
export const OPERATOR_PERSONA_KEY = "__operator__";
export const OPERATOR_SUB = "__operator__";

/**
 * Identity assigned to a request authenticated with the dedicated boot bearer
 * token (`BOOT_AUTH_TOKEN`). Deliberately powerless: unlike
 * {@link OPERATOR_PERSONA_KEY}, `__boot__` has no entry in
 * `config/persona-scopes.json`, so `persona-pinning.ts`'s fail-closed default
 * denies every `tools/call` made under this identity in `enforce` mode — it
 * exists solely so `mcp-gateway`'s boot-time tool-catalog enumeration
 * (`tools/list`, no persona context) can authenticate without being handed the
 * operator token's unrestricted bypass.
 */
export const BOOT_PERSONA_KEY = "__boot__";
export const BOOT_SUB = "__boot__";

/** JSON-RPC generic server-error code used by the MCP transport for its own errors. */
const JSONRPC_SERVER_ERROR = -32000;

type GatewayJwtMode = "off" | "shadow" | "enforce";

/** Minimal surface of {@link GatewayJwtVerifier} the middleware depends on (injectable for tests). */
export interface JwtVerifierLike {
  verify(token: string): Promise<VerifyResult>;
}

/** Minimal logger surface (matches pino's `warn`). */
export interface WarnLogger {
  warn(obj: Record<string, unknown>, msg?: string): void;
}

export interface AuthMiddlewareOptions {
  mode: GatewayJwtMode;
  /** Operator bearer token; when absent, operator bearer auth is disabled. */
  authToken?: string;
  /**
   * Boot bearer token (`BOOT_AUTH_TOKEN`) — a separate, deliberately powerless
   * credential for `mcp-gateway`'s boot-time tool-catalog enumeration. When
   * absent, the boot-bearer path never matches (fail-closed: unset means
   * "this credential is disabled", never "any caller passes").
   */
  bootAuthToken?: string;
  /** Gateway JWT verifier; required unless `mode` is `off`. */
  verifier?: JwtVerifierLike;
  logger?: WarnLogger;
}

/** JSON-RPC-shaped error body, matching the MCP transport's own error responses. */
function jsonRpcError(message: string): {
  jsonrpc: "2.0";
  error: { code: number; message: string };
  id: null;
} {
  return { jsonrpc: "2.0", error: { code: JSONRPC_SERVER_ERROR, message }, id: null };
}

/**
 * Constant-time string comparison. `timingSafeEqual` requires equal-length
 * buffers (and throws otherwise), which would both crash and leak length via a
 * distinct code path. Comparing fixed-length SHA-256 digests removes the length
 * dependency entirely — the digest buffers are always 32 bytes — and the trailing
 * length check guards the (cryptographically negligible) collision case without
 * short-circuiting on length before the constant-time step.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh) && a.length === b.length;
}

/**
 * Legacy bearer-token authorization check used by the `/mcp` route's
 * pre-middleware `isAuthorized` gate (`src/index.ts`) — the sole access
 * control in `off`/`shadow` mode. Accepts any of `tokens` as a valid bearer,
 * via constant-time comparison against each configured (non-empty) candidate;
 * an absent/empty candidate never matches anything (fail-closed — an unset
 * token disables only *that* credential, it never widens access). Every
 * candidate is checked, never short-circuited, so which candidate (if any)
 * matched is not observable via timing.
 */
export function isBearerAuthorized(
  authorizationHeader: string | undefined,
  tokens: ReadonlyArray<string | undefined>,
): boolean {
  if (typeof authorizationHeader !== "string" || !authorizationHeader.startsWith("Bearer ")) {
    return false;
  }
  const presented = authorizationHeader.slice("Bearer ".length);
  let authorized = false;
  for (const token of tokens) {
    if (token && constantTimeEqual(presented, token)) {
      authorized = true;
    }
  }
  return authorized;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions): RequestHandler {
  const { mode, authToken, bootAuthToken, verifier, logger } = options;

  if (mode !== "off" && !verifier) {
    throw new Error(
      "createAuthMiddleware: a gateway JWT verifier is required when mode is 'shadow' or 'enforce'",
    );
  }

  const shadowReject = (reason: string): void => {
    logger?.warn({ reason }, "gateway_jwt.shadow_reject");
  };

  // Proceed as a fixed synthetic identity after a matching bearer token
  // (operator or boot). In `shadow` nothing is bound (the legacy AUTH_TOKEN
  // gate in the route is the real access control, exactly as in `off`); only
  // `enforce` binds the identity.
  const enterAs = (identity: CallerIdentity, next: NextFunction): void => {
    if (mode === "shadow") {
      next();
      return;
    }
    runWithIdentity(identity, () => next());
  };

  // Handle a settled verification. In `enforce` a bad/unavailable outcome blocks
  // (401/503) and a valid one binds the caller identity. In `shadow` nothing
  // ever blocks and nothing is ever bound: a valid token is logged as
  // `shadow_verify_ok` (what enforce WOULD have decided) and the request
  // proceeds with no identity — identical to `off` downstream.
  const handleResult = (result: VerifyResult, res: Response, next: NextFunction): void => {
    switch (result.status) {
      case "valid":
        if (mode === "shadow") {
          logger?.warn(
            { personaKey: result.personaKey, sub: result.sub },
            "gateway_jwt.shadow_verify_ok",
          );
          next();
          return;
        }
        runWithIdentity({ personaKey: result.personaKey, sub: result.sub }, () => next());
        return;
      case "invalid":
        if (mode === "enforce") {
          res.status(401).json(jsonRpcError("Unauthorized: invalid gateway token"));
          return;
        }
        shadowReject(result.reason);
        next();
        return;
      case "jwks_unavailable":
        if (mode === "enforce") {
          res.status(503).json(jsonRpcError("Service Unavailable: gateway JWKS unavailable"));
          return;
        }
        shadowReject(result.reason);
        next();
        return;
    }
  };

  // A verifier that itself throws is treated like a JWKS outage in enforce mode
  // (503) — never a silent pass.
  const handleError = (err: unknown, res: Response, next: NextFunction): void => {
    const reason = err instanceof Error ? err.message : String(err);
    if (mode === "enforce") {
      res.status(503).json(jsonRpcError("Service Unavailable: gateway token verification failed"));
      return;
    }
    shadowReject(reason);
    next();
  };

  return (req, res, next) => {
    if (mode === "off") {
      next();
      return;
    }

    // 1) Operator bearer token.
    const authz = req.headers.authorization;
    if (authToken && typeof authz === "string" && authz.startsWith("Bearer ")) {
      const presented = authz.slice("Bearer ".length);
      if (constantTimeEqual(presented, authToken)) {
        enterAs({ personaKey: OPERATOR_PERSONA_KEY, sub: OPERATOR_SUB }, next);
        return;
      }
      // Wrong bearer: fall through (to the boot check, then the JWT path,
      // which will 401 if no JWT).
    }

    // 2) Boot bearer token — a genuinely separate credential from the operator
    // token: presenting it never yields the operator identity, and vice versa.
    if (bootAuthToken && typeof authz === "string" && authz.startsWith("Bearer ")) {
      const presented = authz.slice("Bearer ".length);
      if (constantTimeEqual(presented, bootAuthToken)) {
        enterAs({ personaKey: BOOT_PERSONA_KEY, sub: BOOT_SUB }, next);
        return;
      }
      // Wrong bearer: fall through to the JWT path (which will 401 if no JWT).
    }

    // 3) Gateway-minted upstream JWT.
    const rawJwt = req.headers[GATEWAY_JWT_HEADER];
    const jwt = Array.isArray(rawJwt) ? rawJwt[0] : rawJwt;

    if (!jwt) {
      if (mode === "enforce") {
        res.status(401).json(jsonRpcError("Unauthorized: no credentials"));
        return;
      }
      shadowReject("no_credentials");
      next();
      return;
    }

    verifier?.verify(jwt).then(
      (result) => handleResult(result, res, next),
      (err: unknown) => handleError(err, res, next),
    );
  };
}
