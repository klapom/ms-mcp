import {
  type AccountInfo,
  type AuthenticationResult,
  type DeviceCodeRequest,
  PublicClientApplication,
} from "@azure/msal-node";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("auth");

// Default scopes for MVP
const DEFAULT_SCOPES = [
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Files.ReadWrite",
  "Contacts.ReadWrite",
  "Tasks.ReadWrite",
];

/**
 * MSAL client for authentication with Microsoft Graph API.
 * Supports Device Code Flow for interactive auth with silent token
 * acquisition for subsequent requests.
 *
 * Token cache is in-memory only for now.
 * TODO (Phase 2): Add persistent token cache via msal-node-extensions
 * using PersistenceCreator + PersistenceCachePlugin for cross-restart persistence.
 */
export class MsalClient {
  readonly tenantId: string;
  readonly clientId: string;
  private pca: PublicClientApplication;
  private account: AccountInfo | null = null;
  private scopes: string[];

  constructor(tenantId: string, clientId: string, scopes?: string[]) {
    this.tenantId = tenantId;
    this.clientId = clientId;
    this.scopes = scopes ?? DEFAULT_SCOPES;

    this.pca = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
    });

    logger.info({ tenantId }, "MsalClient initialized");
  }

  /**
   * Get an access token, using cached token if available.
   * Falls back to Device Code Flow if no cached token.
   */
  async getAccessToken(): Promise<string> {
    // 1. Try silent acquisition first (cached token / refresh token)
    if (this.account) {
      try {
        const result = await this.pca.acquireTokenSilent({
          account: this.account,
          scopes: this.scopes,
        });
        if (result?.accessToken) {
          logger.debug("Token acquired silently");
          return result.accessToken;
        }
      } catch {
        logger.debug("Silent token acquisition failed, falling back to device code");
      }
    }

    // 2. Try to get cached accounts
    const accounts = await this.pca.getTokenCache().getAllAccounts();
    if (accounts.length > 0) {
      this.account = accounts[0];
      try {
        const result = await this.pca.acquireTokenSilent({
          account: this.account,
          scopes: this.scopes,
        });
        if (result?.accessToken) {
          logger.debug("Token acquired from cache");
          return result.accessToken;
        }
      } catch {
        logger.debug("Cache token acquisition failed");
      }
    }

    // 3. Device Code Flow (interactive)
    const result = await this.acquireTokenByDeviceCode();
    return result.accessToken;
  }

  /**
   * Interactive Device Code Flow.
   * Outputs the device code URL and code to stderr for the user.
   * stderr is used because MCP uses stdout for JSON-RPC communication.
   */
  private async acquireTokenByDeviceCode(): Promise<AuthenticationResult> {
    const request: DeviceCodeRequest = {
      scopes: this.scopes,
      deviceCodeCallback: (response) => {
        // Output to stderr so it doesn't interfere with MCP stdio
        process.stderr.write(`\n${response.message}\n\n`);
        logger.info("Device code flow initiated");
      },
    };

    const result = await this.pca.acquireTokenByDeviceCode(request);
    if (!result) {
      throw new Error("Device code flow returned no result");
    }

    this.account = result.account;
    logger.info("Authentication successful");
    return result;
  }

  /**
   * Check if the client has a cached account (is "logged in").
   */
  async isAuthenticated(): Promise<boolean> {
    if (this.account) {
      return true;
    }
    const accounts = await this.pca.getTokenCache().getAllAccounts();
    if (accounts.length > 0) {
      this.account = accounts[0];
      return true;
    }
    return false;
  }

  /**
   * Clear cached tokens and account.
   */
  async logout(): Promise<void> {
    if (this.account) {
      const cache = this.pca.getTokenCache();
      await cache.removeAccount(this.account);
      this.account = null;
      logger.info("Logged out");
    }
  }
}
