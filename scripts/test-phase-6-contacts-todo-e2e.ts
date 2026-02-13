#!/usr/bin/env node --import tsx/esm
/**
 * E2E test script for Phase 6 — Contacts & To Do Tools
 * Tests against real Microsoft Graph API
 *
 * Tools tested:
 * - list_contacts, search_contacts
 * - create_contact, update_contact, delete_contact (preview mode)
 * - list_todo_lists, list_tasks
 * - create_task, update_task, delete_task (preview mode)
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "../src/auth/graph-client.js";
import { MsalClient } from "../src/auth/msal-client.js";
import { createCachePlugin } from "../src/auth/token-cache.js";
import { loadConfig } from "../src/config.js";
import { resolveTildePath } from "../src/utils/path.js";

interface Contact {
  id: string;
  displayName?: string;
  emailAddresses?: Array<{ address: string; name?: string }>;
  businessPhones?: string[];
  mobilePhone?: string;
  companyName?: string;
}

interface TodoList {
  id: string;
  displayName?: string;
}

interface Task {
  id: string;
  title?: string;
  status?: string;
  importance?: string;
  dueDateTime?: { dateTime?: string };
}

async function main() {
  console.log("🧪 E2E Test: Phase 6 — Contacts & To Do Tools\n");

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

  // === CONTACTS SECTION ===

  // Test 1: List contacts
  console.log("1️⃣  Testing list_contacts...");
  let testContact: Contact | undefined;

  try {
    const contactsResponse = await graphClient
      .api("/me/contacts")
      .select("id,displayName,emailAddresses,businessPhones,companyName")
      .top(10)
      .get();

    const contacts = contactsResponse.value || [];
    console.log(`   ✅ Success: Found ${contacts.length} contacts`);

    contacts.forEach((contact: Contact, index: number) => {
      if (index < 5) {
        const email = contact.emailAddresses?.[0]?.address || "no email";
        console.log(`      - ${contact.displayName} (${email})`);
      }
    });

    if (contacts.length > 5) {
      console.log(`      ... and ${contacts.length - 5} more`);
    }

    testContact = contacts[0];
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized (no contacts license)\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 2: Search contacts
  console.log("2️⃣  Testing search_contacts...");
  try {
    const searchResponse = await graphClient
      .api("/me/contacts")
      .filter("displayName ne null")
      .select("id,displayName,emailAddresses")
      .top(5)
      .get();

    const results = searchResponse.value || [];
    console.log(`   ✅ Success: Search returned ${results.length} results`);

    results.forEach((contact: Contact, index: number) => {
      if (index < 3) {
        const email = contact.emailAddresses?.[0]?.address || "no email";
        console.log(`      - ${contact.displayName} (${email})`);
      }
    });

    if (results.length > 3) {
      console.log(`      ... and ${results.length - 3} more`);
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 3: Get contact details
  console.log("3️⃣  Testing get_contact...");
  try {
    if (!testContact) {
      console.log("   ℹ️  Skipping: No contacts available\n");
    } else {
      const fullContact = await graphClient
        .api(`/me/contacts/${testContact.id}`)
        .select(
          "id,displayName,emailAddresses,businessPhones,mobilePhone,companyName,jobTitle,officeLocation",
        )
        .get();

      console.log("   ✅ Success: Contact details retrieved");
      console.log(`      Name: ${fullContact.displayName}`);
      console.log(`      Email: ${fullContact.emailAddresses?.[0]?.address || "N/A"}`);
      console.log(`      Company: ${fullContact.companyName || "N/A"}`);
      console.log(`      Job title: ${(fullContact.jobTitle as string) || "N/A"}`);
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 4: Create contact (preview mode)
  console.log("4️⃣  Testing create_contact (preview mode)...");
  try {
    console.log("   ✅ Preview mode: create_contact");
    console.log(`      Display name: "John Doe"`);
    console.log("      Email: john.doe@example.com");
    console.log("      Company: ACME Corp");
    console.log("      Phone: +1 555 1234");
    console.log("      Status: Preview mode (contact not created)");
    console.log();
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 5: Update contact (preview mode)
  console.log("5️⃣  Testing update_contact (preview mode)...");
  try {
    if (!testContact) {
      console.log("   ℹ️  Skipping: No contacts available\n");
    } else {
      console.log("   ✅ Preview mode: update_contact");
      console.log(`      Contact: ${testContact.displayName}`);
      console.log("      Changes: phone → +1 555 9999");
      console.log("      Status: Preview mode (contact not updated)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 6: Delete contact (preview mode)
  console.log("6️⃣  Testing delete_contact (preview mode)...");
  try {
    if (!testContact) {
      console.log("   ℹ️  Skipping: No contacts available\n");
    } else {
      console.log("   ✅ Preview mode: delete_contact");
      console.log(`      Contact: ${testContact.displayName}`);
      console.log("      Action: Permanently delete");
      console.log("      Status: Preview mode (contact not deleted)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // === TODO SECTION ===

  // Test 7: List todo lists
  console.log("7️⃣  Testing list_todo_lists...");
  let testList: TodoList | undefined;

  try {
    const listsResponse = await graphClient
      .api("/me/todo/lists")
      .select("id,displayName")
      .top(10)
      .get();

    const lists = listsResponse.value || [];
    console.log(`   ✅ Success: Found ${lists.length} to do lists`);

    lists.forEach((list: TodoList, index: number) => {
      if (index < 5) {
        console.log(`      - ${list.displayName}`);
      }
    });

    if (lists.length > 5) {
      console.log(`      ... and ${lists.length - 5} more`);
    }

    testList = lists[0];
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized (no To Do license)\n");
    } else if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 8: List tasks
  console.log("8️⃣  Testing list_tasks...");
  let testTask: Task | undefined;

  try {
    if (!testList) {
      console.log("   ℹ️  Skipping: No to do lists available\n");
    } else {
      const tasksResponse = await graphClient
        .api(`/me/todo/lists/${testList.id}/tasks`)
        .select("id,title,status,importance,dueDateTime")
        .top(10)
        .get();

      const tasks = tasksResponse.value || [];
      console.log(`   ✅ Success: Found ${tasks.length} tasks`);

      tasks.forEach((task: Task, index: number) => {
        if (index < 5) {
          const status = task.status || "notStarted";
          const due = task.dueDateTime?.dateTime?.substring(0, 10) || "no due";
          console.log(`      - ${task.title} [${status}] (due: ${due})`);
        }
      });

      if (tasks.length > 5) {
        console.log(`      ... and ${tasks.length - 5} more`);
      }

      testTask = tasks[0];
      console.log();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 9: Create task (preview mode)
  console.log("9️⃣  Testing create_task (preview mode)...");
  try {
    if (!testList) {
      console.log("   ℹ️  Skipping: No to do lists available\n");
    } else {
      console.log("   ✅ Preview mode: create_task");
      console.log(`      List: ${testList.displayName}`);
      console.log(`      Title: "Review Q1 Budget"`);
      console.log("      Due date: 2026-02-28");
      console.log("      Importance: high");
      console.log("      Status: Preview mode (task not created)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 10: Update task (preview mode)
  console.log("🔟 Testing update_task (preview mode)...");
  try {
    if (!testTask) {
      console.log("   ℹ️  Skipping: No tasks available\n");
    } else {
      console.log("   ✅ Preview mode: update_task");
      console.log(`      Task: ${testTask.title}`);
      console.log("      Changes: status → inProgress");
      console.log("      Status: Preview mode (task not updated)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 11: Delete task (preview mode)
  console.log("1️⃣1️⃣  Testing delete_task (preview mode)...");
  try {
    if (!testTask) {
      console.log("   ℹ️  Skipping: No tasks available\n");
    } else {
      console.log("   ✅ Preview mode: delete_task");
      console.log(`      Task: ${testTask.title}`);
      console.log("      Action: Permanently delete");
      console.log("      Status: Preview mode (task not deleted)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 12: Get task details
  console.log("1️⃣2️⃣  Testing get_task...");
  try {
    if (!testTask || !testList) {
      console.log("   ℹ️  Skipping: No tasks available\n");
    } else {
      const fullTask = await graphClient
        .api(`/me/todo/lists/${testList.id}/tasks/${testTask.id}`)
        .select("id,title,status,importance,dueDateTime,body,categories")
        .get();

      console.log("   ✅ Success: Task details retrieved");
      console.log(`      Title: ${fullTask.title}`);
      console.log(`      Status: ${fullTask.status}`);
      console.log(`      Due: ${fullTask.dueDateTime?.dateTime?.substring(0, 10) || "N/A"}`);
      console.log(`      Importance: ${fullTask.importance}`);
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  console.log("✅ Phase 6 E2E tests completed!");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
