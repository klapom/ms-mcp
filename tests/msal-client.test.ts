import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @azure/msal-node before importing MsalClient
const mockGetAllAccounts = vi.fn().mockResolvedValue([]);
const mockRemoveAccount = vi.fn().mockResolvedValue(undefined);

const mockPca = {
  acquireTokenSilent: vi.fn(),
  acquireTokenByDeviceCode: vi.fn(),
  getTokenCache: vi.fn(() => ({
    getAllAccounts: mockGetAllAccounts,
    removeAccount: mockRemoveAccount,
  })),
};

vi.mock("@azure/msal-node", () => ({
  PublicClientApplication: vi.fn(() => mockPca),
}));

// Suppress pino log output during tests
vi.mock("../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

const { MsalClient } = await import("../src/auth/msal-client.js");
const { PublicClientApplication } = await import("@azure/msal-node");

const TENANT_ID = "test-tenant-id";
const CLIENT_ID = "test-client-id";

const mockAccount = {
  homeAccountId: "home-account-id",
  environment: "login.microsoftonline.com",
  tenantId: TENANT_ID,
  username: "user@example.com",
  localAccountId: "local-account-id",
};

const mockAuthResult = {
  accessToken: "mock-access-token-123",
  account: mockAccount,
  authority: `https://login.microsoftonline.com/${TENANT_ID}`,
  uniqueId: "unique-id",
  tenantId: TENANT_ID,
  scopes: ["User.Read"],
  expiresOn: new Date(Date.now() + 3600 * 1000),
  idToken: "mock-id-token",
  idTokenClaims: {},
  fromCache: false,
  tokenType: "Bearer",
  correlationId: "correlation-id",
};

describe("MsalClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllAccounts.mockResolvedValue([]);
  });

  describe("constructor", () => {
    it("should initialize with tenantId and clientId", () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      expect(client.tenantId).toBe(TENANT_ID);
      expect(client.clientId).toBe(CLIENT_ID);
      expect(PublicClientApplication).toHaveBeenCalledWith({
        auth: {
          clientId: CLIENT_ID,
          authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        },
      });
    });

    it("should pass cachePlugin to PCA config when provided", () => {
      const mockCachePlugin = {
        beforeCacheAccess: vi.fn(),
        afterCacheAccess: vi.fn(),
      };

      new MsalClient(TENANT_ID, CLIENT_ID, undefined, mockCachePlugin);

      expect(PublicClientApplication).toHaveBeenCalledWith({
        auth: {
          clientId: CLIENT_ID,
          authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        },
        cache: { cachePlugin: mockCachePlugin },
      });
    });

    it("should not include cache config when no cachePlugin provided", () => {
      new MsalClient(TENANT_ID, CLIENT_ID);

      expect(PublicClientApplication).toHaveBeenCalledWith({
        auth: {
          clientId: CLIENT_ID,
          authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        },
      });
    });

    it("should use default scopes when none provided", async () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      mockPca.acquireTokenByDeviceCode.mockResolvedValueOnce(mockAuthResult);
      await client.getAccessToken();

      expect(mockPca.acquireTokenByDeviceCode).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: expect.arrayContaining(["User.Read"]),
        }),
      );
    });

    it("should use custom scopes when provided", async () => {
      const customScopes = ["Mail.Read", "Calendars.Read"];
      const client = new MsalClient(TENANT_ID, CLIENT_ID, customScopes);

      mockPca.acquireTokenByDeviceCode.mockResolvedValueOnce(mockAuthResult);
      await client.getAccessToken();

      expect(mockPca.acquireTokenByDeviceCode).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: customScopes,
        }),
      );
    });
  });

  describe("getAccessToken", () => {
    it("should acquire token silently when account is cached", async () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      // First call: set up device code to establish the account
      mockPca.acquireTokenByDeviceCode.mockResolvedValueOnce(mockAuthResult);
      await client.getAccessToken();

      // Second call: should use silent acquisition
      mockPca.acquireTokenSilent.mockResolvedValueOnce(mockAuthResult);
      const token = await client.getAccessToken();

      expect(token).toBe("mock-access-token-123");
      expect(mockPca.acquireTokenSilent).toHaveBeenCalledWith({
        account: mockAccount,
        scopes: expect.arrayContaining(["User.Read"]),
      });
    });

    it("should fall back to cache accounts when no in-memory account", async () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      // No in-memory account, but cache has accounts
      mockGetAllAccounts.mockResolvedValueOnce([mockAccount]);
      mockPca.acquireTokenSilent.mockResolvedValueOnce(mockAuthResult);

      const token = await client.getAccessToken();

      expect(token).toBe("mock-access-token-123");
      expect(mockGetAllAccounts).toHaveBeenCalled();
      expect(mockPca.acquireTokenSilent).toHaveBeenCalledWith({
        account: mockAccount,
        scopes: expect.arrayContaining(["User.Read"]),
      });
    });

    it("should fall back to device code flow when silent fails", async () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      // No cached accounts, so device code flow is used
      mockGetAllAccounts.mockResolvedValueOnce([]);
      mockPca.acquireTokenByDeviceCode.mockResolvedValueOnce(mockAuthResult);

      const token = await client.getAccessToken();

      expect(token).toBe("mock-access-token-123");
      expect(mockPca.acquireTokenByDeviceCode).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: expect.arrayContaining(["User.Read"]),
          deviceCodeCallback: expect.any(Function),
        }),
      );
    });

    it("should fall back to device code when silent acquisition throws", async () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      // First call: establish account via device code
      mockPca.acquireTokenByDeviceCode.mockResolvedValueOnce(mockAuthResult);
      await client.getAccessToken();

      // Second call: silent fails, cache fails, device code succeeds
      mockPca.acquireTokenSilent.mockRejectedValueOnce(new Error("token expired"));
      mockGetAllAccounts.mockResolvedValueOnce([mockAccount]);
      mockPca.acquireTokenSilent.mockRejectedValueOnce(new Error("cache miss"));
      mockPca.acquireTokenByDeviceCode.mockResolvedValueOnce(mockAuthResult);

      const token = await client.getAccessToken();
      expect(token).toBe("mock-access-token-123");
    });

    it("should write device code message to stderr", async () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      const deviceCodeMessage =
        "To sign in, use a web browser to open https://microsoft.com/devicelogin and enter the code ABC123";

      mockPca.acquireTokenByDeviceCode.mockImplementation(
        async (request: { deviceCodeCallback: (response: { message: string }) => void }) => {
          request.deviceCodeCallback({ message: deviceCodeMessage });
          return mockAuthResult;
        },
      );

      await client.getAccessToken();

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(deviceCodeMessage));
      stderrSpy.mockRestore();
    });

    it("should throw when device code returns null", async () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      mockPca.acquireTokenByDeviceCode.mockResolvedValueOnce(null);

      await expect(client.getAccessToken()).rejects.toThrow("Device code flow returned no result");
    });

    it("should use custom scopes in token requests", async () => {
      const customScopes = ["Mail.Read", "Calendars.Read"];
      const client = new MsalClient(TENANT_ID, CLIENT_ID, customScopes);

      mockPca.acquireTokenByDeviceCode.mockResolvedValueOnce(mockAuthResult);
      await client.getAccessToken();

      expect(mockPca.acquireTokenByDeviceCode).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: customScopes,
        }),
      );
    });
  });

  describe("isAuthenticated", () => {
    it("should return false when no account", async () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      mockGetAllAccounts.mockResolvedValueOnce([]);

      const result = await client.isAuthenticated();
      expect(result).toBe(false);
    });

    it("should return true after successful auth", async () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      // Authenticate first
      mockPca.acquireTokenByDeviceCode.mockResolvedValueOnce(mockAuthResult);
      await client.getAccessToken();

      const result = await client.isAuthenticated();
      expect(result).toBe(true);
    });

    it("should return true when account exists in cache", async () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      mockGetAllAccounts.mockResolvedValueOnce([mockAccount]);

      const result = await client.isAuthenticated();
      expect(result).toBe(true);
    });
  });

  describe("logout", () => {
    it("should clear the account", async () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      // Authenticate first
      mockPca.acquireTokenByDeviceCode.mockResolvedValueOnce(mockAuthResult);
      await client.getAccessToken();

      await client.logout();

      // After logout, isAuthenticated should check cache (which is empty)
      mockGetAllAccounts.mockResolvedValueOnce([]);
      const result = await client.isAuthenticated();
      expect(result).toBe(false);
      expect(mockRemoveAccount).toHaveBeenCalledWith(mockAccount);
    });

    it("should be no-op when not authenticated", async () => {
      const client = new MsalClient(TENANT_ID, CLIENT_ID);

      // Should not throw, and should not call removeAccount
      await client.logout();

      expect(mockRemoveAccount).not.toHaveBeenCalled();
    });
  });
});
