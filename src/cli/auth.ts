#!/usr/bin/env node

/**
 * Auth CLI for pommer-m365-mcp.
 *
 * Provides interactive authentication management in the terminal,
 * where Device Code Flow can actually display the login URL.
 *
 * Usage:
 *   npx pommer-m365-mcp auth login   — Authenticate via Device Code Flow
 *   npx pommer-m365-mcp auth status  — Check current auth status
 *   npx pommer-m365-mcp auth logout  — Clear cached tokens
 */

import { unlink } from "node:fs/promises";
import { MsalClient } from "../auth/msal-client.js";
import { createCachePlugin } from "../auth/token-cache.js";
import { loadConfig } from "../config.js";
import { resolveTildePath } from "../utils/path.js";

interface UserInfo {
  displayName: string;
  mail: string;
}

async function fetchUserInfo(token: string): Promise<UserInfo> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Graph /me failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as UserInfo;
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

async function login(): Promise<void> {
  console.log("\n[ms-mcp] Authenticating via Device Code Flow...\n");
  const { client } = await createMsalClient();
  const token = await client.getAccessToken();

  try {
    const user = await fetchUserInfo(token);
    console.log(`\nAuthenticated as: ${user.displayName} (${user.mail})`);
  } catch {
    console.log("\nAuthenticated successfully (could not fetch user profile).");
  }

  console.log("Token cached. The MCP server can now start without interactive auth.\n");
}

async function status(): Promise<void> {
  const { client } = await createMsalClient();
  const token = await client.getAccessTokenSilentOnly();

  if (!token) {
    console.log("\n[ms-mcp] Not authenticated.");
    console.log("Run: npx pommer-m365-mcp auth login\n");
    process.exitCode = 1;
    return;
  }

  try {
    const user = await fetchUserInfo(token);
    console.log(`\n[ms-mcp] Authenticated as: ${user.displayName} (${user.mail})\n`);
  } catch {
    console.log("\n[ms-mcp] Authenticated (token valid, could not fetch profile).\n");
  }
}

async function logout(): Promise<void> {
  const { client, cachePath } = await createMsalClient();
  await client.logout();

  try {
    await unlink(cachePath);
    console.log(`\n[ms-mcp] Logged out. Cache file deleted: ${cachePath}\n`);
  } catch {
    console.log("\n[ms-mcp] Logged out. No cache file to delete.\n");
  }
}

function showHelp(): void {
  console.log(`
Usage: pommer-m365-mcp auth <command>

Commands:
  login   Authenticate via Device Code Flow (interactive)
  status  Check current authentication status
  logout  Clear cached tokens and log out

Examples:
  npx pommer-m365-mcp auth login
  pnpm auth login
`);
}

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
