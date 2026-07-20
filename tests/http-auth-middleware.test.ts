/**
 * HTTP auth middleware tests (Unit B4).
 *
 * These mount the middleware on a minimal Express app whose `/mcp` route wiring
 * mirrors `src/index.ts` (middleware → legacy `isAuthorized` gate that runs in
 * both `off` and `shadow` → downstream handler that reads
 * `getCallerIdentity()`). `src/index.ts` itself runs
 * `main()`/`process.exit` on import and is coverage-excluded, so the wiring is
 * reproduced here rather than imported. The gateway JWT verifier is mocked (B3
 * already proves the real crypto), so no network or real tokens are involved.
 */

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { VerifyResult } from "../src/auth/gateway-jwt.js";
import { createAuthMiddleware, type JwtVerifierLike } from "../src/auth/http-auth-middleware.js";
import { getCallerIdentity } from "../src/auth/request-identity.js";

const GATEWAY_HEADER = "X-Pommer-Gateway-Jwt";
const OPERATOR_TOKEN = "operator-secret-token";

type Mode = "off" | "shadow" | "enforce";

interface HarnessOptions {
  mode: Mode;
  authToken?: string;
  verify?: JwtVerifierLike["verify"];
  /** Optional delay (ms) inside the downstream probe before reading identity. */
  probeDelayMs?: number;
}

interface Harness {
  app: express.Express;
  downstream: ReturnType<typeof vi.fn>;
  warnings: Array<{ obj: Record<string, unknown>; msg?: string }>;
}

