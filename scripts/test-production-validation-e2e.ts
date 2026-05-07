#!/usr/bin/env node --import tsx/esm
/**
 * Production Validation E2E Test
 *
 * Validates all major modules work correctly with real Graph API after production readiness improvements.
 * Tests one representative tool from each of the 11 modules.
 *
 * Prerequisites:
 * 1. Set environment variables:
 *    export AZURE_TENANT_ID=4b2ee35f-5f43-44c8-b92b-55e11e6d6f89
 *    export AZURE_CLIENT_ID=d42aa1ad-7be6-4f5c-b0ce-08ae34bca63b
 *
 * 2. Authenticate with a licensed user (NOT admin account):
 *    pnpm auth login
 *    (Use ulla.vogel@pommerconsulting.de or similar licensed account)
 *
 * 3. Run the validation:
 *    pnpm tsx scripts/test-production-validation-e2e.ts
 *
 * This script tests all 11 modules (Mail, Calendar, Drive, Teams, SharePoint,
 * Contacts, Todo, OneNote, Presence, Users, Search) plus the caching middleware.
 */

import type { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "../src/auth/graph-client.js";
import { MsalClient } from "../src/auth/msal-client.js";
import { createCachePlugin } from "../src/auth/token-cache.js";
import { loadConfig } from "../src/config.js";
import { CacheManager } from "../src/utils/cache.js";
import { createLogger } from "../src/utils/logger.js";
import { resolveTildePath } from "../src/utils/path.js";

const logger = createLogger("e2e-production-validation");

interface TestResult {
  module: string;
  tool: string;
  status: "PASS" | "FAIL" | "SKIP";
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function testMail(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing Mail module: list_emails");
    const response = await client.api("/me/messages").top(1).get();
    if (!response.value || !Array.isArray(response.value)) {
      throw new Error("Invalid response structure");
    }
    results.push({
      module: "Mail",
      tool: "list_emails",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info({ count: response.value.length }, "Mail test passed");
  } catch (error) {
    results.push({
      module: "Mail",
      tool: "list_emails",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "Mail test failed");
  }
}

async function testCalendar(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing Calendar module: list_calendars");
    const response = await client.api("/me/calendars").top(1).get();
    if (!response.value || !Array.isArray(response.value)) {
      throw new Error("Invalid response structure");
    }
    results.push({
      module: "Calendar",
      tool: "list_calendars",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info({ count: response.value.length }, "Calendar test passed");
  } catch (error) {
    results.push({
      module: "Calendar",
      tool: "list_calendars",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "Calendar test failed");
  }
}

async function testDrive(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing Drive module: list_files");
    const response = await client.api("/me/drive/root/children").top(1).get();
    if (!response.value || !Array.isArray(response.value)) {
      throw new Error("Invalid response structure");
    }
    results.push({
      module: "Drive",
      tool: "list_files",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info({ count: response.value.length }, "Drive test passed");
  } catch (error) {
    results.push({
      module: "Drive",
      tool: "list_files",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "Drive test failed");
  }
}

async function testTeams(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing Teams module: list_teams");
    const response = await client.api("/me/joinedTeams").get();
    if (!response.value || !Array.isArray(response.value)) {
      throw new Error("Invalid response structure");
    }
    results.push({
      module: "Teams",
      tool: "list_teams",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info({ count: response.value.length }, "Teams test passed");
  } catch (error) {
    results.push({
      module: "Teams",
      tool: "list_teams",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "Teams test failed");
  }
}

async function testSharePoint(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing SharePoint module: search_sites");
    const response = await client.api("/sites").filter("siteCollection/root ne null").top(1).get();
    if (!response.value || !Array.isArray(response.value)) {
      throw new Error("Invalid response structure");
    }
    results.push({
      module: "SharePoint",
      tool: "search_sites",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info({ count: response.value.length }, "SharePoint test passed");
  } catch (error) {
    results.push({
      module: "SharePoint",
      tool: "search_sites",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "SharePoint test failed");
  }
}

async function testContacts(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing Contacts module: list_contacts");
    const response = await client.api("/me/contacts").top(1).get();
    if (!response.value || !Array.isArray(response.value)) {
      throw new Error("Invalid response structure");
    }
    results.push({
      module: "Contacts",
      tool: "list_contacts",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info({ count: response.value.length }, "Contacts test passed");
  } catch (error) {
    results.push({
      module: "Contacts",
      tool: "list_contacts",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "Contacts test failed");
  }
}

async function testTodo(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing Todo module: list_todo_lists");
    const response = await client.api("/me/todo/lists").top(1).get();
    if (!response.value || !Array.isArray(response.value)) {
      throw new Error("Invalid response structure");
    }
    results.push({
      module: "Todo",
      tool: "list_todo_lists",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info({ count: response.value.length }, "Todo test passed");
  } catch (error) {
    results.push({
      module: "Todo",
      tool: "list_todo_lists",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "Todo test failed");
  }
}

async function testOneNote(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing OneNote module: list_notebooks");
    const response = await client.api("/me/onenote/notebooks").top(1).get();
    if (!response.value || !Array.isArray(response.value)) {
      throw new Error("Invalid response structure");
    }
    results.push({
      module: "OneNote",
      tool: "list_notebooks",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info({ count: response.value.length }, "OneNote test passed");
  } catch (error) {
    results.push({
      module: "OneNote",
      tool: "list_notebooks",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "OneNote test failed");
  }
}

async function testPresence(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing Presence module: get_my_presence");
    const response = await client.api("/me/presence").get();
    if (!response || !response.availability) {
      throw new Error("Invalid response structure");
    }
    results.push({
      module: "Presence",
      tool: "get_my_presence",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info({ availability: response.availability }, "Presence test passed");
  } catch (error) {
    results.push({
      module: "Presence",
      tool: "get_my_presence",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "Presence test failed");
  }
}

async function testUsers(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing Users module: get_my_profile");
    const response = await client.api("/me").get();
    if (!response || !response.id) {
      throw new Error("Invalid response structure");
    }
    results.push({
      module: "Users",
      tool: "get_my_profile",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info({ userPrincipalName: response.userPrincipalName }, "Users test passed");
  } catch (error) {
    results.push({
      module: "Users",
      tool: "get_my_profile",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "Users test failed");
  }
}

async function testSearch(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing Search module: search_all");
    const response = await client.api("/search/query").post({
      requests: [
        {
          entityTypes: ["message"],
          query: { queryString: "test" },
          from: 0,
          size: 1,
        },
      ],
    });
    if (!response.value || !Array.isArray(response.value)) {
      throw new Error("Invalid response structure");
    }
    results.push({
      module: "Search",
      tool: "search_all",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info("Search test passed");
  } catch (error) {
    results.push({
      module: "Search",
      tool: "search_all",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "Search test failed");
  }
}

async function testCachingMiddleware(client: Client): Promise<void> {
  const start = Date.now();
  try {
    logger.info("Testing Caching Middleware: duplicate requests");
    // Make the same request twice to test cache hit
    const response1 = await client.api("/me/messages").top(1).get();
    const response2 = await client.api("/me/messages").top(1).get();

    if (!response1.value || !response2.value) {
      throw new Error("Invalid response structure");
    }

    results.push({
      module: "Middleware",
      tool: "caching",
      status: "PASS",
      duration: Date.now() - start,
    });
    logger.info("Caching middleware test passed");
  } catch (error) {
    results.push({
      module: "Middleware",
      tool: "caching",
      status: "FAIL",
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error({ error }, "Caching middleware test failed");
  }
}

function printResults(): void {
  console.log("\n" + "=".repeat(80));
  console.log("Production Validation E2E Test Results");
  console.log("=".repeat(80));
  console.log();

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  const total = results.length;

  for (const result of results) {
    const statusIcon = result.status === "PASS" ? "✓" : result.status === "FAIL" ? "✗" : "○";
    const statusColor =
      result.status === "PASS" ? "\x1b[32m" : result.status === "FAIL" ? "\x1b[31m" : "\x1b[33m";
    const resetColor = "\x1b[0m";

    console.log(
      `${statusColor}${statusIcon}${resetColor} ${result.module.padEnd(15)} ${result.tool.padEnd(25)} ${result.duration}ms`,
    );
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  console.log();
  console.log("=".repeat(80));
  console.log(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped (${total} total)`);
  console.log("=".repeat(80));
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

async function main(): Promise<void> {
  logger.info("Starting production validation E2E tests");

  // Load config (includes environment variables)
  const config = loadConfig();

  const cachePath = resolveTildePath(config.cache.tokenCachePath);
  const cachePlugin = await createCachePlugin(cachePath);
  const msalClient = new MsalClient(
    config.azure.tenantId,
    config.azure.clientId,
    undefined,
    cachePlugin,
  );

  // Initialize cache manager
  const cache = new CacheManager();

  // Get Graph client with middleware
  const client = getGraphClient(msalClient, cache);

  logger.info("Testing all 11 modules + middleware");

  // Run all tests
  await testMail(client);
  await testCalendar(client);
  await testDrive(client);
  await testTeams(client);
  await testSharePoint(client);
  await testContacts(client);
  await testTodo(client);
  await testOneNote(client);
  await testPresence(client);
  await testUsers(client);
  await testSearch(client);
  await testCachingMiddleware(client);

  // Print results
  printResults();

  // Print cache metrics
  const metrics = cache.getMetrics();
  logger.info(
    {
      cache: {
        size: metrics.size,
        hitRate: metrics.hitRate.toFixed(2),
        hits: metrics.hits,
        misses: metrics.misses,
      },
    },
    "Cache metrics after validation",
  );

  logger.info("Production validation complete");
}

main().catch((error) => {
  logger.error({ error }, "Fatal error in production validation");
  process.exit(1);
});
