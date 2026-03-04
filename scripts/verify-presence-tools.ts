#!/usr/bin/env node
/**
 * Verify Presence Tools Registration
 */

import { fileURLToPath } from "node:url";

async function main() {
  console.log("🔍 Verifying Presence Tools Registration\n");

  // Dynamically import the registrations to verify they're included
  const { registerPresenceTools } = await import("../src/tools/presence.js");

  if (!registerPresenceTools) {
    console.error("❌ Failed to import registerPresenceTools");
    process.exit(1);
  }

  console.log("✅ registerPresenceTools imported successfully");

  // Import schemas to verify they're valid
  const schemas = await import("../src/schemas/presence.js");

  const expectedSchemas = ["GetMyPresenceParams", "GetPresenceParams", "SetStatusMessageParams"];

  for (const schema of expectedSchemas) {
    if (!schemas[schema]) {
      console.error(`❌ Missing schema: ${schema}`);
      process.exit(1);
    }
    console.log(`✅ Schema validated: ${schema}`);
  }

  // Test schema validation
  console.log("\n📋 Testing Schema Validation:\n");

  // Test GetMyPresenceParams
  try {
    const result = schemas.GetMyPresenceParams.parse({});
    console.log("✅ GetMyPresenceParams: Empty params valid");
  } catch (error) {
    console.error("❌ GetMyPresenceParams validation failed:", error);
    process.exit(1);
  }

  try {
    const result = schemas.GetMyPresenceParams.parse({ user_id: "test@example.com" });
    console.log("✅ GetMyPresenceParams: With user_id valid");
  } catch (error) {
    console.error("❌ GetMyPresenceParams validation failed:", error);
    process.exit(1);
  }

  // Test GetPresenceParams
  try {
    schemas.GetPresenceParams.parse({});
    console.error("❌ GetPresenceParams: Should reject empty params");
    process.exit(1);
  } catch (error) {
    console.log("✅ GetPresenceParams: Correctly rejects empty params");
  }

  try {
    const result = schemas.GetPresenceParams.parse({ user_id: "test@example.com" });
    console.log("✅ GetPresenceParams: With user_id valid");
  } catch (error) {
    console.error("❌ GetPresenceParams validation failed:", error);
    process.exit(1);
  }

  // Test SetStatusMessageParams
  try {
    const result = schemas.SetStatusMessageParams.parse({});
    if (result.confirm === false) {
      console.log("✅ SetStatusMessageParams: Default confirm=false");
    }
  } catch (error) {
    console.error("❌ SetStatusMessageParams validation failed:", error);
    process.exit(1);
  }

  try {
    schemas.SetStatusMessageParams.parse({ message: "a".repeat(281) });
    console.error("❌ SetStatusMessageParams: Should reject message > 280 chars");
    process.exit(1);
  } catch (error) {
    console.log("✅ SetStatusMessageParams: Correctly rejects message > 280 chars");
  }

  try {
    schemas.SetStatusMessageParams.parse({ expires_at: "not-a-date" });
    console.error("❌ SetStatusMessageParams: Should reject invalid datetime");
    process.exit(1);
  } catch (error) {
    console.log("✅ SetStatusMessageParams: Correctly rejects invalid datetime");
  }

  try {
    const result = schemas.SetStatusMessageParams.parse({
      message: "Test",
      expires_at: "2026-02-20T17:00:00Z",
      confirm: true,
    });
    console.log("✅ SetStatusMessageParams: Valid params accepted");
  } catch (error) {
    console.error("❌ SetStatusMessageParams validation failed:", error);
    process.exit(1);
  }

  // Verify build contains presence tools
  console.log("\n🔨 Verifying Build:\n");

  try {
    const { readFileSync } = await import("node:fs");
    const buildContent = readFileSync("dist/index.js", "utf-8");

    const checks = [
      { name: "registerPresenceTools import", pattern: "registerPresenceTools" },
      { name: "get_my_presence registration", pattern: '"get_my_presence"' },
      { name: "get_presence registration", pattern: '"get_presence"' },
      { name: "set_status_message registration", pattern: '"set_status_message"' },
      {
        name: "Presence tools registered log",
        pattern: "Presence tools registered",
      },
    ];

    for (const check of checks) {
      if (buildContent.includes(check.pattern)) {
        console.log(`✅ Build contains: ${check.name}`);
      } else {
        console.error(`❌ Build missing: ${check.name}`);
        process.exit(1);
      }
    }
  } catch (error) {
    console.error("❌ Failed to verify build:", error);
    process.exit(1);
  }

  // Summary
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Verification Summary");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("✅ All presence tools properly registered");
  console.log("✅ All schemas validated correctly");
  console.log("✅ Build includes all presence functionality");
  console.log("✅ Ready for MCP client integration\n");
  console.log("📊 Sprint 9.4 Status: VERIFIED\n");
}

// Only run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