function makeHarness(opts: HarnessOptions): Harness {
  const warnings: Harness["warnings"] = [];
  const logger = {
    warn: (obj: Record<string, unknown>, msg?: string) => {
      warnings.push({ obj, msg });
    },
  };

  const verifier: JwtVerifierLike | undefined = opts.verify
    ? { verify: opts.verify }
    : opts.mode === "off"
      ? undefined
      : { verify: async () => ({ status: "invalid", reason: "no-verify-configured" }) };

  const middleware = createAuthMiddleware({
    mode: opts.mode,
    authToken: opts.authToken,
    verifier,
    logger,
  });

  // Spy standing in for the real MCP transport handler.
  const downstream = vi.fn();

  const isAuthorized = (req: express.Request): boolean => {
    if (!opts.authToken) return true;
    return req.headers.authorization === `Bearer ${opts.authToken}`;
  };

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", sessions: 0 });
  });

  app.all("/mcp", middleware, async (req, res) => {
    // Mirrors src/index.ts: the legacy operator-token gate governs access in
    // both `off` and `shadow`; only `enforce` hands the gate to the middleware.
    if (opts.mode !== "enforce" && !isAuthorized(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    downstream(req.method);
    if (opts.probeDelayMs && opts.probeDelayMs > 0) {
      await new Promise((r) => setTimeout(r, opts.probeDelayMs));
    }
    const identity = getCallerIdentity() ?? null;
    res.json({ ok: true, identity });
  });

  return { app, downstream, warnings };
}

describe("createAuthMiddleware — config guard", () => {
  it("throws when mode is not 'off' and no verifier is provided", () => {
    expect(() => createAuthMiddleware({ mode: "enforce", authToken: OPERATOR_TOKEN })).toThrow(
      /verifier is required/,
    );
    expect(() => createAuthMiddleware({ mode: "shadow" })).toThrow(/verifier is required/);
  });

  it("does not require a verifier in 'off' mode", () => {
    expect(() => createAuthMiddleware({ mode: "off" })).not.toThrow();
  });
});

describe("enforce mode", () => {
  it("rejects a request with no credentials → 401 JSON-RPC, downstream not invoked", async () => {
    const h = makeHarness({ mode: "enforce", authToken: OPERATOR_TOKEN });
    const res = await request(h.app).post("/mcp").send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: expect.stringContaining("Unauthorized") },
      id: null,
    });
    expect(h.downstream).not.toHaveBeenCalled();
  });

  it("accepts a valid gateway JWT → 200 and getCallerIdentity() sees the persona", async () => {
    const verify = vi.fn(
      async (): Promise<VerifyResult> => ({
        status: "valid",
        personaKey: "ferdinand",
        sub: "pat:ferdinand",
      }),
    );
    const h = makeHarness({ mode: "enforce", verify });
    const res = await request(h.app)
      .post("/mcp")
      .set(GATEWAY_HEADER, "any.mocked.token")
      .send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(200);
    expect(h.downstream).toHaveBeenCalledTimes(1);
    expect(res.body.identity).toEqual({ personaKey: "ferdinand", sub: "pat:ferdinand" });
    expect(verify).toHaveBeenCalledWith("any.mocked.token");
  });

  it("accepts the correct operator bearer token → 200, identity is __operator__", async () => {
    const h = makeHarness({ mode: "enforce", authToken: OPERATOR_TOKEN });
    const res = await request(h.app)
      .post("/mcp")
      .set("Authorization", `Bearer ${OPERATOR_TOKEN}`)
      .send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(200);
    expect(res.body.identity).toEqual({ personaKey: "__operator__", sub: "__operator__" });
  });

  it("rejects a wrong bearer of the SAME length → 401, no throw", async () => {
    // Same length as OPERATOR_TOKEN, different content.
    const wrong = "x".repeat(OPERATOR_TOKEN.length);
    expect(wrong.length).toBe(OPERATOR_TOKEN.length);
    const h = makeHarness({ mode: "enforce", authToken: OPERATOR_TOKEN });
    const res = await request(h.app)
      .post("/mcp")
      .set("Authorization", `Bearer ${wrong}`)
      .send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(401);
    expect(h.downstream).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer of DIFFERENT length → 401, not a thrown exception", async () => {
    // constant-time compare hashes both sides to fixed 32-byte digests before
    // timingSafeEqual, so a length mismatch is rejected safely (no throw) and
    // takes the same comparison path as an equal-length mismatch — no obvious
    // timing side-channel. A wall-clock timing assertion would be flaky in a
    // unit test; this asserts the correctness half (safe rejection).
    const wrong = "short";
    expect(wrong.length).not.toBe(OPERATOR_TOKEN.length);
    const h = makeHarness({ mode: "enforce", authToken: OPERATOR_TOKEN });
    const res = await request(h.app)
      .post("/mcp")
      .set("Authorization", `Bearer ${wrong}`)
      .send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(-32000);
    expect(h.downstream).not.toHaveBeenCalled();
  });

  it("returns 503 (not 401) when the JWKS is unavailable", async () => {
    const verify = vi.fn(
      async (): Promise<VerifyResult> => ({
        status: "jwks_unavailable",
        reason: "JWKS fetch failed: HTTP 502",
      }),
    );
    const h = makeHarness({ mode: "enforce", verify });
    const res = await request(h.app)
      .post("/mcp")
      .set(GATEWAY_HEADER, "any.mocked.token")
      .send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe(-32000);
    expect(h.downstream).not.toHaveBeenCalled();
  });

  it("gates the DELETE method the same way as POST/GET", async () => {
    const h = makeHarness({ mode: "enforce", authToken: OPERATOR_TOKEN });
    const res = await request(h.app).delete("/mcp");

    expect(res.status).toBe(401);
    expect(h.downstream).not.toHaveBeenCalled();
  });

  it("allows an authenticated DELETE through the gate", async () => {
    const h = makeHarness({ mode: "enforce", authToken: OPERATOR_TOKEN });
    const res = await request(h.app)
      .delete("/mcp")
      .set("Authorization", `Bearer ${OPERATOR_TOKEN}`);

    expect(res.status).toBe(200);
    expect(h.downstream).toHaveBeenCalledWith("DELETE");
    expect(res.body.identity).toEqual({ personaKey: "__operator__", sub: "__operator__" });
  });
});

