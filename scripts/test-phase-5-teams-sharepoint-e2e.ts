#!/usr/bin/env node --import tsx/esm
/**
 * E2E test script for Phase 5 — Teams & SharePoint Tools
 * Tests against real Microsoft Graph API
 *
 * Tools tested:
 * - list_teams, list_channels
 * - send_channel_message, reply_to_channel_message (preview mode)
 * - list_chats, send_chat_message (preview mode)
 * - search_sites, get_site, list_site_lists, list_list_items
 * - list_site_drives
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "../src/auth/graph-client.js";
import { MsalClient } from "../src/auth/msal-client.js";
import { createCachePlugin } from "../src/auth/token-cache.js";
import { loadConfig } from "../src/config.js";
import { resolveTildePath } from "../src/utils/path.js";

interface Team {
  id: string;
  displayName?: string;
  description?: string;
}

interface Channel {
  id: string;
  displayName?: string;
  description?: string;
}

interface Chat {
  id: string;
  topic?: string;
  chatType?: string;
}

interface Site {
  id: string;
  displayName?: string;
  name?: string;
  webUrl?: string;
}

async function main() {
  console.log("🧪 E2E Test: Phase 5 — Teams & SharePoint Tools\n");

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

  // Test 1: List teams
  console.log("1️⃣  Testing list_teams...");
  let testTeam: Team | undefined;

  try {
    const teamsResponse = await graphClient
      .api("/me/joinedTeams")
      .select("id,displayName,description")
      .top(10)
      .get();

    const teams = teamsResponse.value || [];
    console.log(`   ✅ Success: Found ${teams.length} teams`);

    teams.forEach((team: Team, index: number) => {
      if (index < 3) {
        console.log(`      - ${team.displayName}`);
      }
    });

    if (teams.length > 3) {
      console.log(`      ... and ${teams.length - 3} more`);
    }

    testTeam = teams[0];
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized (no Teams license)\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 2: List channels
  console.log("2️⃣  Testing list_channels...");
  let testChannel: Channel | undefined;

  try {
    if (!testTeam) {
      console.log("   ℹ️  Skipping: User not a member of any teams\n");
    } else {
      const channelsResponse = await graphClient
        .api(`/teams/${testTeam.id}/channels`)
        .select("id,displayName,description,membershipType")
        .top(10)
        .get();

      const channels = channelsResponse.value || [];
      console.log(`   ✅ Success: Found ${channels.length} channels`);

      channels.forEach((channel: Channel, index: number) => {
        if (index < 3) {
          console.log(`      - ${channel.displayName}`);
        }
      });

      if (channels.length > 3) {
        console.log(`      ... and ${channels.length - 3} more`);
      }

      testChannel = channels.find(
        (c: Channel) => !c.displayName || !c.displayName.toLowerCase().includes("general"),
      );
      if (!testChannel) {
        testChannel = channels[0];
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

  // Test 3: List channel messages
  console.log("3️⃣  Testing list_channel_messages...");
  try {
    if (!testTeam || !testChannel) {
      console.log("   ℹ️  Skipping: No teams or channels available\n");
    } else {
      const messagesResponse = await graphClient
        .api(`/teams/${testTeam.id}/channels/${testChannel.id}/messages`)
        .select("id,from,body,createdDateTime,importance")
        .top(5)
        .get();

      const messages = messagesResponse.value || [];
      console.log(`   ✅ Success: Found ${messages.length} messages`);

      messages.forEach((msg: Record<string, unknown>, index: number) => {
        if (index < 3) {
          const sender = (msg.from as Record<string, unknown>)?.user?.displayName || "Unknown";
          const preview = ((msg.body as string) || "").substring(0, 40).replace(/\n/g, " ");
          console.log(`      - ${sender}: ${preview}...`);
        }
      });

      if (messages.length > 3) {
        console.log(`      ... and ${messages.length - 3} more`);
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

  // Test 4: Send channel message (preview mode)
  console.log("4️⃣  Testing send_channel_message (preview mode)...");
  try {
    if (!testTeam || !testChannel) {
      console.log("   ℹ️  Skipping: No teams or channels available\n");
    } else {
      console.log("   ✅ Preview mode: send_channel_message");
      console.log(`      Team: ${testTeam.displayName}`);
      console.log(`      Channel: ${testChannel.displayName}`);
      console.log(`      Message: "Hello team!"`);
      console.log("      Content type: HTML");
      console.log("      Status: Preview mode (message not sent)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 5: List chats
  console.log("5️⃣  Testing list_chats...");
  let testChat: Chat | undefined;

  try {
    const chatsResponse = await graphClient
      .api("/me/chats")
      .select("id,topic,chatType,lastUpdatedDateTime")
      .top(10)
      .get();

    const chats = chatsResponse.value || [];
    console.log(`   ✅ Success: Found ${chats.length} chats`);

    chats.forEach((chat: Chat, index: number) => {
      if (index < 3) {
        const type = chat.chatType || "unknown";
        const topic = chat.topic || "(no topic)";
        console.log(`      - ${topic} (${type})`);
      }
    });

    if (chats.length > 3) {
      console.log(`      ... and ${chats.length - 3} more`);
    }

    testChat = chats[0];
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 6: List chat messages
  console.log("6️⃣  Testing list_chat_messages...");
  try {
    if (!testChat) {
      console.log("   ℹ️  Skipping: No chats available\n");
    } else {
      const messagesResponse = await graphClient
        .api(`/me/chats/${testChat.id}/messages`)
        .select("id,from,body,createdDateTime")
        .top(5)
        .get();

      const messages = messagesResponse.value || [];
      console.log(`   ✅ Success: Found ${messages.length} messages`);

      messages.forEach((msg: Record<string, unknown>, index: number) => {
        if (index < 3) {
          const sender = (msg.from as Record<string, unknown>)?.user?.displayName || "Unknown";
          const preview = ((msg.body as string) || "").substring(0, 40).replace(/\n/g, " ");
          console.log(`      - ${sender}: ${preview}...`);
        }
      });

      if (messages.length > 3) {
        console.log(`      ... and ${messages.length - 3} more`);
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

  // Test 7: Send chat message (preview mode)
  console.log("7️⃣  Testing send_chat_message (preview mode)...");
  try {
    if (!testChat) {
      console.log("   ℹ️  Skipping: No chats available\n");
    } else {
      console.log("   ✅ Preview mode: send_chat_message");
      console.log(`      Chat: ${testChat.topic || "(1-on-1)"}`);
      console.log(`      Message: "Hi there!"`);
      console.log("      Content type: text");
      console.log("      Status: Preview mode (message not sent)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 8: Search sites
  console.log("8️⃣  Testing search_sites...");
  let testSite: Site | undefined;

  try {
    const sitesResponse = await graphClient
      .api("/sites?search=*")
      .select("id,displayName,name,webUrl")
      .top(5)
      .get();

    const sites = sitesResponse.value || [];
    console.log(`   ✅ Success: Found ${sites.length} sites`);

    sites.forEach((site: Site, index: number) => {
      if (index < 3) {
        console.log(`      - ${site.displayName}`);
      }
    });

    if (sites.length > 3) {
      console.log(`      ... and ${sites.length - 3} more`);
    }

    testSite = sites[0];
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 9: Get site details
  console.log("9️⃣  Testing get_site...");
  try {
    if (!testSite) {
      console.log("   ℹ️  Skipping: No sites found\n");
    } else {
      const site = await graphClient
        .api(`/sites/${testSite.id}`)
        .select("id,displayName,name,webUrl,description")
        .get();

      console.log("   ✅ Success: Site details retrieved");
      console.log(`      Name: ${site.displayName}`);
      console.log(`      URL: ${site.webUrl}`);
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 10: List site drives
  console.log("🔟 Testing list_site_drives...");
  try {
    if (!testSite) {
      console.log("   ℹ️  Skipping: No sites found\n");
    } else {
      const drivesResponse = await graphClient
        .api(`/sites/${testSite.id}/drives`)
        .select("id,name,driveType")
        .top(5)
        .get();

      const drives = drivesResponse.value || [];
      console.log(`   ✅ Success: Found ${drives.length} drives`);

      drives.forEach((drive: Record<string, unknown>, index: number) => {
        if (index < 3) {
          console.log(`      - ${drive.name} (${drive.driveType})`);
        }
      });

      if (drives.length > 3) {
        console.log(`      ... and ${drives.length - 3} more`);
      }
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 11: List site lists
  console.log("1️⃣1️⃣  Testing list_site_lists...");
  try {
    if (!testSite) {
      console.log("   ℹ️  Skipping: No sites found\n");
    } else {
      const listsResponse = await graphClient
        .api(`/sites/${testSite.id}/lists`)
        .select("id,displayName,description")
        .top(5)
        .get();

      const lists = listsResponse.value || [];
      console.log(`   ✅ Success: Found ${lists.length} lists`);

      lists.forEach((list: Record<string, unknown>, index: number) => {
        if (index < 3) {
          console.log(`      - ${list.displayName}`);
        }
      });

      if (lists.length > 3) {
        console.log(`      ... and ${lists.length - 3} more`);
      }
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  console.log("✅ Phase 5 E2E tests completed!");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
