import pino from "pino";

const BASE_LOGGER = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 2 } }
      : undefined,
  redact: {
    paths: ["req.headers.authorization", "accessToken", "token", "client_secret"],
    censor: "[REDACTED]",
  },
  serializers: {
    error: pino.stdSerializers.err,
  },
});

export function createLogger(module: string): pino.Logger {
  return BASE_LOGGER.child({ module });
}

export { BASE_LOGGER as logger };
