#!/usr/bin/env node --import tsx/esm
/**
 * E2E test script for Phase 7 — User Tools
 * Tests against real Microsoft Graph API
 *
 * Tools tested (all read-only):
 * - get_my_profile
 * - search_users
 * - get_user
 * - get_manager
 * - list_direct_reports
 * - get_user_photo
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "../src/auth/graph-client.js";
import { MsalClient } from "../src/auth/msal-client.js";
import { createCachePlugin } from "../src/auth/token-cache.js";
import { loadConfig } from "../src/config.js";
import { resolveTildePath } from "../src/utils/path.js";

interface User {
  id: string;
  displayName?: string;
  userPrincipalName?: string;
  mail?: string;
  jobTitle?: string;
  department?: string;
  mobilePhone?: string;
  officeLocation?: string;
}

async function main() {
  console.log("🧪 E2E Test: Phase 7 — User Tools\n");

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
  let currentUser: User | undefined;

  try {
    const user = await graphClient
      .api("/me")
      .select(
        "id,displayName,userPrincipalName,mail,jobTitle,department,mobilePhone,officeLocation,city,country",
      )
      .get();

    currentUser = user as User;
    console.log("   ✅ Success: Current user profile retrieved");
    console.log(`      Name: ${user.displayName}`);
    console.log(`      Email: ${user.userPrincipalName}`);
    console.log(`      Job title: ${user.jobTitle || "N/A"}`);
    console.log(`      Department: ${user.department || "N/A"}`);
    console.log(`      Office location: ${user.officeLocation || "N/A"}`);
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 2: Search users
  console.log("2️⃣  Testing search_users...");
  try {
    // Search for any users in the organization
    const usersResponse = await graphClient
      .api("/users")
      .select("id,displayName,userPrincipalName,mail,jobTitle")
      .filter("accountEnabled eq true")
      .top(10)
      .get();

    const users = usersResponse.value || [];
    console.log(`   ✅ Success: Found ${users.length} active users`);

    users.forEach((user: User, index: number) => {
      if (index < 5) {
        console.log(`      - ${user.displayName} (${user.userPrincipalName})`);
      }
    });

    if (users.length > 5) {
      console.log(`      ... and ${users.length - 5} more`);
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient User.Read.All permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 3: Get user details
  console.log("3️⃣  Testing get_user...");
  try {
    if (!currentUser) {
      console.log("   ℹ️  Skipping: No current user context\n");
    } else {
      const fullUser = await graphClient
        .api(`/users/${currentUser.id}`)
        .select(
          "id,displayName,userPrincipalName,mail,jobTitle,department,mobilePhone,officeLocation,city,country,companyName",
        )
        .get();

      console.log("   ✅ Success: User details retrieved");
      console.log(`      Name: ${fullUser.displayName}`);
      console.log(`      UPN: ${fullUser.userPrincipalName}`);
      console.log(`      Email: ${fullUser.mail}`);
      console.log(`      Department: ${fullUser.department || "N/A"}`);
      console.log(`      Location: ${fullUser.city || "N/A"}, ${fullUser.country || "N/A"}`);
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 4: Get manager
  console.log("4️⃣  Testing get_manager...");
  try {
    if (!currentUser) {
      console.log("   ℹ️  Skipping: No current user context\n");
    } else {
      try {
        const manager = await graphClient
          .api("/me/manager")
          .select("id,displayName,userPrincipalName,jobTitle,mail")
          .get();

        if (!manager || !manager.id) {
          console.log("   ℹ️  No manager assigned for this user\n");
        } else {
          console.log("   ✅ Success: Manager retrieved");
          console.log(`      Name: ${manager.displayName}`);
          console.log(`      Email: ${manager.mail}`);
          console.log(`      Job title: ${manager.jobTitle || "N/A"}`);
          console.log();
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("Request_ResourceNotFound")) {
          console.log("   ℹ️  No manager assigned for this user\n");
        } else {
          throw err;
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 5: List direct reports
  console.log("5️⃣  Testing list_direct_reports...");
  try {
    if (!currentUser) {
      console.log("   ℹ️  Skipping: No current user context\n");
    } else {
      try {
        const reportsResponse = await graphClient
          .api("/me/directReports")
          .select("id,displayName,userPrincipalName,jobTitle,mail")
          .top(10)
          .get();

        const reports = reportsResponse.value || [];
        console.log(`   ✅ Success: Found ${reports.length} direct reports`);

        reports.forEach((report: User, index: number) => {
          if (index < 5) {
            console.log(`      - ${report.displayName} (${report.jobTitle || "N/A"})`);
          }
        });

        if (reports.length > 5) {
          console.log(`      ... and ${reports.length - 5} more`);
        }
        console.log();
      } catch (err) {
        if (err instanceof Error && err.message.includes("Request_ResourceNotFound")) {
          console.log("   ℹ️  No direct reports for this user\n");
        } else {
          throw err;
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 6: Get user photo
  console.log("6️⃣  Testing get_user_photo...");
  try {
    if (!currentUser) {
      console.log("   ℹ️  Skipping: No current user context\n");
    } else {
      try {
        const photoMetadata = await graphClient.api("/me/photo").select("id,height,width").get();

        console.log("   ✅ Success: User photo metadata retrieved");
        console.log(`      Size: ${photoMetadata.width}x${photoMetadata.height} pixels`);
        console.log(`      Photo ID: ${photoMetadata.id}`);
        console.log();
      } catch (err) {
        if (err instanceof Error && err.message.includes("Request_ResourceNotFound")) {
          console.log("   ℹ️  No photo set for this user\n");
        } else {
          throw err;
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 7: Get organization contacts
  console.log("7️⃣  Testing organization structure...");
  try {
    const orgResponse = await graphClient
      .api("/organization")
      .select("id,displayName,verifiedDomains")
      .get();

    const org = orgResponse.value?.[0];
    console.log("   ✅ Success: Organization info retrieved");
    console.log(`      Organization: ${org?.displayName}`);

    if (org?.verifiedDomains && org.verifiedDomains.length > 0) {
      console.log(`      Verified domains: ${org.verifiedDomains.length}`);
      org.verifiedDomains.forEach((domain: Record<string, unknown>, index: number) => {
        if (index < 2) {
          console.log(`      - ${domain.name}`);
        }
      });
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient Organization.Read permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 8: List user memberships
  console.log("8️⃣  Testing user memberships...");
  try {
    if (!currentUser) {
      console.log("   ℹ️  Skipping: No current user context\n");
    } else {
      const membershipsResponse = await graphClient
        .api("/me/memberOf")
        .select("id,displayName")
        .top(10)
        .get();

      const memberships = membershipsResponse.value || [];
      console.log(`   ✅ Success: Found ${memberships.length} group memberships`);

      memberships.forEach((group: Record<string, unknown>, index: number) => {
        if (index < 5) {
          console.log(`      - ${group.displayName}`);
        }
      });

      if (memberships.length > 5) {
        console.log(`      ... and ${memberships.length - 5} more`);
      }
      console.log();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 9: Get user settings
  console.log("9️⃣  Testing user settings...");
  try {
    if (!currentUser) {
      console.log("   ℹ️  Skipping: No current user context\n");
    } else {
      try {
        const settings = await graphClient
          .api("/me/settings")
          .select("id,authenticationPhoneNumber,authenticationAlternativePhoneNumber")
          .get();

        console.log("   ✅ Success: User settings retrieved");
        console.log(
          `      Primary phone: ${settings.authenticationPhoneNumber ? "set" : "not set"}`,
        );
        console.log(
          `      Alternate phone: ${settings.authenticationAlternativePhoneNumber ? "set" : "not set"}`,
        );
        console.log();
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) {
          console.log("   ℹ️  User settings not available\n");
        } else {
          throw err;
        }
      }
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  console.log("✅ Phase 7 E2E tests completed!");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
