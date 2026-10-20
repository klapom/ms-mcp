# Phase 8 E2E Tests — Quick Start

## What Was Created

4 comprehensive E2E test scripts for Phase 8 (Advanced Features):

### Scripts
- `scripts/test-sprint-8-1-e2e.ts` — Search & Query Enhancements (5 tools)
- `scripts/test-sprint-8-2-e2e.ts` — Batch Operations (4 tools, preview mode)
- `scripts/test-sprint-8-3-e2e.ts` — Advanced Calendar Features (6 tools)
- `scripts/test-sprint-8-4-e2e.ts` — Teams Advanced & Notifications (5 tools)

### Hook Integration
- `scripts/preview-hook.sh` — Master test runner (executes all 4 sprints)
- `.husky/pre-push` — Git hook (runs preview-hook.sh before push)

### Documentation
- `docs/E2E_TESTS_PHASE_8.md` — Complete reference guide

## Quick Usage

### 1. Set Up Authentication

First time only:
```bash
cd /home/admin/projects/ms-mcp
pnpm auth login
```

This creates `~/.ms-mcp/token-cache.json` for E2E tests.

### 2. Run All Tests

```bash
bash scripts/preview-hook.sh
```

Output:
```
════════════════════════════════════════════════════════════
Phase 8 E2E Tests — Preview Hook
════════════════════════════════════════════════════════════

Running all 4 Sprint 8 E2E test scripts...
Note: If tests fail due to permissions, add --no-verify to skip: git push --no-verify

[1/4] Running Sprint 8.1 E2E tests (Search & Query)...
─────────────────────────────────────────────────────────
🧪 E2E Test: Sprint 8.1 — Search & Query Enhancements

1️⃣  Testing advanced_search_emails with KQL...
   ✓ Success: Found X email results
...
```

### 3. Run Individual Sprint Tests

```bash
# Sprint 8.1 only
pnpm tsx scripts/test-sprint-8-1-e2e.ts

# Sprint 8.2 only
pnpm tsx scripts/test-sprint-8-2-e2e.ts

# etc.
```

### 4. Automatic Testing on Git Push

```bash
git push
# Automatically runs all E2E tests before push
# Skip with: git push --no-verify
```

## Test Coverage by Sprint

### Sprint 8.1: Search & Query Enhancements
- ✅ advanced_search_emails (KQL)
- ✅ search_events (KQL)
- ✅ track_file_changes (delta sync)
- ✅ advanced_search_contacts (KQL)
- ✅ search_teams_messages (KQL)

### Sprint 8.2: Batch Operations (Preview Mode)
- ✅ batch_move_emails
- ✅ batch_delete_emails
- ✅ batch_flag_emails
- ✅ batch_delete_events

### Sprint 8.3: Advanced Calendar Features
- ✅ create_recurring_event (preview)
- ✅ update_event_series (preview)
- ✅ list_event_instances
- ✅ list_meeting_rooms
- ✅ share_calendar (preview)
- ✅ find_available_rooms (preview)

### Sprint 8.4: Teams Advanced & Notifications
- ✅ list_activity_feed
- ✅ list_mentions
- ✅ create_channel (preview)
- ✅ list_team_members
- ✅ get_meeting_transcript (preview)

## Key Features

✓ **Real Graph API Calls** — Tests against actual Microsoft 365 tenant
✓ **Preview Mode** — Destructive operations tested without modifying data
✓ **Graceful Degradation** — Skips unavailable features (missing permissions, tenant config)
✓ **Error Handling** — Proper handling of 401, 403, 404, 410 errors
✓ **No Data Loss** — Read-only or preview-only operations
✓ **Sequential Execution** — All 4 sprints run in order
✓ **Summary Report** — Shows ✓/✗ for each sprint

## Test Output Symbols

- `✅` Success — Operation worked
- `⚠️` Skipped — Feature not available (missing permissions/tenant config)
- `❌` Failed — Unexpected error
- `ℹ️` Info — Additional context

## Important Notes

### Authentication Required
```bash
# First time or if token expired:
pnpm auth login

# This creates ~/.ms-mcp/token-cache.json
# Used by all E2E test scripts
```

### Destructive Operations are Safe
All destructive operations (create, delete, move) use `confirm: false` (preview mode):
- No actual changes to user data
- Tests verify request structure only
- Safe to run in CI/CD pipelines

### Permissions May Vary
Some tests skip if the user lacks required permissions:
- Place.Read.All for meeting rooms
- TeamsActivity.Read for activity feed
- Channel.Create for channel creation
- etc.

This is **expected behavior**, not a test failure.

## File Structure

```
ms-mcp/
├── scripts/
│   ├── test-sprint-8-1-e2e.ts    # Search & Query tests
│   ├── test-sprint-8-2-e2e.ts    # Batch Operations tests
│   ├── test-sprint-8-3-e2e.ts    # Calendar tests
│   ├── test-sprint-8-4-e2e.ts    # Teams tests
│   └── preview-hook.sh            # Master test runner
├── .husky/
│   └── pre-push                   # Git hook (runs preview-hook.sh)
├── docs/
│   └── E2E_TESTS_PHASE_8.md       # Complete reference
└── PHASE_8_E2E_TESTS.md           # This file
```

## Troubleshooting

### Tests fail with "AZURE_TENANT_ID is required"
```bash
# Set up authentication:
pnpm auth login

# Clear and retry:
rm ~/.ms-mcp/token-cache.json
pnpm auth login
bash scripts/preview-hook.sh
```

### Tests hang or timeout
- Press Ctrl+C to cancel
- Check internet connection
- Try again — Graph API may have temporary slowness

### Tests skip with "⚠️ Skipped: Insufficient permissions"
This is expected. The user may not have required permissions.
Not a test failure — tests gracefully handle this.

### Tests skip with "ℹ️ No users/events/rooms found"
The tenant may not have test data for this feature.
Not a test failure — tests handle empty results gracefully.

## Next Steps

1. **Verify Tests Pass**
   ```bash
   bash scripts/preview-hook.sh
   ```

2. **Run Unit Tests**
   ```bash
   pnpm test
   ```

3. **Check Build**
   ```bash
   pnpm build
   pnpm typecheck
   pnpm lint
   ```

4. **Deploy E2E Tests in CI/CD**
   - Add to GitHub Actions, GitLab CI, etc.
   - Run `bash scripts/preview-hook.sh` in test stage
   - Use `--no-verify` on push if tests fail due to permissions

## References

- Full documentation: [docs/E2E_TESTS_PHASE_8.md](docs/E2E_TESTS_PHASE_8.md)
- Project instructions: [CLAUDE.md](CLAUDE.md)
- Sprint plans: [docs/sprints/SPRINT_8_*.md](docs/sprints/)
