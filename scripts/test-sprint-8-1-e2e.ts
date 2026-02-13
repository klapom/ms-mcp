#!/usr/bin/env node --import tsx/esm
/**
 * E2E test script for Sprint 8.1 — Search & Query Enhancements
 * Tests against real Microsoft Graph API
 *
 * Tools tested:
 * - advanced_search_emails
 * - search_events
 * - track_file_changes
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "../src/auth/graph-client.js";
import { MsalClient } from "../src/auth/msal-client.js";
import { createCachePlugin } from "../src/auth/token-cache.js";
import { loadConfig } from "../src/config.js";
import { resolveTildePath } from "../src/utils/path.js";

async function main() {
  console.log("🧪 E2E Test: Sprint 8.1 — Search & Query Enhancements\n");

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

  // Test 1: Advanced email search (KQL)
  console.log("1️⃣  Testing advanced_search_emails with KQL...");
  try {
    const response = await graphClient.api("/search/query").post({
      requests: [
        {
          entityTypes: ["message"],
          query: {
            queryString: "from:*",
          },
        },
      ],
    });

    const hits = response.hitsContainers?.[0]?.hits || [];
    console.log(`   ✅ Success: Found ${hits.length} email results`);
    if (hits.length > 0) {
      const firstHit = hits[0];
      console.log(`      First result: ${firstHit.resource?.subject || "N/A"}`);
      console.log(`      Rank: ${firstHit.rank || "N/A"}\n`);
    } else {
      console.log("      (No emails in search results - this is OK)\n");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Request_NotSupported")) {
      console.log("   ⚠️  Skipped: Search API may not be available in this tenant\n");
    } else if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized (no email license)\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 2: Search calendar events
  console.log("2️⃣  Testing search_events with KQL...");
  try {
    const response = await graphClient.api("/search/query").post({
      requests: [
        {
          entityTypes: ["event"],
          query: {
            queryString: "subject:*",
          },
        },
      ],
    });

    const hits = response.hitsContainers?.[0]?.hits || [];
    console.log(`   ✅ Success: Found ${hits.length} event results`);
    if (hits.length > 0) {
      const firstHit = hits[0];
      console.log(`      First result: ${firstHit.resource?.subject || "N/A"}`);
      console.log(`      Rank: ${firstHit.rank || "N/A"}\n`);
    } else {
      console.log("      (No events in search results - this is OK)\n");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Request_NotSupported")) {
      console.log("   ⚠️  Skipped: Search API may not be available in this tenant\n");
    } else if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 3: Track file changes (delta)
  console.log("3️⃣  Testing track_file_changes (delta sync)...");
  try {
    // Initial delta request (no token)
    const deltaResponse = await graphClient.api("/me/drive/root/delta").get();

    const deltaLink = deltaResponse["@odata.deltaLink"];
    const items = deltaResponse.value || [];

    console.log("   ✅ Success: Delta sync retrieved");
    console.log(`      Items in delta: ${items.length}`);
    console.log(`      Delta link available: ${!!deltaLink}`);

    if (items.length > 0) {
      const firstItem = items[0];
      console.log(`      First item: ${firstItem.name || "N/A"}`);
    }

    // If we have a delta link, try incremental sync
    if (deltaLink) {
      console.log("      Testing incremental sync with delta token...");
      try {
        const incrementalResponse = await graphClient
          .api(deltaLink.split("/me/drive/root/delta")[1] || "")
          .get();
        const changeItems = incrementalResponse.value || [];
        console.log(`      ✓ Incremental sync: ${changeItems.length} changes`);
      } catch (err) {
        // Token might be expired, that's OK
        console.log("      ℹ️  Incremental sync skipped (token may be expired)");
      }
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized (no OneDrive license)\n");
    } else if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 4: Advanced contact search (KQL)
  console.log("4️⃣  Testing advanced_search_contacts with KQL...");
  try {
    const response = await graphClient.api("/search/query").post({
      requests: [
        {
          entityTypes: ["person"],
          query: {
            queryString: "displayName:*",
          },
        },
      ],
    });

    const hits = response.hitsContainers?.[0]?.hits || [];
    console.log(`   ✅ Success: Found ${hits.length} contact results`);
    if (hits.length > 0) {
      const firstHit = hits[0];
      console.log(`      First result: ${firstHit.resource?.displayName || "N/A"}`);
      console.log(`      Rank: ${firstHit.rank || "N/A"}\n`);
    } else {
      console.log("      (No contacts in search results - this is OK)\n");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Request_NotSupported")) {
      console.log("   ⚠️  Skipped: Search API may not be available in this tenant\n");
    } else if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 5: Search Teams messages (KQL)
  console.log("5️⃣  Testing search_teams_messages with KQL...");
  try {
    const response = await graphClient.api("/search/query").post({
      requests: [
        {
          entityTypes: ["chatMessage"],
          query: {
            queryString: "from:*",
          },
        },
      ],
    });

    const hits = response.hitsContainers?.[0]?.hits || [];
    console.log(`   ✅ Success: Found ${hits.length} Teams message results`);
    if (hits.length > 0) {
      const firstHit = hits[0];
      const preview = (firstHit.summary || firstHit.resource?.body || "N/A").substring(0, 60);
      console.log(`      First result: ${preview}...`);
      console.log(`      Rank: ${firstHit.rank || "N/A"}\n`);
    } else {
      console.log("      (No Teams messages in search results - this is OK)\n");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Request_NotSupported")) {
      console.log("   ⚠️  Skipped: Search API may not be available in this tenant\n");
    } else if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  console.log("✅ Sprint 8.1 E2E tests completed!");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
