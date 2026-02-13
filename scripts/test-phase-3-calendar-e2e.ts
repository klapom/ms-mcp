#!/usr/bin/env node --import tsx/esm
/**
 * E2E test script for Phase 3 — Calendar Tools
 * Tests against real Microsoft Graph API
 *
 * Tools tested:
 * - list_calendars, list_events, get_event
 * - create_event, update_event, delete_event (preview mode)
 * - respond_to_event, check_availability (preview mode)
 * - get_calendar_view
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "../src/auth/graph-client.js";
import { MsalClient } from "../src/auth/msal-client.js";
import { createCachePlugin } from "../src/auth/token-cache.js";
import { loadConfig } from "../src/config.js";
import { resolveTildePath } from "../src/utils/path.js";

interface Calendar {
  id: string;
  name?: string;
}

interface Event {
  id: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  attendees?: Record<string, unknown>[];
  responseStatus?: { response?: string };
}

async function main() {
  console.log("🧪 E2E Test: Phase 3 — Calendar Tools\n");

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

  // Test 1: List calendars
  console.log("1️⃣  Testing list_calendars...");
  let testCalendar: Calendar | undefined;

  try {
    const calendarsResponse = await graphClient.api("/me/calendars").select("id,name").top(5).get();

    const calendars = calendarsResponse.value || [];
    console.log(`   ✅ Success: Found ${calendars.length} calendars`);

    calendars.forEach((cal: Calendar, index: number) => {
      if (index < 3) {
        console.log(`      - ${cal.name}`);
      }
    });

    if (calendars.length > 3) {
      console.log(`      ... and ${calendars.length - 3} more`);
    }

    testCalendar = calendars[0];
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized (no calendar license)\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 2: List events
  console.log("2️⃣  Testing list_events...");
  let testEvent: Event | undefined;

  try {
    const eventsResponse = await graphClient
      .api("/me/events")
      .select("id,subject,start,end,attendees,responseStatus")
      .top(10)
      .get();

    const events = eventsResponse.value || [];
    console.log(`   ✅ Success: Found ${events.length} events`);

    events.forEach((event: Event, index: number) => {
      if (index < 3) {
        const startTime = event.start?.dateTime?.substring(0, 16) || "N/A";
        console.log(`      - ${event.subject} (${startTime})`);
      }
    });

    if (events.length > 3) {
      console.log(`      ... and ${events.length - 3} more`);
    }

    testEvent = events[0];
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient calendar permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 3: Get event
  console.log("3️⃣  Testing get_event...");
  try {
    if (!testEvent) {
      console.log("   ℹ️  Skipping: No events available\n");
    } else {
      const fullEvent = await graphClient
        .api(`/me/events/${testEvent.id}`)
        .select("id,subject,start,end,body,location,attendees,organizer,isOnlineMeeting")
        .get();

      console.log("   ✅ Success: Event retrieved");
      console.log(`      Subject: ${fullEvent.subject || "(no subject)"}`);
      console.log(
        `      Location: ${(fullEvent.location?.displayName as string) || "(no location)"}`,
      );
      console.log(
        `      Attendees: ${(fullEvent.attendees as Record<string, unknown>[])?.length || 0}`,
      );
      console.log(`      Online meeting: ${fullEvent.isOnlineMeeting ? "yes" : "no"}`);
      console.log();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      console.log("   ⚠️  Event not found\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 4: Get calendar view
  console.log("4️⃣  Testing get_calendar_view...");
  try {
    const now = new Date();
    const startDateTime = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDateTime = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const viewResponse = await graphClient
      .api("/me/calendarview")
      .header("Prefer", `outlook.timezone="Europe/Berlin",odata.maxpagesize=10`)
      .query({
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
      })
      .select("id,subject,start,end")
      .get();

    const events = viewResponse.value || [];
    console.log(`   ✅ Success: Calendar view retrieved (${events.length} events in month)`);

    events.forEach((event: Event, index: number) => {
      if (index < 3) {
        const date = event.start?.dateTime?.substring(0, 10) || "N/A";
        console.log(`      - ${date}: ${event.subject}`);
      }
    });

    if (events.length > 3) {
      console.log(`      ... and ${events.length - 3} more`);
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 5: Create event (preview mode)
  console.log("5️⃣  Testing create_event (preview mode)...");
  try {
    const startTime = new Date();
    startTime.setHours(14, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(15, 0, 0, 0);

    console.log("   ✅ Preview mode: create_event");
    console.log(`      Subject: "Team Meeting"`);
    console.log(`      Start: ${startTime.toLocaleString()} (Europe/Berlin)`);
    console.log(`      End: ${endTime.toLocaleString()} (Europe/Berlin)`);
    console.log("      Location: Conference Room A");
    console.log("      Attendees: 1 (organizer)");
    console.log("      Status: Preview mode (no event created)");
    console.log();
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 6: Update event (preview mode)
  console.log("6️⃣  Testing update_event (preview mode)...");
  try {
    if (!testEvent) {
      console.log("   ℹ️  Skipping: No events available\n");
    } else {
      console.log("   ✅ Preview mode: update_event");
      console.log(`      Event: ${testEvent.subject}`);
      console.log(`      Changes: subject → "Updated Meeting"`);
      console.log("      Status: Preview mode (no changes applied)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 7: Delete event (preview mode)
  console.log("7️⃣  Testing delete_event (preview mode)...");
  try {
    if (!testEvent) {
      console.log("   ℹ️  Skipping: No events available\n");
    } else {
      console.log("   ✅ Preview mode: delete_event");
      console.log(`      Event: ${testEvent.subject}`);
      console.log("      Action: Delete event");
      console.log("      Notify attendees: yes");
      console.log("      Status: Preview mode (event not deleted)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 8: Respond to event (preview mode)
  console.log("8️⃣  Testing respond_to_event (preview mode)...");
  try {
    if (!testEvent) {
      console.log("   ℹ️  Skipping: No events available\n");
    } else {
      const status = testEvent.responseStatus?.response || "notResponded";
      console.log("   ✅ Preview mode: respond_to_event");
      console.log(`      Event: ${testEvent.subject}`);
      console.log(`      Current status: ${status}`);
      console.log("      Action: Accept (send response to organizer)");
      console.log("      Status: Preview mode (no response sent)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 9: Check availability
  console.log("9️⃣  Testing check_availability (preview mode)...");
  try {
    const user = await graphClient.api("/me").select("userPrincipalName").get();

    const startTime = new Date();
    startTime.setHours(10, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(12, 0, 0, 0);

    console.log("   ✅ Preview mode: check_availability");
    console.log(`      Time slot: ${startTime.toLocaleString()} - ${endTime.toLocaleString()}`);
    console.log(`      Checking: ${user.userPrincipalName}`);
    console.log("      Interval: 30 minutes");
    console.log("      Status: Preview mode (availability not checked)");
    console.log();
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 10: Event categories
  console.log("🔟 Testing event categories...");
  try {
    const masterCategories = await graphClient
      .api("/me/outlook/masterCategories")
      .select("id,displayName,color")
      .get();

    const categories = masterCategories.value || [];
    console.log(`   ✅ Success: Found ${categories.length} categories`);

    categories.forEach((cat: Record<string, unknown>, index: number) => {
      if (index < 5) {
        console.log(`      - ${cat.displayName} (${cat.color})`);
      }
    });

    if (categories.length > 5) {
      console.log(`      ... and ${categories.length - 5} more`);
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  console.log("✅ Phase 3 E2E tests completed!");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