describe("shadow mode", () => {
  it("lets an invalid token through (200), invokes downstream, and warns with the reason", async () => {
    const verify = vi.fn(
      async (): Promise<VerifyResult> => ({ status: "invalid", reason: "bad signature" }),
    );
    const h = makeHarness({ mode: "shadow", verify });
    const res = await request(h.app)
      .post("/mcp")
      .set(GATEWAY_HEADER, "bad.token")
      .send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(200);
    expect(h.downstream).toHaveBeenCalledTimes(1);
    // Proceeds WITHOUT an authenticated identity.
    expect(res.body.identity).toBeNull();
    const warn = h.warnings.find((w) => w.msg === "gateway_jwt.shadow_reject");
    expect(warn).toBeDefined();
    expect(warn?.obj.reason).toBe("bad signature");
  });

  it("lets a no-credentials request through (200) and warns — WHEN no AUTH_TOKEN is configured", async () => {
    // With no operator token configured, shadow behaves like today's un-gated
    // `off` mode: nothing to check, the request proceeds.
    const h = makeHarness({ mode: "shadow" });
    const res = await request(h.app).post("/mcp").send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(200);
    expect(h.downstream).toHaveBeenCalledTimes(1);
    expect(res.body.identity).toBeNull();
    expect(h.warnings.some((w) => w.msg === "gateway_jwt.shadow_reject")).toBe(true);
  });

  it("REJECTS a no-credentials request (401) when AUTH_TOKEN IS configured — the legacy gate now applies in shadow", async () => {
    // This is the Side-1 fix: flipping to shadow must NOT strip the operator
    // gate. No credentials + a configured AUTH_TOKEN → legacy 401, identical to
    // `off` mode, before the request ever reaches the tool path.
    const h = makeHarness({ mode: "shadow", authToken: OPERATOR_TOKEN });
    const res = await request(h.app).post("/mcp").send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(h.downstream).not.toHaveBeenCalled();
  });

  it("correct operator bearer proceeds (200) with NO identity, exactly as off mode's operator path", async () => {
    const h = makeHarness({ mode: "shadow", authToken: OPERATOR_TOKEN });
    const res = await request(h.app)
      .post("/mcp")
      .set("Authorization", `Bearer ${OPERATOR_TOKEN}`)
      .send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(200);
    expect(h.downstream).toHaveBeenCalledTimes(1);
    // Byte-for-byte like off: operator identity is NOT bound in shadow.
    expect(res.body.identity).toBeNull();
  });

  it("valid JWT for persona X targeting persona Y's mailbox PROCEEDS with no bound identity, and logs shadow_verify_ok", async () => {
    // The Side-2 regression test. In enforce this JWT would bind
    // { personaKey: "persona-x" } and persona-pinning would 403 the
    // cross-mailbox call / rewrite /me. In shadow the identity must NOT be
    // bound, so getCallerIdentity() stays null downstream and persona-pinning
    // never fires — while a distinct shadow_verify_ok log records what enforce
    // WOULD have decided. No AUTH_TOKEN here isolates the pinning concern from
    // the legacy gate.
    const verify = vi.fn(
      async (): Promise<VerifyResult> => ({
        status: "valid",
        personaKey: "persona-x",
        sub: "pat:persona-x",
      }),
    );
    const h = makeHarness({ mode: "shadow", verify });
    const res = await request(h.app)
      .post("/mcp")
      .set(GATEWAY_HEADER, "valid.persona-x.token")
      .send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(200);
    expect(h.downstream).toHaveBeenCalledTimes(1);
    // Key assertion: NO enforced identity → persona-pinning's no-op branch.
    expect(res.body.identity).toBeNull();

    // A "shadow" log distinct from a genuine pass, and distinct from a reject.
    const verifyOk = h.warnings.find((w) => w.msg === "gateway_jwt.shadow_verify_ok");
    expect(verifyOk).toBeDefined();
    expect(verifyOk?.obj).toMatchObject({ personaKey: "persona-x", sub: "pat:persona-x" });
    // It is a verify-ok observation, NOT a reject.
    expect(h.warnings.some((w) => w.msg === "gateway_jwt.shadow_reject")).toBe(false);
  });
});

