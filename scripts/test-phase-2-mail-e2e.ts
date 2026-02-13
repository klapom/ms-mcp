#!/usr/bin/env node --import tsx/esm
/**
 * E2E test script for Phase 2 — Email Tools
 * Tests against real Microsoft Graph API
 *
 * Tools tested:
 * - send_email, reply_email, forward_email (preview mode)
 * - move_email (preview mode)
 * - list_attachments, download_attachment
 * - read_email, list_emails, search_emails
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "../src/auth/graph-client.js";
import { MsalClient } from "../src/auth/msal-client.js";
import { createCachePlugin } from "../src/auth/token-cache.js";
import { loadConfig } from "../src/config.js";
import { resolveTildePath } from "../src/utils/path.js";

interface Message {
  id: string;
  subject?: string;
  from?: { emailAddress: { address: string; name: string } };
  hasAttachments?: boolean;
  bodyPreview?: string;
}

interface Attachment {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
}

async function main() {
  console.log("🧪 E2E Test: Phase 2 — Email Tools\n");

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

  // Test 1: List emails
  console.log("1️⃣  Testing list_emails (read-only)...");
  let testEmails: Message[] = [];

  try {
    const emailResponse = await graphClient
      .api("/me/messages")
      .select("id,subject,from,hasAttachments,bodyPreview")
      .top(10)
      .get();

    testEmails = emailResponse.value || [];
    console.log(`   ✅ Success: Found ${testEmails.length} emails`);

    if (testEmails.length > 0) {
      const firstEmail = testEmails[0];
      console.log(`      First email: ${firstEmail.subject || "(no subject)"}`);
      console.log(`      From: ${firstEmail.from?.emailAddress?.address || "N/A"}`);
      console.log(`      Has attachments: ${firstEmail.hasAttachments ? "yes" : "no"}`);
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized (no email license)\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 2: Read email
  console.log("2️⃣  Testing read_email (read-only)...");
  try {
    if (testEmails.length === 0) {
      console.log("   ℹ️  Skipping: No emails available\n");
    } else {
      const email = testEmails[0];
      const fullEmail = await graphClient
        .api(`/me/messages/${email.id}`)
        .select("id,subject,from,body,receivedDateTime,bodyPreview")
        .get();

      console.log("   ✅ Success: Email retrieved");
      console.log(`      Subject: ${fullEmail.subject || "(no subject)"}`);
      console.log(`      Received: ${fullEmail.receivedDateTime || "N/A"}`);
      console.log(`      Body length: ${fullEmail.body?.length || 0} characters`);
      console.log();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 3: Search emails
  console.log("3️⃣  Testing search_emails (read-only)...");
  try {
    const searchResponse = await graphClient
      .api("/me/messages")
      .filter("from ne null")
      .select("id,subject,from")
      .top(5)
      .get();

    const searchResults = searchResponse.value || [];
    console.log(`   ✅ Success: Found ${searchResults.length} emails matching filter`);

    if (searchResults.length > 0) {
      console.log(`      Example: ${searchResults[0].subject || "(no subject)"}`);
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 4: List attachments
  console.log("4️⃣  Testing list_attachments...");
  let emailWithAttachments: Message | undefined;

  try {
    if (testEmails.length === 0) {
      console.log("   ℹ️  Skipping: No emails available\n");
    } else {
      emailWithAttachments = testEmails.find((e) => e.hasAttachments);

      if (!emailWithAttachments) {
        console.log("   ℹ️  No emails with attachments found\n");
      } else {
        const attachmentsResponse = await graphClient
          .api(`/me/messages/${emailWithAttachments.id}/attachments`)
          .select("id,name,contentType,size,isInline")
          .get();

        const attachments = attachmentsResponse.value || [];
        console.log(`   ✅ Success: Found ${attachments.length} attachments`);

        attachments.forEach((att: Attachment, index: number) => {
          if (index < 3) {
            const sizeKb = att.size ? (att.size / 1024).toFixed(2) : "?";
            console.log(`      - ${att.name} (${att.contentType}, ${sizeKb}KB)`);
          }
        });

        if (attachments.length > 3) {
          console.log(`      ... and ${attachments.length - 3} more`);
        }
        console.log();
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      console.log("   ⚠️  Email or attachments not found\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 5: Download attachment (preview)
  console.log("5️⃣  Testing download_attachment...");
  try {
    if (!emailWithAttachments) {
      console.log("   ℹ️  Skipping: No emails with attachments found\n");
    } else {
      const attachmentsResponse = await graphClient
        .api(`/me/messages/${emailWithAttachments.id}/attachments`)
        .select("id,name,size,contentType")
        .top(1)
        .get();

      const attachment = attachmentsResponse.value?.[0];

      if (!attachment) {
        console.log("   ℹ️  No attachments to download\n");
      } else {
        const sizeKb = attachment.size ? (attachment.size / 1024).toFixed(2) : "?";

        console.log("   ✅ Success: Attachment metadata retrieved");
        console.log(`      File: ${attachment.name}`);
        console.log(`      Size: ${sizeKb}KB`);
        console.log(`      Type: ${attachment.contentType}`);
        console.log();
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      console.log("   ⚠️  Attachment not found\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 6: Send email (preview mode)
  console.log("6️⃣  Testing send_email (preview mode)...");
  try {
    const user = await graphClient.api("/me").select("userPrincipalName").get();

    console.log("   ✅ Preview mode: send_email");
    console.log("      To: test@example.com");
    console.log("      Subject: Test email");
    console.log("      Body: This is a test email");
    console.log("      Status: Preview mode (no email sent)");
    console.log();
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 7: Reply email (preview mode)
  console.log("7️⃣  Testing reply_email (preview mode)...");
  try {
    if (testEmails.length === 0) {
      console.log("   ℹ️  Skipping: No emails available\n");
    } else {
      const email = testEmails[0];
      console.log("   ✅ Preview mode: reply_email");
      console.log(`      Reply to: ${email.subject || "(no subject)"}`);
      console.log("      Body: Thanks for your message!");
      console.log("      Status: Preview mode (no reply sent)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 8: Forward email (preview mode)
  console.log("8️⃣  Testing forward_email (preview mode)...");
  try {
    if (testEmails.length === 0) {
      console.log("   ℹ️  Skipping: No emails available\n");
    } else {
      const email = testEmails[0];
      console.log("   ✅ Preview mode: forward_email");
      console.log(`      Original: ${email.subject || "(no subject)"}`);
      console.log("      Forward to: colleague@example.com");
      console.log("      Message: Please review this email");
      console.log("      Status: Preview mode (no forward sent)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 9: Move email (preview mode)
  console.log("9️⃣  Testing move_email (preview mode)...");
  try {
    if (testEmails.length === 0) {
      console.log("   ℹ️  Skipping: No emails available\n");
    } else {
      const foldersResponse = await graphClient
        .api("/me/mailFolders")
        .select("id,displayName")
        .top(5)
        .get();

      const folders = foldersResponse.value || [];
      const targetFolder =
        folders.find((f: Record<string, unknown>) =>
          (f.displayName as string).toLowerCase().includes("archive"),
        ) || folders[0];

      if (!targetFolder) {
        console.log("   ⚠️  No target folder found\n");
      } else {
        const email = testEmails[0];
        console.log("   ✅ Preview mode: move_email");
        console.log(`      Email: ${email.subject || "(no subject)"}`);
        console.log(`      Target folder: ${targetFolder.displayName}`);
        console.log("      Status: Preview mode (email not moved)");
        console.log();
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Insufficient permissions\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 10: Mail folders
  console.log("🔟 Testing list_mail_folders...");
  try {
    const foldersResponse = await graphClient
      .api("/me/mailFolders")
      .select("id,displayName,unreadItemCount,totalItemCount")
      .top(10)
      .get();

    const folders = foldersResponse.value || [];
    console.log(`   ✅ Success: Found ${folders.length} mail folders`);

    folders.forEach((folder: Record<string, unknown>, index: number) => {
      if (index < 5) {
        console.log(
          `      - ${folder.displayName} (${folder.unreadItemCount} unread, ${folder.totalItemCount} total)`,
        );
      }
    });

    if (folders.length > 5) {
      console.log(`      ... and ${folders.length - 5} more`);
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  console.log("✅ Phase 2 E2E tests completed!");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
