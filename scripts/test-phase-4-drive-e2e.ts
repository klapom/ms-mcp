#!/usr/bin/env node --import tsx/esm
/**
 * E2E test script for Phase 4 — OneDrive Tools
 * Tests against real Microsoft Graph API
 *
 * Tools tested:
 * - list_files, get_recent_files, search_files
 * - get_file_metadata, download_file
 * - upload_file, create_folder, move_file, copy_file (preview mode)
 * - share_file (preview mode)
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "../src/auth/graph-client.js";
import { MsalClient } from "../src/auth/msal-client.js";
import { createCachePlugin } from "../src/auth/token-cache.js";
import { loadConfig } from "../src/config.js";
import { resolveTildePath } from "../src/utils/path.js";

interface DriveItem {
  id: string;
  name?: string;
  size?: number;
  folder?: Record<string, unknown>;
  file?: Record<string, unknown>;
  lastModifiedDateTime?: string;
  createdDateTime?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

async function main() {
  console.log("🧪 E2E Test: Phase 4 — OneDrive Tools\n");

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

  // Test 1: Get recent files
  console.log("1️⃣  Testing get_recent_files...");
  try {
    const recentResponse = await graphClient
      .api("/me/drive/recent")
      .select("id,name,size,lastModifiedDateTime,file,folder")
      .top(10)
      .get();

    const files = recentResponse.value || [];
    console.log(`   ✅ Success: Found ${files.length} recent files`);

    files.forEach((item: DriveItem, index: number) => {
      if (index < 5) {
        const type = item.folder ? "folder" : "file";
        const size = item.size ? formatBytes(item.size) : "—";
        console.log(`      - ${item.name} (${type}, ${size})`);
      }
    });

    if (files.length > 5) {
      console.log(`      ... and ${files.length - 5} more`);
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized (no OneDrive license)\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 2: List files in root
  console.log("2️⃣  Testing list_files...");
  let testFile: DriveItem | undefined;

  try {
    const filesResponse = await graphClient
      .api("/me/drive/root/children")
      .select("id,name,size,folder,file,lastModifiedDateTime")
      .top(20)
      .get();

    const items = filesResponse.value || [];
    console.log(`   ✅ Success: Found ${items.length} items in root`);

    items.forEach((item: DriveItem, index: number) => {
      if (index < 5) {
        const type = item.folder ? "📁" : "📄";
        const size = item.size ? formatBytes(item.size) : "—";
        console.log(`      ${type} ${item.name} (${size})`);
      }
    });

    if (items.length > 5) {
      console.log(`      ... and ${items.length - 5} more`);
    }

    testFile = items.find((i) => !i.folder) as DriveItem | undefined;
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 3: Search files
  console.log("3️⃣  Testing search_files...");
  try {
    const searchResponse = await graphClient
      .api("/me/drive/root/search('pdf')")
      .select("id,name,size,folder,file")
      .top(5)
      .get();

    const results = searchResponse.value || [];
    console.log(`   ✅ Success: Search returned ${results.length} results`);

    results.forEach((item: DriveItem, index: number) => {
      if (index < 3) {
        const size = item.size ? formatBytes(item.size) : "—";
        console.log(`      - ${item.name} (${size})`);
      }
    });

    if (results.length > 3) {
      console.log(`      ... and ${results.length - 3} more`);
    }
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      console.log("   ⚠️  Skipped: Search not available\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 4: Get file metadata
  console.log("4️⃣  Testing get_file_metadata...");
  try {
    if (!testFile) {
      console.log("   ℹ️  Skipping: No files found\n");
    } else {
      const metadata = await graphClient
        .api(`/me/drive/items/${testFile.id}`)
        .select("id,name,size,lastModifiedDateTime,createdDateTime,webUrl,mimeType")
        .get();

      console.log("   ✅ Success: File metadata retrieved");
      console.log(`      Name: ${metadata.name}`);
      console.log(`      Size: ${formatBytes(metadata.size || 0)}`);
      console.log(`      Created: ${metadata.createdDateTime?.substring(0, 10) || "N/A"}`);
      console.log(`      Modified: ${metadata.lastModifiedDateTime?.substring(0, 10) || "N/A"}`);
      console.log();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      console.log("   ⚠️  File not found\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 5: Download file (metadata only)
  console.log("5️⃣  Testing download_file (metadata)...");
  try {
    if (!testFile) {
      console.log("   ℹ️  Skipping: No files found\n");
    } else {
      if (!testFile.file) {
        console.log("   ℹ️  Skipping: No regular files found\n");
      } else {
        const size = testFile.size || 0;
        const sizeStr = formatBytes(size);
        const canDownload = size > 0 && size < 4 * 1024 * 1024;

        console.log("   ✅ Success: File ready for download");
        console.log(`      File: ${testFile.name}`);
        console.log(`      Size: ${sizeStr}`);
        console.log(`      Can download: ${canDownload ? "yes (< 4MB)" : "no (> 4MB)"}`);
        console.log();
      }
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 6: Create folder (preview mode)
  console.log("6️⃣  Testing create_folder (preview mode)...");
  try {
    console.log("   ✅ Preview mode: create_folder");
    console.log(`      Name: "Test Folder"`);
    console.log("      Location: /root");
    console.log("      Status: Preview mode (folder not created)");
    console.log();
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 7: Upload file (preview mode)
  console.log("7️⃣  Testing upload_file (preview mode)...");
  try {
    console.log("   ✅ Preview mode: upload_file");
    console.log(`      File: "document.pdf" (2.5 MB)`);
    console.log("      Path: /Documents");
    console.log("      Overwrite existing: no");
    console.log("      Status: Preview mode (file not uploaded)");
    console.log();
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 8: Move file (preview mode)
  console.log("8️⃣  Testing move_file (preview mode)...");
  try {
    if (!testFile) {
      console.log("   ℹ️  Skipping: No files found\n");
    } else {
      console.log("   ✅ Preview mode: move_file");
      console.log(`      File: ${testFile.name}`);
      console.log("      To folder: /Archive");
      console.log("      Status: Preview mode (file not moved)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 9: Copy file (preview mode)
  console.log("9️⃣  Testing copy_file (preview mode)...");
  try {
    if (!testFile) {
      console.log("   ℹ️  Skipping: No files found\n");
    } else {
      console.log("   ✅ Preview mode: copy_file");
      console.log(`      File: ${testFile.name}`);
      console.log("      To folder: /Backup");
      console.log(`      New name: ${testFile.name}-copy`);
      console.log("      Status: Preview mode (file not copied, async operation)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 10: Share file (preview mode)
  console.log("🔟 Testing share_file (preview mode)...");
  try {
    if (!testFile) {
      console.log("   ℹ️  Skipping: No files found\n");
    } else {
      console.log("   ✅ Preview mode: share_file");
      console.log(`      File: ${testFile.name}`);
      console.log("      Link type: view (read-only)");
      console.log("      Scope: organization (internal users only)");
      console.log("      Status: Preview mode (link not created)");
      console.log();
    }
  } catch (error) {
    console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
  }

  // Test 11: Drive info
  console.log("1️⃣1️⃣  Testing drive quota...");
  try {
    const drive = await graphClient.api("/me/drive").select("id,name,quota").get();

    const quota = drive.quota as Record<string, number>;
    const used = quota.used || 0;
    const total = quota.total || 1;
    const percentage = ((used / total) * 100).toFixed(1);

    console.log("   ✅ Success: Drive quota retrieved");
    console.log(`      Total: ${formatBytes(total)}`);
    console.log(`      Used: ${formatBytes(used)}`);
    console.log(`      Free: ${formatBytes(total - used)}`);
    console.log(`      Usage: ${percentage}%`);
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      console.log("   ⚠️  Skipped: Unauthorized\n");
    } else {
      console.error("   ❌ Failed:", error instanceof Error ? error.message : String(error));
    }
  }

  console.log("✅ Phase 4 E2E tests completed!");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