describe("/health is never gated", () => {
  for (const mode of ["off", "shadow", "enforce"] as const) {
    it(`returns 200 with zero credentials in ${mode} mode`, async () => {
      const h = makeHarness({ mode, authToken: OPERATOR_TOKEN });
      const res = await request(h.app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  }
});

describe("off mode — backward compatibility", () => {
  it("no AUTH_TOKEN: any request proceeds with no identity, no 401 from the middleware", async () => {
    const h = makeHarness({ mode: "off" });
    const res = await request(h.app).post("/mcp").send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(200);
    expect(h.downstream).toHaveBeenCalledTimes(1);
    expect(res.body.identity).toBeNull();
  });

  it("with AUTH_TOKEN: the pre-existing isAuthorized gate still applies (wrong token → 401)", async () => {
    const h = makeHarness({ mode: "off", authToken: OPERATOR_TOKEN });
    const res = await request(h.app)
      .post("/mcp")
      .set("Authorization", "Bearer nope")
      .send({ jsonrpc: "2.0", method: "ping", id: 1 });

    // Legacy shape, unchanged — NOT the new JSON-RPC error body.
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(h.downstream).not.toHaveBeenCalled();
  });

  it("with AUTH_TOKEN: correct token proceeds (200), still no identity context in off mode", async () => {
    const h = makeHarness({ mode: "off", authToken: OPERATOR_TOKEN });
    const res = await request(h.app)
      .post("/mcp")
      .set("Authorization", `Bearer ${OPERATOR_TOKEN}`)
      .send({ jsonrpc: "2.0", method: "ping", id: 1 });

    expect(res.status).toBe(200);
    expect(h.downstream).toHaveBeenCalledTimes(1);
    expect(res.body.identity).toBeNull();
  });
});

describe("shadow and off produce IDENTICAL access-control outcomes", () => {
  // Same AUTH_TOKEN configured for both modes; a valid-JWT / invalid-JWT verifier
  // so the JWT path is exercised in shadow (in off the middleware is a pure
  // no-op and never consults the verifier). The ONLY permitted difference
  // between the two modes is whether a shadow-observability log was emitted.
  const verify = async (token: string): Promise<VerifyResult> =>
    token === "good.jwt"
      ? { status: "valid", personaKey: "persona-x", sub: "pat:persona-x" }
      : { status: "invalid", reason: "bad signature" };

  type Shape = {
    name: string;
    apply: (r: request.Test) => request.Test;
    expectedStatus: number;
  };

  const shapes: Shape[] = [
    { name: "no credentials", apply: (r) => r, expectedStatus: 401 },
    {
      name: "wrong operator token",
      apply: (r) => r.set("Authorization", "Bearer wrong-token"),
      expectedStatus: 401,
    },
    {
      name: "correct operator token",
      apply: (r) => r.set("Authorization", `Bearer ${OPERATOR_TOKEN}`),
      expectedStatus: 200,
    },
    {
      name: "valid JWT (no operator bearer)",
      apply: (r) => r.set(GATEWAY_HEADER, "good.jwt"),
      expectedStatus: 401,
    },
    {
      name: "invalid JWT (no operator bearer)",
      apply: (r) => r.set(GATEWAY_HEADER, "bad.jwt"),
      expectedStatus: 401,
    },
  ];

  for (const shape of shapes) {
    it(`${shape.name}: same accept/reject decision in off and shadow`, async () => {
      const off = makeHarness({ mode: "off", authToken: OPERATOR_TOKEN });
      const shadow = makeHarness({ mode: "shadow", authToken: OPERATOR_TOKEN, verify });

      const offRes = await shape
        .apply(request(off.app).post("/mcp"))
        .send({ jsonrpc: "2.0", method: "ping", id: 1 });
      const shadowRes = await shape
        .apply(request(shadow.app).post("/mcp"))
        .send({ jsonrpc: "2.0", method: "ping", id: 1 });

      expect(offRes.status).toBe(shape.expectedStatus);
      expect(shadowRes.status).toBe(shape.expectedStatus);
      expect(shadowRes.status).toBe(offRes.status);
      // Downstream reached (or not) identically in both modes.
      expect(shadow.downstream.mock.calls.length).toBe(off.downstream.mock.calls.length);
      // off never emits shadow-observability logs.
      expect(off.warnings.length).toBe(0);
    });
  }
});

describe("AsyncLocalStorage isolation between concurrent requests", () => {
  it("each in-flight request sees its OWN identity, not the other's", async () => {
    // The verifier returns a different persona per token. Both requests are
    // fired without awaiting sequentially, and the downstream probe delays
    // before reading getCallerIdentity() so the two request timelines actually
    // interleave — a module-level variable would let one clobber the other.
    const verify = vi.fn(async (token: string): Promise<VerifyResult> => {
      if (token === "tok-alice") return { status: "valid", personaKey: "alice", sub: "pat:alice" };
      return { status: "valid", personaKey: "bob", sub: "pat:bob" };
    });
    const h = makeHarness({ mode: "enforce", verify, probeDelayMs: 40 });

    const [resA, resB] = await Promise.all([
      request(h.app)
        .post("/mcp")
        .set(GATEWAY_HEADER, "tok-alice")
        .send({ jsonrpc: "2.0", method: "ping", id: 1 }),
      request(h.app)
        .post("/mcp")
        .set(GATEWAY_HEADER, "tok-bob")
        .send({ jsonrpc: "2.0", method: "ping", id: 2 }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resA.body.identity).toEqual({ personaKey: "alice", sub: "pat:alice" });
    expect(resB.body.identity).toEqual({ personaKey: "bob", sub: "pat:bob" });
  });
});
