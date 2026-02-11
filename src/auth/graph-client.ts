import { randomUUID } from "node:crypto";
import { Client } from "@microsoft/microsoft-graph-client";
import { createLogger } from "../utils/logger.js";
import type { MsalClient } from "./msal-client.js";

export const logger = createLogger("graph-client");

/**
 * Creates a Microsoft Graph API client with middleware chain.
 *
 * Middleware: Logging → RateLimit → Retry → Error-Mapping
 *
 * TODO (Phase 1): Implement full middleware chain
 */
export function createGraphClient(msalClient: MsalClient): Client {
  logger.debug("Creating Graph client");
  return Client.init({
    authProvider: async (done) => {
      try {
        const token = await msalClient.getAccessToken();
        done(null, token);
      } catch (error) {
        done(error as Error, null);
      }
    },
    defaultVersion: "v1.0",
  });
}

/**
 * Generates a unique request ID for Graph API call correlation.
 */
export function generateRequestId(): string {
  return randomUUID();
}
