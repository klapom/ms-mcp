#!/usr/bin/env node

/**
 * Auth CLI for pommer-m365-mcp.
 *
 * Provides interactive authentication management in the terminal,
 * where Device Code Flow can actually display the login URL.
 *
 * Usage:
 *   pnpm auth login                    — Authenticate via Device Code Flow
 *   pnpm auth status                   — Check current auth status
 *   pnpm auth logout                   — Clear cached tokens
 *   npx pommer-m365-mcp-auth login     — Via npx (installed binary)
 */

import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MsalClient } from "../auth/msal-client.js";
import { createCachePlugin } from "../auth/token-cache.js";
import { loadConfig } from "../config.js";
import { resolveTildePath } from "../utils/path.js";

interface UserInfo {
  displayName: string;
  mail: string | null;
}

/**
 * Fetches the current user's profile from Graph /me.
 * Uses native fetch instead of the Graph middleware chain — this is a
 * lightweight CLI utility call that doesn't need retry/logging/error-mapping.
 */
async function fetchUserInfo(token: string): Promise<UserInfo> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Graph /me failed: ${response.status} ${response.statusText}`);
  }
  const data: unknown = await response.json();
  const obj = data as Record<string, unknown>;
  return {
    displayName: typeof obj.displayName === "string" ? obj.displayName : "Unknown",
    mail: typeof obj.mail === "string" ? obj.mail : null,
  };
}

async function createMsalClient(): Promise<{ client: MsalClient; cachePath: string }> {
  const config = loadConfig();
  const cachePath = resolveTildePath(config.cache.tokenCachePath);
  const cachePlugin = await createCachePlugin(cachePath);
  const client = new MsalClient(
    config.azure.tenantId,
    config.azure.clientId,
    undefined,
    cachePlugin,
  );
  return { client, cachePath };
}

export async function login(): Promise<void> {
  console.log("\n[ms-mcp] Authenticating via Device Code Flow...\n");
  const { client } = await createMsalClient();
  const token = await client.getAccessToken();

  try {
    const user = await fetchUserInfo(token);
    const identity = user.mail ? `${user.displayName} (${user.mail})` : user.displayName;
    console.log(`\nAuthenticated as: ${identity}`);
  } catch {
    console.log("\nAuthenticated successfully (could not fetch user profile).");
  }

  console.log("Token cached. The MCP server can now start without interactive auth.\n");
}

export async function status(): Promise<void> {
  const { client } = await createMsalClient();
  const token = await client.getAccessTokenSilentOnly();

  if (!token) {
    console.log("\n[ms-mcp] Not authenticated.");
    console.log("Run: pnpm auth login\n");
    process.exitCode = 1;
    return;
  }

  try {
    const user = await fetchUserInfo(token);
    const identity = user.mail ? `${user.displayName} (${user.mail})` : user.displayName;
    console.log(`\n[ms-mcp] Authenticated as: ${identity}\n`);
  } catch {
    console.log("\n[ms-mcp] Authenticated (token valid, could not fetch profile).\n");
  }
}

export async function logout(): Promise<void> {
  const { client, cachePath } = await createMsalClient();
  await client.logout();

  try {
    await unlink(cachePath);
    console.log(`\n[ms-mcp] Logged out. Cache file deleted: ${cachePath}\n`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("\n[ms-mcp] Logged out. No cache file to delete.\n");
    } else {
      throw err;
    }
  }
}

export function showHelp(): void {
  console.log(`
Usage: pommer-m365-mcp-auth <command>

Commands:
  login   Authenticate via Device Code Flow (interactive)
  status  Check current authentication status
  logout  Clear cached tokens and log out

Examples:
  pnpm auth login
  npx pommer-m365-mcp-auth login
`);
}

// CLI dispatch — only runs when executed directly, not when imported for testing
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const command = process.argv[2];

  switch (command) {
    case "login":
      login().catch((error) => {
        console.error("\n[ms-mcp] Login failed:", error instanceof Error ? error.message : error);
        process.exit(1);
      });
      break;
    case "status":
      status().catch((error) => {
        console.error(
          "\n[ms-mcp] Status check failed:",
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      });
      break;
    case "logout":
      logout().catch((error) => {
        console.error("\n[ms-mcp] Logout failed:", error instanceof Error ? error.message : error);
        process.exit(1);
      });
      break;
    default:
      showHelp();
      break;
  }
}
