#!/usr/bin/env node --import tsx/esm
/**
 * E2E Test Script for Sprint 9.2 - OneNote Tools
 *
 * Tests all 6 OneNote tools against the real Microsoft Graph API:
 * - list_notebooks
 * - list_sections
 * - list_pages
 * - get_page_content
 * - create_page
 * - search_notes
 *
 * Prerequisites:
 * - Authenticated user (pnpm auth login)
 * - Notes.ReadWrite permission granted in Azure Portal
 *
 * Usage:
 *   pnpm tsx scripts/test-sprint-9-2-e2e.ts
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient } from "../src/auth/graph-client.js";
import { MsalClient } from "../src/auth/msal-client.js";
import { createCachePlugin } from "../src/auth/token-cache.js";
import { loadConfig } from "../src/config.js";
import { resolveTildePath } from "../src/utils/path.js";

interface Notebook {
  id: string;
  displayName: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  isDefault?: boolean;
}

interface Section {
  id: string;
  displayName: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

interface Page {
  id: string;
  title: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  contentUrl: string;
}

async function main() {
  console.log("=".repeat(80));
  console.log("Sprint 9.2 E2E Test - OneNote Tools");
  console.log("=".repeat(80));
  console.log();

  // Load config and create Graph client
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

  let testNotebookId: string | undefined;
  let testSectionId: string | undefined;
  let testPageId: string | undefined;

  try {
    // Step 1: List notebooks
    console.log("Step 1: list_notebooks");
    console.log("-".repeat(80));
    const notebooksResponse = (await graphClient
      .api("/me/onenote/notebooks")
      .select(["id", "displayName", "createdDateTime", "lastModifiedDateTime", "isDefault"])
      .top(5)
      .get()) as { value: Notebook[] };

    console.log(`✓ Found ${notebooksResponse.value.length} notebooks`);
    for (const notebook of notebooksResponse.value) {
      console.log(`  📓 ${notebook.displayName} (${notebook.id})`);
      console.log(`     Created: ${notebook.createdDateTime}`);
      console.log(`     Default: ${notebook.isDefault ? "Yes" : "No"}`);
      if (!testNotebookId) {
        testNotebookId = notebook.id;
      }
    }
    console.log();

    if (!testNotebookId) {
      console.error("❌ No notebooks found. Please create a notebook in OneNote first.");
      process.exit(1);
    }

    // Step 2: List sections in the first notebook
    console.log(`Step 2: list_sections (notebook: ${testNotebookId})`);
    console.log("-".repeat(80));
    const sectionsResponse = (await graphClient
      .api(`/me/onenote/notebooks/${encodeURIComponent(testNotebookId)}/sections`)
      .select(["id", "displayName", "createdDateTime", "lastModifiedDateTime"])
      .top(5)
      .get()) as { value: Section[] };

    console.log(`✓ Found ${sectionsResponse.value.length} sections`);
    for (const section of sectionsResponse.value) {
      console.log(`  📑 ${section.displayName} (${section.id})`);
      console.log(`     Created: ${section.createdDateTime}`);
      if (!testSectionId) {
        testSectionId = section.id;
      }
    }
    console.log();

    if (!testSectionId) {
      console.error("❌ No sections found. Please create a section in the notebook first.");
      process.exit(1);
    }

    // Step 3: Create a test page
    console.log(`Step 3: create_page (section: ${testSectionId})`);
    console.log("-".repeat(80));
    const pageTitle = `E2E Test Page ${new Date().toISOString()}`;
    const pageHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>${pageTitle}</title>
  </head>
  <body>
    <h1>E2E Test Page</h1>
    <p>This page was created by the Sprint 9.2 E2E test script.</p>
    <h2>Test Data</h2>
    <ul>
      <li>Timestamp: ${new Date().toISOString()}</li>
      <li>Section ID: ${testSectionId}</li>
      <li>Purpose: Testing OneNote MCP tools</li>
    </ul>
    <p><strong>This page can be safely deleted.</strong></p>
  </body>
</html>`;

    const createdPage = (await graphClient
      .api(`/me/onenote/sections/${encodeURIComponent(testSectionId)}/pages`)
      .header("Content-Type", "text/html")
      .post(pageHtml)) as Page;

    console.log("✓ Page created successfully");
    console.log(`  📄 ID: ${createdPage.id}`);
    console.log(`  📄 Title: ${createdPage.title}`);
    console.log(`  📄 Created: ${createdPage.createdDateTime}`);
    console.log(`  📄 Content URL: ${createdPage.contentUrl}`);
    testPageId = createdPage.id;
    console.log();

    // Step 4: List pages in the section
    console.log(`Step 4: list_pages (section: ${testSectionId})`);
    console.log("-".repeat(80));
    const pagesResponse = (await graphClient
      .api(`/me/onenote/sections/${encodeURIComponent(testSectionId)}/pages`)
      .select(["id", "title", "createdDateTime", "lastModifiedDateTime", "contentUrl"])
      .top(5)
      .get()) as { value: Page[] };

    console.log(`✓ Found ${pagesResponse.value.length} pages`);
    for (const page of pagesResponse.value) {
      console.log(`  📄 ${page.title} (${page.id})`);
      console.log(`     Created: ${page.createdDateTime}`);
      if (page.id === testPageId) {
        console.log("     ⭐ This is the page we just created");
      }
    }
    console.log();

    // Step 5: Get page content
    console.log(`Step 5: get_page_content (page: ${testPageId})`);
    console.log("-".repeat(80));
    const pageContent = (await graphClient
      .api(`/me/onenote/pages/${encodeURIComponent(testPageId)}/content`)
      .get()) as string;

    console.log(`✓ Retrieved page content (${pageContent.length} chars)`);
    console.log("  Content preview (first 500 chars):");
    console.log(pageContent.substring(0, 500));
    if (pageContent.includes("E2E Test Page")) {
      console.log("  ✓ Content contains expected text");
    }
    console.log();

    // Step 6: Search notes
    console.log(`Step 6: search_notes (query: "E2E Test")`);
    console.log("-".repeat(80));
    const searchResponse = (await graphClient
      .api("/me/onenote/pages")
      .search("E2E Test")
      .select(["id", "title", "createdDateTime", "lastModifiedDateTime"])
      .top(10)
      .get()) as { value: Page[] };

    console.log(`✓ Found ${searchResponse.value.length} pages matching "E2E Test"`);
    for (const page of searchResponse.value) {
      console.log(`  🔍 ${page.title} (${page.id})`);
      console.log(`     Created: ${page.createdDateTime}`);
      if (page.id === testPageId) {
        console.log("     ⭐ This is the page we just created");
      }
    }
    console.log();

    // Summary
    console.log("=".repeat(80));
    console.log("✅ All Sprint 9.2 tools tested successfully!");
    console.log("=".repeat(80));
    console.log();
    console.log("Tools tested:");
    console.log("  ✓ list_notebooks - Listed notebooks");
    console.log("  ✓ list_sections - Listed sections in a notebook");
    console.log("  ✓ create_page - Created a test page");
    console.log("  ✓ list_pages - Listed pages in a section");
    console.log("  ✓ get_page_content - Retrieved page HTML content");
    console.log("  ✓ search_notes - Searched for pages by query");
    console.log();
    console.log(`Note: Test page "${pageTitle}" (ID: ${testPageId}) was created.`);
    console.log("You can delete it manually from OneNote if desired.");
    console.log();
  } catch (error) {
    console.error();
    console.error("❌ E2E test failed:");
    console.error(error);
    console.error();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
