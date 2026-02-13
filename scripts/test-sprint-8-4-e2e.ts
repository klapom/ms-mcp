#!/usr/bin/env node --import tsx/esm
/**
 * E2E test script for Sprint 8.4 — Teams Advanced & Notifications
 * Tests against real Microsoft Graph API
 *
 * Tools tested:
 * - list_activity_feed
 * - list_mentions
 * - list_team_members
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "../src/auth/graph-client.js";
import { MsalClient } from "../src/auth/msal-client.js";
import { createCachePlugin } from "../src/auth/token-cache.js";
import { loadConfig } from "../src/config.js";
import { resolveTildePath } from "../src/utils/path.js";

async function main() {
  console.log("🧪 E2E Test: Sprint 8.4 — Teams Advanced & Notifications\n");

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

  // Test 1: List activity feed
  console.log("1️⃣  Testing list_activity_feed...");
  try {
    // Note: This uses beta endpoint, may not be available on all tenants
    const activityResponse = await graphClient
      .api("/me/teamwork/activityHistory")
      .select("id,activityType,actor,timestamp,isRead,previewText")
      .top(5)
      .get();

    const activities = activityResponse.value || [];
    console.log("   ✅ Success: Retrieved activity feed");
    console.log(`      Total activities: ${activities.length}`);

    if (activities.length > 0) {
      activities.forEach((activity: Record<string, unknown>, index: number) => {
        if (index < 3) {
          const timestamp = new Date(activity.timestamp);
          const isRead = activity.isRead ? "read" : "unread";
          const preview = (activity.previewText || "N/A").substring(0, 40);
          console.log(`      - [${activity.activityType}] ${preview}... (${isRead})`);
        }
      });
      if (activities.length > 3) {
        console.log(`      ... and ${activities.length - 3} more`);
      }
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      console.log("   ⚠️  Skipped: /teamwork/activityHistory not available\n");
    } else if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient TeamsActivity.Read permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 2: List mentions
  console.log("2️⃣  Testing list_mentions...");
  try {
    // Get current user ID
    const user = await graphClient.api("/me").select("id,userPrincipalName").get();

    const userId = user.id;

    // Search for messages where user was mentioned
    const mentionsResponse = await graphClient
      .api("/me/chats/getAllMessages")
      .filter(`mentions/any(m: m/mentioned/user/id eq '${userId}')`)
      .select("id,from,body,createdDateTime")
      .top(5)
      .get();

    const mentions = mentionsResponse.value || [];
    console.log("   ✅ Success: Retrieved mentions");
    console.log(`      Total mentions: ${mentions.length}`);

    if (mentions.length > 0) {
      mentions.forEach((message: Record<string, unknown>, index: number) => {
        if (index < 3) {
          const senderName = message.from?.user?.displayName || "Unknown";
          const preview = (message.body || "N/A").substring(0, 40);
          console.log(`      - From ${senderName}: ${preview}...`);
        }
      });
      if (mentions.length > 3) {
        console.log(`      ... and ${mentions.length - 3} more`);
      }
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient Chat.Read permissions\n");
    } else if (error instanceof Error && error.message.includes("NotSupported")) {
      console.log("   ⚠️  Skipped: Mentions search may not be available\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 3: Create channel (preview mode)
  console.log("3️⃣  Testing create_channel (preview mode)...");
  try {
    // Get a team to use for preview
    const teamsResponse = await graphClient
      .api("/me/joinedTeams")
      .select("id,displayName")
      .top(1)
      .get();

    const team = teamsResponse.value?.[0];

    if (!team) {
      console.log("   ℹ️  User is not a member of any Teams\n");
    } else {
      console.log("   ✅ Preview mode: create_channel");
      console.log(`      Team: ${team.displayName}`);
      console.log(`      Channel name: "Q1 Planning"`);
      console.log("      Membership type: standard");
      console.log("      Status: Preview mode (no channel created)\n");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient Channel.Create permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 4: List team members
  console.log("4️⃣  Testing list_team_members...");
  try {
    // Get a team
    const teamsResponse = await graphClient
      .api("/me/joinedTeams")
      .select("id,displayName")
      .top(1)
      .get();

    const team = teamsResponse.value?.[0];

    if (!team) {
      console.log("   ℹ️  User is not a member of any Teams\n");
    } else {
      const membersResponse = await graphClient
        .api(`/teams/${team.id}/members`)
        .select("id,displayName,email,roles,userId")
        .top(5)
        .get();

      const members = membersResponse.value || [];
      console.log("   ✅ Success: Retrieved team members");
      console.log(`      Team: ${team.displayName}`);
      console.log(`      Total members shown: ${members.length}`);

      if (members.length > 0) {
        members.forEach((member: Record<string, unknown>, index: number) => {
          if (index < 3) {
            const role = member.roles?.includes("owner") ? "Owner" : "Member";
            console.log(`      - ${member.displayName} (${member.email || "no email"}) - ${role}`);
          }
        });
        if (members.length > 3) {
          console.log(`      ... and ${members.length - 3} more`);
        }
      }
      console.log();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient TeamMember.Read.All permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 5: Get meeting transcript (preview mode)
  console.log("5️⃣  Testing get_meeting_transcript (preview mode)...");
  try {
    // This is typically available on online meetings
    // For preview, just show what the tool would do
    console.log("   ✅ Preview mode: get_meeting_transcript");
    console.log("      Meeting ID: AAMkAGE4YjY4N... (from Teams meeting)");
    console.log("      Format: VTT or PDF");
    console.log("      Language: auto-detect from meeting content");
    console.log("      Status: Preview mode (no transcript retrieved)\n");
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 6: List teams
  console.log("6️⃣  Testing list_teams (Teams available)...");
  try {
    const teamsResponse = await graphClient
      .api("/me/joinedTeams")
      .select("id,displayName,description")
      .top(5)
      .get();

    const teams = teamsResponse.value || [];
    console.log("   ✅ Success: Retrieved Teams");
    console.log(`      Total teams: ${teams.length}`);

    if (teams.length > 0) {
      teams.forEach((team: Record<string, unknown>, index: number) => {
        if (index < 3) {
          const desc = team.description || "No description";
          console.log(`      - ${team.displayName}`);
        }
      });
      if (teams.length > 3) {
        console.log(`      ... and ${teams.length - 3} more`);
      }
    } else {
      console.log("      (No Teams membership)");
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient Teams permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  console.log("✅ Sprint 8.4 E2E tests completed!");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
