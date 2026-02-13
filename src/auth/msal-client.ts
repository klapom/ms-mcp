import {
  type AccountInfo,
  type AuthenticationResult,
  type DeviceCodeRequest,
  type ICachePlugin,
  PublicClientApplication,
} from "@azure/msal-node";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("auth");

/**
 * Thrown when a cached token is invalid (e.g. scopes changed, consent revoked).
 * Provides a clear, actionable error message for the user.
 */
export class AuthTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthTokenError";
  }
}

// Default scopes for MVP
const DEFAULT_SCOPES = [
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Files.ReadWrite",
  "Contacts.ReadWrite",
  "Tasks.ReadWrite",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "ChannelMessage.Read.All",
  "ChannelMessage.Send",
  "Chat.Read",
  "Chat.ReadWrite",
  "Sites.Read.All",
  "Sites.ReadWrite.All",
];

/**
 * MSAL client for authentication with Microsoft Graph API.
 * Supports Device Code Flow for interactive auth with silent token
 * acquisition for subsequent requests.
 *
 * Optionally accepts an ICachePlugin for persistent token storage
 * across server restarts (via @azure/msal-node-extensions).
 * Without a plugin, tokens are kept in-memory only.
 */
export class MsalClient {
  readonly tenantId: string;
  readonly clientId: string;
  private pca: PublicClientApplication;
  private account: AccountInfo | null = null;
  private scopes: string[];

  constructor(tenantId: string, clientId: string, scopes?: string[], cachePlugin?: ICachePlugin) {
    this.tenantId = tenantId;
    this.clientId = clientId;
    this.scopes = scopes ?? DEFAULT_SCOPES;

    this.pca = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
      ...(cachePlugin ? { cache: { cachePlugin } } : {}),
    });

    logger.info({ tenantId }, "MsalClient initialized");
  }

  /**
   * Get an access token, using cached token if available.
   * Falls back to Device Code Flow if no cached token.
   */
  async getAccessToken(): Promise<string> {
    const silent = await this.tryAcquireSilent();
    if (silent) {
      return silent;
    }

    // Device Code Flow (interactive)
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
   * Try to get an access token silently (from cache/refresh token only).
   * Returns null if no cached token is available, instead of falling
   * back to Device Code Flow. Useful for startup checks in MCP mode
   * where interactive auth is not possible.
   */
  async getAccessTokenSilentOnly(): Promise<string | null> {
    return this.tryAcquireSilent();
  }

  /**
   * Attempts silent token acquisition from in-memory account or persistent cache.
   * Shared by getAccessToken() (with device code fallback) and
   * getAccessTokenSilentOnly() (returns null on failure).
   */
  private async tryAcquireSilent(): Promise<string | null> {
    // 1. Try silent acquisition with in-memory account
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
      } catch (error: unknown) {
        this.handleSilentError(error);
      }
    }

    // 2. Try to get cached accounts from persistent cache
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
      } catch (error: unknown) {
        this.handleSilentError(error);
      }
    }

    return null;
  }

  /**
   * Checks if a silent acquisition error is an invalid_grant (scope change,
   * revoked consent, expired refresh token). Throws a clear error instead of
   * silently falling through to Device Code Flow (which hangs in MCP mode).
   */
  private handleSilentError(error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes("invalid_grant") ||
      msg.includes("AADSTS65001") ||
      msg.includes("AADSTS50076")
    ) {
      logger.warn("Token invalid — scopes may have changed or consent was revoked");
      throw new AuthTokenError(
        "Authentication token is invalid. This typically happens when required permissions (scopes) " +
          "have changed or admin consent was revoked. To fix this:\n\n" +
          "  1. Ensure the Azure App Registration has all required API permissions\n" +
          "  2. Grant admin consent in the Azure Portal (if required)\n" +
          "  3. Re-authenticate: pnpm auth logout && pnpm auth login\n",
      );
    }
    logger.debug("Silent token acquisition failed");
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
