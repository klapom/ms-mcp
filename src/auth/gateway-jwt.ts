/**
 * Verifier for gateway-minted upstream JWTs (Unit B3).
 *
 * `mcp-gateway` sits in front of this MCP server and, per ADR-029 / Unit B1,
 * mints a short-lived, namespace-scoped RS256 JWT for every outbound
 * `tools/call` it proxies to us (audience `pommer-m365-mcp`, header
 * `typ: pommer-upstream+jwt`). This module verifies those tokens against the
 * gateway's JWKS (`<issuer>/jwks.json`, serving the CURRENT + PREVIOUS signing
 * keys for the rotation window).
 *
 * TypeScript port of `ot-performance-portal/gateway_auth.py::GatewayJWTVerifier`:
 * RS256-only algorithm allow-list, TTL-cached JWKS, injectable JWKS provider +
 * clock for tests, and — critically — a hard distinction between an *invalid*
 * token (bad signature / wrong claims / disallowed alg) and an *unavailable*
 * JWKS (network/HTTP failure). A JWKS outage must never be reported as a bad
 * token: Unit B4 maps `invalid` → 401 and `jwks_unavailable` → 503, so
 * conflating them would make a transient gateway outage look like an auth
 * attack.
 *
 * This unit is the verifier only — Unit B4 wires it into HTTP auth middleware.
 */

import {
  createLocalJWKSet,
  type JSONWebKeySet,
  type JWTPayload,
  errors as joseErrors,
  jwtVerify,
} from "jose";

/** The `typ` header stamped on upstream JWTs (see gateway `UpstreamTokenMinter`). */
export const DEFAULT_UPSTREAM_TYP = "pommer-upstream+jwt";

/** RS256 only — never `none` (alg-confusion) and never `HS*` (RSA pubkey as HMAC secret). */
const ALLOWED_ALGS = ["RS256"] as const;

/** Default JWKS cache lifetime — mirrors the Python verifier's rotation-overlap window. */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/** Default clock-skew tolerance for `exp`/`iat`, in seconds. */
const DEFAULT_CLOCK_TOLERANCE_SECONDS = 30;

/** Default network timeout for the built-in HTTP JWKS fetch, in milliseconds. */
const DEFAULT_JWKS_FETCH_TIMEOUT_MS = 10_000;

/** Returns the gateway JWKS document (`{ keys: [...] }`). Injectable for tests. */
export type JwksProvider = () => Promise<JSONWebKeySet>;

/** The verified caller identity extracted from a valid token. */
export interface VerifiedIdentity {
  /**
   * Persona key from the explicit `persona` claim, else parsed from a
   * `sub` of the form `pat:<persona_key>`, else `null` when neither yields one.
   * A `null` persona is not an error here — Unit B4 decides what to do with it.
   */
  personaKey: string | null;
  sub: string;
}

/**
 * Discriminated verification outcome. `status` is the discriminant the caller
 * (Unit B4) switches on: `valid` → proceed, `invalid` → 401, `jwks_unavailable`
 * → 503.
 */
export type VerifyResult =
  | ({ status: "valid" } & VerifiedIdentity)
  | { status: "invalid"; reason: string }
  | { status: "jwks_unavailable"; reason: string };

export interface GatewayJwtVerifierOptions {
  /** Gateway issuer URL; the `iss` claim must match this exactly. */
  issuer: string;
  /** Expected `aud` claim — for the m365 namespace, `pommer-m365-mcp`. */
  audience: string;
  /** Expected `typ` header. Defaults to {@link DEFAULT_UPSTREAM_TYP}. */
  expectedTyp?: string;
  /** Clock-skew tolerance for `exp`/`iat` in seconds. Defaults to 30. */
  clockToleranceSeconds?: number;
  /** JWKS cache TTL in milliseconds. Defaults to 5 minutes. */
  cacheTtlMs?: number;
  /** JWKS source. Defaults to an HTTP GET of `<issuer>/jwks.json`. */
  jwksProvider?: JwksProvider;
  /** Injectable clock for deterministic expiry/cache tests. Defaults to `new Date()`. */
  now?: () => Date;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Verifies gateway-minted RS256 JWTs against the issuer's JWKS.
 *
 * Stateful only in its JWKS cache (TTL + refetch-once-on-unknown-kid); a single
 * instance is safe to reuse across requests. Both the JWKS fetch and the clock
 * are injectable so tests need neither network nor wall-clock.
 */
export class GatewayJwtVerifier {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly expectedTyp: string;
  private readonly clockToleranceSeconds: number;
  private readonly cacheTtlMs: number;
  private readonly jwksProvider: JwksProvider;
  private readonly now: () => Date;
  private readonly jwksUrl: string;

