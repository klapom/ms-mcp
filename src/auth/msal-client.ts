import { createLogger } from "../utils/logger.js";

const logger = createLogger("auth");

/**
 * MSAL client for authentication with Microsoft Graph API.
 * Supports Device Code Flow for interactive auth.
 *
 * TODO (Phase 1): Implement full MSAL client with:
 * - Device Code Flow
 * - Token caching via OS Keychain (msal-node-extensions)
 * - Auto-refresh on token expiry
 */
export class MsalClient {
  readonly tenantId: string;
  readonly clientId: string;

  constructor(tenantId: string, clientId: string) {
    this.tenantId = tenantId;
    this.clientId = clientId;
    logger.info({ tenantId }, "MsalClient initialized");
  }

  async getAccessToken(): Promise<string> {
    // TODO: Implement proper MSAL auth
    throw new Error("Auth not yet implemented. Run setup first.");
  }
}
