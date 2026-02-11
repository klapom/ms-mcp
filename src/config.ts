import { z } from "zod";

const ToolPreset = z.enum(["readonly", "mvp", "full"]);
type ToolPreset = z.infer<typeof ToolPreset>;

const ConfigSchema = z.object({
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
    maxItems: z.number().int().positive().default(25),
    maxBodyLength: z.number().int().positive().default(500),
  }),
});

type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
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
  });
}

type LimitsConfig = Config["limits"];

export { type Config, ConfigSchema, type LimitsConfig, type ToolPreset };