  private cached: JSONWebKeySet | null = null;
  private cachedAtMs = 0;

  constructor(options: GatewayJwtVerifierOptions) {
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.expectedTyp = options.expectedTyp ?? DEFAULT_UPSTREAM_TYP;
    this.clockToleranceSeconds = options.clockToleranceSeconds ?? DEFAULT_CLOCK_TOLERANCE_SECONDS;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = options.now ?? (() => new Date());
    // Strip trailing slashes only for the fetch URL; the `iss` claim is matched
    // against `issuer` verbatim (jose does an exact string compare).
    this.jwksUrl = `${this.issuer.replace(/\/+$/, "")}/jwks.json`;
    this.jwksProvider = options.jwksProvider ?? (() => this.httpJwks());
  }

  private async httpJwks(): Promise<JSONWebKeySet> {
    const res = await fetch(this.jwksUrl, {
      signal: AbortSignal.timeout(DEFAULT_JWKS_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`JWKS fetch failed: HTTP ${res.status}`);
    }
    return (await res.json()) as JSONWebKeySet;
  }

  /**
   * Return the cached JWKS, refetching when stale or forced. On a soft
   * (stale-driven) refetch failure a still-present cache is served rather than
   * failing the request; a forced refetch or a first fetch with no cache
   * propagates the error to be surfaced as `jwks_unavailable`.
   */
  private async getJwks(forceRefresh: boolean): Promise<JSONWebKeySet> {
    const nowMs = this.now().getTime();
    const stale = this.cached === null || nowMs - this.cachedAtMs >= this.cacheTtlMs;
    if (forceRefresh || stale) {
      try {
        this.cached = await this.jwksProvider();
        this.cachedAtMs = nowMs;
      } catch (err) {
        if (this.cached !== null && !forceRefresh) {
          return this.cached;
        }
        throw err;
      }
    }
    return this.cached as JSONWebKeySet;
  }

  private async decode(token: string, jwks: JSONWebKeySet): Promise<VerifyResult> {
    const keySet = createLocalJWKSet(jwks);
    const { payload } = await jwtVerify(token, keySet, {
      algorithms: [...ALLOWED_ALGS],
      issuer: this.issuer,
      audience: this.audience,
      typ: this.expectedTyp,
      clockTolerance: this.clockToleranceSeconds,
      currentDate: this.now(),
    });
    return {
      status: "valid",
      personaKey: extractPersonaKey(payload),
      sub: typeof payload.sub === "string" ? payload.sub : "",
    };
  }

  async verify(token: string): Promise<VerifyResult> {
    let jwks: JSONWebKeySet;
    try {
      jwks = await this.getJwks(false);
    } catch (err) {
      return { status: "jwks_unavailable", reason: errorMessage(err) };
    }

    try {
      return await this.decode(token, jwks);
    } catch (err) {
      // Unknown `kid` may just mean the signing key rotated: refetch once and
      // retry (the JWKS serves CURRENT + PREVIOUS, so a fresh key appears here).
      if (err instanceof joseErrors.JWKSNoMatchingKey) {
        let refreshed: JSONWebKeySet;
        try {
          refreshed = await this.getJwks(true);
        } catch (fetchErr) {
          return { status: "jwks_unavailable", reason: errorMessage(fetchErr) };
        }
        try {
          return await this.decode(token, refreshed);
        } catch (retryErr) {
          return { status: "invalid", reason: errorMessage(retryErr) };
        }
      }
      return { status: "invalid", reason: errorMessage(err) };
    }
  }
}

/**
 * Persona key from the `persona` claim if present, else stripped from a
 * `pat:<persona_key>` `sub`, else `null`.
 */
function extractPersonaKey(payload: JWTPayload): string | null {
  const persona = payload.persona;
  if (typeof persona === "string" && persona.length > 0) {
    return persona;
  }
  const sub = payload.sub;
  if (typeof sub === "string" && sub.startsWith("pat:")) {
    const key = sub.slice("pat:".length);
    return key.length > 0 ? key : null;
  }
  return null;
}
