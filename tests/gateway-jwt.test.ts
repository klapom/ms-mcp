/**
 * Tests for GatewayJwtVerifier — verifying gateway-minted upstream RS256 JWTs.
 *
 * Uses a real locally-generated RSA keypair and signs real JWTs with `jose`
 * (JWT verification itself is never mocked). The public key is served through
 * an injected fake JWKS provider, and the clock is injected, so no test touches
 * the network or the wall clock.
 */

import { createHmac } from "node:crypto";
import { exportJWK, exportSPKI, generateKeyPair, type JSONWebKeySet, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UPSTREAM_TYP,
  GatewayJwtVerifier,
  type JwksProvider,
  type VerifyResult,
} from "../src/auth/gateway-jwt.js";

const ISSUER = "https://gateway.example.test";
const AUDIENCE = "pommer-m365-mcp";
const KID = "test-key-1";

// A fixed "now" all tests reckon against. iat/exp fixtures are set relative to
// this, and the verifier is given a matching injected clock.
const NOW_MS = 1_800_000_000_000; // ~2027-01-15, deterministic
const nowSeconds = Math.floor(NOW_MS / 1000);

let privateKey: CryptoKey;
let publicJwk: JSONWebKeySet["keys"][number];
/** A second keypair whose public key never appears in the served JWKS. */
let roguePublicJwk: JSONWebKeySet["keys"][number];
let publicKeyPem: string;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256", use: "sig" };
  // PEM form of the RSA public key — used verbatim as an HMAC secret in the
  // alg-confusion test.
  publicKeyPem = await exportSPKI(pair.publicKey);

  const rogue = await generateKeyPair("RS256", { extractable: true });
  roguePublicJwk = {
    ...(await exportJWK(rogue.publicKey)),
    kid: "rotated-key-2",
    alg: "RS256",
    use: "sig",
  };
});

/** Serves only the primary key. */
function jwksWithPrimary(): JSONWebKeySet {
  return { keys: [publicJwk] };
}

/**
 * Sign a JWT with the primary private key. Overrides let individual tests bend
 * one field (aud/iss/typ/kid/exp/iat/persona/sub) away from the happy path.
 */
async function signToken(
  overrides: {
    aud?: string;
    iss?: string;
    typ?: string;
    kid?: string;
    iat?: number;
    exp?: number;
    sub?: string;
    persona?: string | null;
  } = {},
): Promise<string> {
  const iat = overrides.iat ?? nowSeconds;
  const exp = overrides.exp ?? nowSeconds + 120;
  const claims: Record<string, unknown> = {};
  if (overrides.persona !== null && overrides.persona !== undefined) {
    claims.persona = overrides.persona;
  }
  return new SignJWT(claims)
    .setProtectedHeader({
      alg: "RS256",
      kid: overrides.kid ?? KID,
      typ: overrides.typ ?? DEFAULT_UPSTREAM_TYP,
    })
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? AUDIENCE)
    .setSubject(overrides.sub ?? "pat:ferdinand")
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey);
}

function makeVerifier(jwksProvider: JwksProvider): GatewayJwtVerifier {
  return new GatewayJwtVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    jwksProvider,
    now: () => new Date(NOW_MS),
  });
}

