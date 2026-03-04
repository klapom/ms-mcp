#!/usr/bin/env node --import tsx/esm
/**
 * E2E test script for User & Directory tools (Sprint 7.1)
 * Tests against real Microsoft Graph API
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "../src/auth/graph-client.js";
import { MsalClient } from "../src/auth/msal-client.js";
import { createCachePlugin } from "../src/auth/token-cache.js";
import { loadConfig } from "../src/config.js";
import { resolveTildePath } from "../src/utils/path.js";

async function main() {
  console.log("🧪 E2E Test: User & Directory Tools (Sprint 7.1)\n");

  const config = loadConfig();
  const cachePath = resolveTildePath(config.cache.tokenCachePath);
  const cachePlugin = await createCachePlugin(cachePath);
  const msalClient = new MsalClient(
    config.azure.tenantId,
    config.azure.clientId,
    undefined,
    cachePlugin,
  );

  const graphClient = getGraphClient(msalClient);

  // Test 1: Get my profile
  console.log("1️⃣  Testing get_my_profile...");
  try {
    const profile = await graphClient
      .api("/me")
      .select("id,displayName,mail,userPrincipalName,jobTitle,department")
      .get();
    console.log(`   ✅ Success: ${profile.displayName} (${profile.mail})`);
    console.log(`      Job: ${profile.jobTitle || "N/A"}, Dept: ${profile.department || "N/A"}\n`);
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 2: Search users
  console.log("2️⃣  Testing search_users...");
  try {
    const response = await graphClient
      .api("/users")
      .header("ConsistencyLevel", "eventual")
      .search('"displayName:Pommer" OR "mail:pommer"')
      .select("id,displayName,mail")
      .top(3)
      .query({ $count: "true" })
      .get();
    console.log(`   ✅ Success: Found ${response["@odata.count"] || 0} users`);
    if (response.value && response.value.length > 0) {
      response.value.slice(0, 3).forEach((u: any) => {
        console.log(`      - ${u.displayName} (${u.mail || "no email"})`);
      });
    }
    console.log();
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 3: Get specific user (using first search result or fallback)
  console.log("3️⃣  Testing get_user...");
  try {
    // Get first user from directory
    const users = await graphClient.api("/users").top(1).get();
    if (users.value && users.value.length > 0) {
      const userId = users.value[0].id;
      const user = await graphClient
        .api(`/users/${userId}`)
        .select("id,displayName,mail,jobTitle,department")
        .get();
      console.log(`   ✅ Success: ${user.displayName} (${user.mail})`);
      console.log(`      ID: ${user.id}\n`);
    } else {
      console.log("   ⚠️  No users found in directory\n");
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 4: Get manager
  console.log("4️⃣  Testing get_manager...");
  try {
    const manager = await graphClient
      .api("/me/manager")
      .select("id,displayName,mail,jobTitle")
      .get();
    console.log(`   ✅ Success: ${manager.displayName} (${manager.mail})`);
    console.log(`      Title: ${manager.jobTitle || "N/A"}\n`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not exist")) {
      console.log("   ℹ️  No manager set for current user\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : error);
    }
  }

  // Test 5: List direct reports
  console.log("5️⃣  Testing list_direct_reports...");
  try {
    const reports = await graphClient
      .api("/me/directReports")
      .select("id,displayName,mail,jobTitle")
      .top(5)
      .get();
    console.log(`   ✅ Success: Found ${reports.value.length} direct reports`);
    if (reports.value && reports.value.length > 0) {
      reports.value.forEach((r: any) => {
        console.log(`      - ${r.displayName} (${r.jobTitle || "N/A"})`);
      });
    }
    console.log();
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 6: List user groups
  console.log("6️⃣  Testing list_user_groups...");
  try {
    const groups = await graphClient
      .api("/me/memberOf")
      .select("id,displayName,mail,mailEnabled,securityEnabled")
      .top(5)
      .get();
    console.log(`   ✅ Success: Found ${groups.value.length} group memberships`);
    if (groups.value && groups.value.length > 0) {
      groups.value.forEach((g: any) => {
        const types = [];
        if (g.mailEnabled) types.push("Mail");
        if (g.securityEnabled) types.push("Security");
        console.log(`      - ${g.displayName} [${types.join(", ")}]`);
      });
    }
    console.log();
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 7: Get user photo
  console.log("7️⃣  Testing get_user_photo...");
  try {
    const photoBuffer = await graphClient.api("/me/photo/$value").get();
    if (photoBuffer) {
      const buffer = Buffer.from(photoBuffer);
      console.log(`   ✅ Success: Photo retrieved (${buffer.length} bytes)`);
      console.log("      Format: JPEG (assumed)\n");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("ImageNotFound")) {
      console.log("   ℹ️  No photo set for current user\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : error);
    }
  }

  console.log("✅ E2E Tests completed!");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
