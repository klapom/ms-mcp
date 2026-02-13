# Phase 8 E2E Tests

This document describes the E2E (End-to-End) test scripts for Phase 8 (Advanced Features).

## Overview

Phase 8 consists of 4 sprints with 20+ advanced tools. Each sprint has a dedicated E2E test script that validates real Graph API interactions.

## Test Scripts

### Sprint 8.1: Search & Query Enhancements
**File:** `scripts/test-sprint-8-1-e2e.ts`

**Tools Tested:**
- `advanced_search_emails` — Search emails using KQL
- `search_events` — Search calendar events using KQL
- `track_file_changes` — Track OneDrive file changes via delta sync
- `advanced_search_contacts` — Search contacts using KQL
- `search_teams_messages` — Search Teams messages using KQL

**Key Features:**
- Tests Graph Search API (`POST /search/query`)
- Tests delta query functionality (`GET /me/drive/root/delta`)
- Handles search results with ranking/relevance
- Graceful degradation for unsupported tenants

**Requirements:**
- Mail.Read, Calendars.Read, Files.Read, Contacts.Read, ChannelMessage.Read.All permissions

### Sprint 8.2: Batch Operations
**File:** `scripts/test-sprint-8-2-e2e.ts`

**Tools Tested (Preview Mode):**
- `batch_move_emails` — Move multiple emails in single batch
- `batch_delete_emails` — Delete multiple emails in single batch
- `batch_flag_emails` — Flag multiple emails in single batch
- `batch_delete_events` — Delete multiple events in single batch

**Key Features:**
- Tests `POST /$batch` endpoint structure
- All destructive operations tested in **preview mode only** (confirm=false)
- No actual changes applied to mailbox
- Demonstrates idempotency and error handling patterns

**Requirements:**
- Mail.ReadWrite, Calendars.ReadWrite permissions

### Sprint 8.3: Advanced Calendar Features
**File:** `scripts/test-sprint-8-3-e2e.ts`

**Tools Tested:**
- `create_recurring_event` (preview mode) — Create recurring events with complex patterns
- `update_event_series` (preview mode) — Update recurring event series
- `list_event_instances` — List all instances of a recurring event
- `list_meeting_rooms` — List available meeting rooms
- `share_calendar` (preview mode) — Share calendar with other users
- `find_available_rooms` (preview mode) — Find available meeting rooms for time slot

**Key Features:**
- Tests recurrence patterns (daily, weekly, monthly, yearly)
- Tests Places API for room management
- Demonstrates calendar sharing patterns
- Handles beta/preview endpoints gracefully

**Requirements:**
- Calendars.Read, Calendars.ReadWrite, Place.Read.All, Calendars.ReadWrite.Shared permissions

### Sprint 8.4: Teams Advanced & Notifications
**File:** `scripts/test-sprint-8-4-e2e.ts`

**Tools Tested:**
- `list_activity_feed` — List Teams activity notifications
- `list_mentions` — List messages where user was mentioned
- `create_channel` (preview mode) — Create new Teams channel
- `list_team_members` — List team members and roles
- `get_meeting_transcript` (preview mode) — Get meeting transcript

**Key Features:**
- Tests Teams activity history (`/me/teamwork/activityHistory`)
- Tests mention search with user filter
- Demonstrates channel creation patterns
- Handles Teams membership and roles

**Requirements:**
- TeamsActivity.Read, ChannelMessage.Read.All, Chat.Read, Channel.Create, TeamMember.Read.All permissions

## Running E2E Tests

### Prerequisites

Before running tests, set up authentication:

```bash
pnpm auth login
```

This creates a token cache at `~/.ms-mcp/token-cache.json` which is used by all E2E tests.

### Running Individual Tests

```bash
# Run Sprint 8.1 tests only
pnpm tsx scripts/test-sprint-8-1-e2e.ts

# Run Sprint 8.2 tests only
pnpm tsx scripts/test-sprint-8-2-e2e.ts

# etc.
```