describe("GatewayJwtVerifier", () => {
  it("accepts a valid token and returns persona + sub", async () => {
    const verifier = makeVerifier(async () => jwksWithPrimary());
    const token = await signToken({ persona: "ferdinand", sub: "pat:ferdinand" });

    const result = await verifier.verify(token);

    expect(result).toEqual<VerifyResult>({
      status: "valid",
      personaKey: "ferdinand",
      sub: "pat:ferdinand",
    });
  });

  it("rejects a token expired beyond the skew window", async () => {
    const verifier = makeVerifier(async () => jwksWithPrimary());
    // Expired 60s ago — well past the 30s tolerance.
    const token = await signToken({ iat: nowSeconds - 180, exp: nowSeconds - 60 });

    const result = await verifier.verify(token);

    expect(result.status).toBe("invalid");
  });

  it("accepts a token expired within the 30s skew window (boundary)", async () => {
    const verifier = makeVerifier(async () => jwksWithPrimary());
    // Expired 20s ago — inside the 30s clockTolerance.
    const token = await signToken({ iat: nowSeconds - 140, exp: nowSeconds - 20 });

    const result = await verifier.verify(token);

    expect(result.status).toBe("valid");
  });

  it("rejects a wrong audience (cross-namespace replay)", async () => {
    const verifier = makeVerifier(async () => jwksWithPrimary());
    const token = await signToken({ aud: "ot-guru-brain" });

    const result = await verifier.verify(token);

    expect(result.status).toBe("invalid");
  });

  it("rejects a wrong issuer", async () => {
    const verifier = makeVerifier(async () => jwksWithPrimary());
    const token = await signToken({ iss: "https://evil.example.test" });

    const result = await verifier.verify(token);

    expect(result.status).toBe("invalid");
  });

  it("rejects a wrong typ header", async () => {
    const verifier = makeVerifier(async () => jwksWithPrimary());
    const token = await signToken({ typ: "at+jwt" });

    const result = await verifier.verify(token);

    expect(result.status).toBe("invalid");
  });

  it("rejects an alg-confusion token (RSA public key used as HS256 secret)", async () => {
    const verifier = makeVerifier(async () => jwksWithPrimary());
    // Hand-craft an HS256 JWT whose HMAC secret is the RSA public key PEM. This
    // is the classic alg-confusion attack: if the verifier trusted the token's
    // own `alg`, it would treat the (public!) RSA key as a shared HMAC secret
    // and the signature would verify. Pinning algorithms: ["RS256"] rejects it
    // before the signature is ever checked.
    const header = base64url(JSON.stringify({ alg: "HS256", kid: KID, typ: DEFAULT_UPSTREAM_TYP }));
    const body = base64url(
      JSON.stringify({
        iss: ISSUER,
        aud: AUDIENCE,
        sub: "pat:ferdinand",
        iat: nowSeconds,
        exp: nowSeconds + 120,
      }),
    );
    const signingInput = `${header}.${body}`;
    const sig = createHmac("sha256", publicKeyPem).update(signingInput).digest("base64url");
    const forged = `${signingInput}.${sig}`;

    const result = await verifier.verify(forged);

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      // Rejected by the algorithm allow-list, not an incidental signature miss.
      expect(result.reason).toMatch(/alg/i);
    }
  });

  it("refetches once on an unknown kid and accepts when the rotated key appears", async () => {
    // First fetch lacks the token's kid (only the rogue key); the refetch adds
    // the primary key — models a rotation where the JWKS just gained the key.
    const provider = vi
      .fn<JwksProvider>()
      .mockResolvedValueOnce({ keys: [roguePublicJwk] })
      .mockResolvedValueOnce({ keys: [roguePublicJwk, publicJwk] });
    const verifier = makeVerifier(provider);
    const token = await signToken({ persona: "ferdinand" });

    const result = await verifier.verify(token);

    expect(result.status).toBe("valid");
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("rejects when the kid is still absent after a refetch", async () => {
    const provider = vi.fn<JwksProvider>().mockResolvedValue({ keys: [roguePublicJwk] });
    const verifier = makeVerifier(provider);
    const token = await signToken();

    const result = await verifier.verify(token);

    expect(result.status).toBe("invalid");
    expect(provider).toHaveBeenCalledTimes(2); // initial + one refetch
  });

  it("reports jwks_unavailable (distinct from invalid) when the provider rejects", async () => {
    const verifier = makeVerifier(async () => {
      throw new Error("connection refused");
    });
    const token = await signToken();

    const result = await verifier.verify(token);

    expect(result.status).toBe("jwks_unavailable");
    // The discriminant is what Unit B4 switches on (503 vs 401) — assert it is
    // NOT conflated with an auth failure.
    expect(result.status).not.toBe("invalid");
    if (result.status === "jwks_unavailable") {
      expect(result.reason).toContain("connection refused");
    }
  });

  it("derives personaKey from a pat: sub when there is no persona claim", async () => {
    const verifier = makeVerifier(async () => jwksWithPrimary());
    const token = await signToken({ persona: null, sub: "pat:suki" });

    const result = await verifier.verify(token);

    expect(result).toMatchObject({ status: "valid", personaKey: "suki", sub: "pat:suki" });
  });

  it("yields personaKey null when neither a persona claim nor a pat: sub is present", async () => {
    const verifier = makeVerifier(async () => jwksWithPrimary());
    const token = await signToken({ persona: null, sub: "service-account-42" });

    const result = await verifier.verify(token);

    expect(result).toMatchObject({
      status: "valid",
      personaKey: null,
      sub: "service-account-42",
    });
  });
});

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}
