import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before imports
const mockGetAccessToken = vi.fn();
const mockGetAccessTokenSilentOnly = vi.fn();
const mockLogout = vi.fn();
const mockUnlink = vi.fn();

vi.mock("node:fs/promises", () => ({
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

vi.mock("../src/auth/msal-client.js", () => ({
  MsalClient: vi.fn(() => ({
    getAccessToken: mockGetAccessToken,
    getAccessTokenSilentOnly: mockGetAccessTokenSilentOnly,
    logout: mockLogout,
  })),
}));

vi.mock("../src/auth/token-cache.js", () => ({
  createCachePlugin: vi.fn().mockResolvedValue({
    beforeCacheAccess: vi.fn(),
    afterCacheAccess: vi.fn(),
  }),
}));

vi.mock("../src/config.js", () => ({
  loadConfig: vi.fn(() => ({
    azure: { tenantId: "test-tenant", clientId: "test-client" },
    server: { logLevel: "info", toolPreset: "mvp" },
    limits: { maxItems: 25, maxBodyLength: 500 },
    cache: { tokenCachePath: "~/.ms-mcp/token-cache.json" },
  })),
}));

vi.mock("../src/utils/path.js", () => ({
  resolveTildePath: vi.fn((p: string) => `/home/test/${p.replace("~/", "")}`),
}));

vi.mock("../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// Import actual CLI functions (switch block won't fire — guarded by isMain check)
const { login, status, logout, showHelp } = await import("../src/cli/auth.js");

describe("auth CLI", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  describe("login", () => {
    it("should authenticate and display user info", async () => {
      mockGetAccessToken.mockResolvedValueOnce("mock-token-123");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ displayName: "Test User", mail: "test@example.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await login();

      expect(mockGetAccessToken).toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://graph.microsoft.com/v1.0/me?$select=displayName,mail",
        expect.objectContaining({ headers: { Authorization: "Bearer mock-token-123" } }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Authenticated as: Test User (test@example.com)"),
      );
    });

    it("should handle null mail gracefully", async () => {
      mockGetAccessToken.mockResolvedValueOnce("mock-token-123");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ displayName: "No Mail User", mail: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await login();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Authenticated as: No Mail User"),
      );
      // Should NOT contain parentheses when mail is null
      const authCall = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("Authenticated as:"),
      );
      expect(authCall?.[0]).not.toContain("(null)");
    });

    it("should succeed even if /me call fails", async () => {
      mockGetAccessToken.mockResolvedValueOnce("mock-token-123");
      fetchSpy.mockResolvedValueOnce(new Response("", { status: 403 }));

      await login();

      expect(consoleSpy).toHaveBeenCalledWith(
        "\nAuthenticated successfully (could not fetch user profile).",
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Token cached. The MCP server can now start without interactive auth.\n",
      );
    });
  });

  describe("status", () => {
    it("should show user info when authenticated", async () => {
      mockGetAccessTokenSilentOnly.mockResolvedValueOnce("mock-token-123");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ displayName: "Test User", mail: "test@example.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await status();

      expect(mockGetAccessTokenSilentOnly).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "\n[ms-mcp] Authenticated as: Test User (test@example.com)\n",
      );
    });

    it("should show not authenticated when no token", async () => {
      mockGetAccessTokenSilentOnly.mockResolvedValueOnce(null);

      await status();

      expect(consoleSpy).toHaveBeenCalledWith("\n[ms-mcp] Not authenticated.");
      expect(consoleSpy).toHaveBeenCalledWith("Run: pnpm auth login\n");
      expect(process.exitCode).toBe(1);

      // Reset exitCode for other tests
      process.exitCode = undefined;
    });

    it("should handle /me failure gracefully when authenticated", async () => {
      mockGetAccessTokenSilentOnly.mockResolvedValueOnce("mock-token-123");
      fetchSpy.mockResolvedValueOnce(new Response("", { status: 500 }));

      await status();

      expect(consoleSpy).toHaveBeenCalledWith(
        "\n[ms-mcp] Authenticated (token valid, could not fetch profile).\n",
      );
    });
  });

  describe("logout", () => {
    it("should call logout and report cache deletion", async () => {
      mockLogout.mockResolvedValueOnce(undefined);
      mockUnlink.mockResolvedValueOnce(undefined);

      await logout();

      expect(mockLogout).toHaveBeenCalled();
      expect(mockUnlink).toHaveBeenCalledWith("/home/test/.ms-mcp/token-cache.json");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Logged out. Cache file deleted:"),
      );
    });

    it("should handle missing cache file gracefully", async () => {
      mockLogout.mockResolvedValueOnce(undefined);
      const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      mockUnlink.mockRejectedValueOnce(enoent);

      await logout();

      expect(mockLogout).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith("\n[ms-mcp] Logged out. No cache file to delete.\n");
    });

    it("should rethrow non-ENOENT errors from unlink", async () => {
      mockLogout.mockResolvedValueOnce(undefined);
      const permError = Object.assign(new Error("EACCES"), { code: "EACCES" });
      mockUnlink.mockRejectedValueOnce(permError);

      await expect(logout()).rejects.toThrow("EACCES");
    });
  });

  describe("showHelp", () => {
    it("should output help text with all commands", () => {
      showHelp();

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("login");
      expect(output).toContain("status");
      expect(output).toContain("logout");
      expect(output).toContain("pommer-m365-mcp-auth");
      expect(output).toContain("pnpm auth login");
    });
  });
});