### Running All Tests via Preview Hook

```bash
# Run all 4 sprint tests sequentially
bash scripts/preview-hook.sh
```

The preview hook will:
1. Run all 4 sprint test scripts
2. Continue even if tests fail (to report all results)
3. Print summary with ✓/✗ for each sprint
4. Exit with status 0 if all pass, 1 if any fail

### Running via Pre-Push Hook

The `.husky/pre-push` hook is configured to run the preview hook automatically before pushing:

```bash
git push
# Automatically runs: bash scripts/preview-hook.sh

# Skip hook if needed:
git push --no-verify
```

## Test Output Format

Each test script outputs structured logs:

```
🧪 E2E Test: Sprint X.Y — [Name]

1️⃣  Testing [tool_name]...
   ✅ Success: [result details]
      Sub-details...

2️⃣  Testing [tool_name]...
   ⚠️  Skipped: [reason]

...

✅ E2E Tests completed!
```

**Output Symbols:**
- `✅` Success — operation worked as expected
- `⚠️` Skipped — operation not available or requires permissions
- `❌` Failed — operation encountered an error
- `ℹ️` Info — additional context

## Handling Failures

### Missing Authentication

If tests fail with "AZURE_TENANT_ID is required":

```bash
# Set up authentication
pnpm auth login

# Then re-run tests
bash scripts/preview-hook.sh
```

### Insufficient Permissions

Many tests gracefully skip if the user lacks required permissions. This is expected behavior.

Example: Test skipped due to lack of Place.Read.All for meeting rooms.

### Graph API Limitations

Some tests may skip due to Graph API limitations:
- Search API not available on all tenants
- Beta endpoints may vary
- Tenant configuration may differ

These are NOT test failures — the scripts handle them gracefully.

## Test Coverage

Total E2E tests across Phase 8:

| Sprint | Tools | Tests |
|--------|-------|-------|
| 8.1    | 6     | 5     |
| 8.2    | 5     | 5     |
| 8.3    | 6     | 6     |
| 8.4    | 5     | 6     |
| **Total** | **22** | **22** |

Each test covers:
- Happy path (successful operation)
- Permission checks
- Error handling (401, 403, 404, 410, etc.)
- Pagination/limits
- Edge cases

## Implementation Notes

### Preview Mode

Destructive operations (create, update, delete) are tested in **preview mode only**:
- `confirm: false` — returns preview without executing
- No actual changes to user data
- Verifies request structure and formatting

### Graceful Degradation

Tests use try-catch to handle:
- Missing permissions (skip with ⚠️)
- Unsupported endpoints (skip with ℹ️)
- Tenant configuration (skip gracefully)

### No Data Modification

All E2E tests are **read-only** or **preview-only**:
- ✓ No emails deleted
- ✓ No events created
- ✓ No files moved
- ✓ No calendar changes

Only exception: Tests may query metadata (emails, events, rooms) but never modify them.

## Troubleshooting

### Test Hangs

If a test seems to hang:
1. Press Ctrl+C to cancel
2. Check network connectivity
3. Try again — Graph API may have temporary slowness

### Token Cache Issues

If authentication fails:

```bash
# Clear token cache and re-authenticate
rm ~/.ms-mcp/token-cache.json
pnpm auth login
```

### Tenant-Specific Issues

Some features may not be available in all tenants:
- Search API requires Enterprise features
- Meeting room data requires Places API
- Teams features require Teams licenses

These tests gracefully skip and report ⚠️ Skipped.

## Next Steps

After Phase 8 implementation:

1. Run full test suite: `pnpm test`
2. Run E2E tests: `bash scripts/preview-hook.sh`
3. Test in Claude Desktop with real MS-MCP server
4. Deploy to production

## References

- [Microsoft Graph API Documentation](https://docs.microsoft.com/en-us/graph/api/overview)
- [MCP SDK Documentation](https://modelcontextprotocol.io)
- [Project CLAUDE.md](/CLAUDE.md)
