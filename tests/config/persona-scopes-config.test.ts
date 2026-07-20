import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLoadedPersonaScopes } from "../../src/auth/persona-scopes.js";
import { loadConfig } from "../../src/config.js";

const SHIPPED = join(process.cwd(), "config", "persona-scopes.json");

const ENV_KEYS = [
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "GATEWAY_JWT_MODE",
  "GATEWAY_ISSUER",
  "MS_MCP_PERSONA_SCOPES_PATH",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  resetLoadedPersonaScopes();
  process.env.AZURE_TENANT_ID = "test-tenant";
  process.env.AZURE_CLIENT_ID = "test-client";
  process.env.GATEWAY_ISSUER = "https://gw.example";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetLoadedPersonaScopes();
});

describe("persona-scopes boot-time fail-closed", () => {
  it("jwtMode enforce + missing scopes file → loadConfig throws", () => {
    process.env.GATEWAY_JWT_MODE = "enforce";
    process.env.MS_MCP_PERSONA_SCOPES_PATH = "/does/not/exist/persona-scopes.json";
    expect(() => loadConfig()).toThrow(/persona-scopes file/);
  });

  it("jwtMode enforce + malformed JSON → loadConfig throws", () => {
    const dir = mkdtempSync(join(tmpdir(), "b5-scopes-"));
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{ not json ", "utf8");
    process.env.GATEWAY_JWT_MODE = "enforce";
    process.env.MS_MCP_PERSONA_SCOPES_PATH = bad;
    expect(() => loadConfig()).toThrow(/not valid JSON/);
  });

  it("jwtMode enforce + wrong shape → loadConfig throws", () => {
    const dir = mkdtempSync(join(tmpdir(), "b5-scopes-"));
    const bad = join(dir, "shape.json");
    writeFileSync(bad, JSON.stringify({ helga: { drive: "sideways" } }), "utf8");
    process.env.GATEWAY_JWT_MODE = "enforce";
    process.env.MS_MCP_PERSONA_SCOPES_PATH = bad;
    expect(() => loadConfig()).toThrow(/invalid shape/);
  });

  it("jwtMode off → scopes file is NOT required (no throw even if missing)", () => {
    process.env.GATEWAY_JWT_MODE = "off";
    process.env.MS_MCP_PERSONA_SCOPES_PATH = "/does/not/exist.json";
    expect(() => loadConfig()).not.toThrow();
  });

  it("jwtMode enforce + valid shipped file → loads cleanly", () => {
    process.env.GATEWAY_JWT_MODE = "enforce";
    process.env.MS_MCP_PERSONA_SCOPES_PATH = SHIPPED;
    expect(() => loadConfig()).not.toThrow();
  });
});
