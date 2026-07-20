import { z } from "zod";
import { loadPersonaScopesFromFile } from "./auth/persona-scopes.js";
import { resolveTildePath } from "./utils/path.js";

const ToolPreset = z.enum(["readonly", "mvp", "full"]);
type ToolPreset = z.infer<typeof ToolPreset>;

const GatewayJwtMode = z.enum(["off", "shadow", "enforce"]);
type GatewayJwtMode = z.infer<typeof GatewayJwtMode>;

const ConfigSchema = z
  .object({
    azure: z.object({
      tenantId: z.string().min(1, "AZURE_TENANT_ID is required"),
      clientId: z.string().min(1, "AZURE_CLIENT_ID is required"),
      clientSecret: z.string().optional(),
    }),
    server: z.object({
      logLevel: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
      toolPreset: ToolPreset.default("mvp"),
    }),
    limits: z.object({
      maxItems: z.number().int().positive().max(100).default(25),
      maxBodyLength: z.number().int().positive().max(10000).default(500),
    }),
    cache: z.object({
      tokenCachePath: z.string().default("~/.ms-mcp/token-cache.json"),
    }),
    gateway: z
      .object({
        // Operator bearer token for direct/local HTTP access. Absent unless set
        // in the environment; never defaulted.
        authToken: z.string().optional(),
        // Dedicated, deliberately powerless boot bearer token for the
        // gateway's boot-time tool-catalog enumeration (`tools/list`, no
        // persona context). Absent unless set in the environment; never
        // defaulted, and its absence never widens access — see
        // `BOOT_PERSONA_KEY` in `auth/http-auth-middleware.ts`.
        bootAuthToken: z.string().optional(),
        // Gateway base URL for JWT issuer match + JWKS fetch (`<issuer>/jwks.json`).
        issuer: z.string().optional(),
        jwtAudience: z.string().default("pommer-m365-mcp"),
        // `off` is a true no-op (unchanged behavior); flipping to shadow/enforce
        // is a deploy-time rollout decision, not something code forces on.
        jwtMode: GatewayJwtMode.default("off"),
      })
      .prefault({}),
    personaScopes: z
      .object({
        // File holding the per-persona access matrix enforced under B5. Loaded
        // and validated at boot when auth is enabled (see loadConfig); relative
        // paths resolve against cwd like other file-based config.
        path: z.string().default("config/persona-scopes.json"),
      })
      .prefault({}),
  })
  .superRefine((val, ctx) => {
    // A non-`off` mode with no issuer configured is a startup misconfiguration —
    // fail config load loudly rather than silently no-op-ing auth.
    if (val.gateway.jwtMode !== "off" && !val.gateway.issuer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gateway", "issuer"],
        message: "GATEWAY_ISSUER is required when GATEWAY_JWT_MODE is 'shadow' or 'enforce'",
      });
    }
  });

type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const config = ConfigSchema.parse({
    azure: {
      tenantId: process.env.AZURE_TENANT_ID ?? "",
      clientId: process.env.AZURE_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
    server: {
      logLevel: process.env.LOG_LEVEL ?? "info",
      toolPreset: process.env.TOOL_PRESET ?? "mvp",
    },
    limits: {
      maxItems: process.env.MAX_ITEMS ? Number.parseInt(process.env.MAX_ITEMS, 10) : 25,
      maxBodyLength: process.env.MAX_BODY_LENGTH
        ? Number.parseInt(process.env.MAX_BODY_LENGTH, 10)
        : 500,
    },
    cache: {
      tokenCachePath: process.env.TOKEN_CACHE_PATH ?? "~/.ms-mcp/token-cache.json",
    },
    gateway: {
      authToken: process.env.AUTH_TOKEN,
      bootAuthToken: process.env.BOOT_AUTH_TOKEN,
      issuer: process.env.GATEWAY_ISSUER,
      jwtAudience: process.env.GATEWAY_JWT_AUDIENCE ?? "pommer-m365-mcp",
      jwtMode: process.env.GATEWAY_JWT_MODE ?? "off",
    },
    personaScopes: {
      path: process.env.MS_MCP_PERSONA_SCOPES_PATH ?? "config/persona-scopes.json",
    },
  });

  // When auth is enabled, the persona-scopes matrix is load-bearing: a missing
  // or malformed file must fail loudly at boot rather than silently allow-all.
  // In `off` mode nothing enforces scopes, so the file is not required. Mirrors
  // the gateway superRefine's "enforced but misconfigured" fail-closed stance.
  if (config.gateway.jwtMode !== "off") {
    loadPersonaScopesFromFile(resolveTildePath(config.personaScopes.path));
  }

  return config;
}

type LimitsConfig = Config["limits"];
type GatewayConfig = Config["gateway"];

export {
  type Config,
  ConfigSchema,
  type GatewayConfig,
  type GatewayJwtMode,
  type LimitsConfig,
  type ToolPreset,
};
