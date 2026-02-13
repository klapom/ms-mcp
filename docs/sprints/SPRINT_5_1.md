# Sprint 5.1 — Teams Read Tools (Retrospective)

**Phase:** 5 (Teams + SharePoint)
**Goal:** Implement 5 read-only Teams tools for team/channel browsing
**Status:** COMPLETE
**Test-Delta:** 591 → 630 (+39 tests)

---

## Features Implemented

### F-5.1.1: `list_teams` (Safe)

**Graph API:** GET /me/joinedTeams
**Classification:** safe (read-only)
**Permission:** Team.ReadBasic.All

**Functionality:**
- List all teams the user is member of
- Returns team name, description, archive status, web URL
- No direct pagination support (Graph limitation)
- Client-side filtering for archive status if needed

**Schema:** `src/schemas/teams.ts` → `ListTeamsParams` (extends ListParams)
```typescript
ListTeamsParams = ListParams;  // Inherits user_id?, top?, skip?
```

**Key Implementation Details:**
- `/me/joinedTeams` does NOT support `$top`/`$skip` (Graph limitation)
- Client-side implementation handles pagination via fetching all, then slicing
- $select: id, displayName, description, isArchived, webUrl
- Format: Team name | isArchived | members count

**Graph API Limitation Note:**
- Cannot paginate with `$top`/`$skip` on `/me/joinedTeams`
- Workaround: fetch all teams, apply client-side pagination
- Performance impact: minimal for typical user (< 50 teams)

---

### F-5.1.2: `list_channels` (Safe)

**Graph API:** GET /teams/{id}/channels
**Classification:** safe (read-only)
**Permission:** ChannelSettings.Read.All

**Functionality:**
- List all channels in a team
- Returns channel name, description, membership type (standard/private), web URL
- Filter by membership type (standard, private)
- No pagination support on channel listing (Graph limitation)

**Schema:** `src/schemas/teams.ts` → `ListChannelsParams` (extends ListParams)
```typescript
ListChannelsParams = ListParams.extend({
  team_id: z.string().min(1).describe("The ID of the team"),
})
```

**Key Implementation Details:**
- `/teams/{id}/channels` does NOT support `$top`/`$skip`
- Client-side filtering if needed
- $select: id, displayName, description, membershipType, webUrl
- Format: Channel name | membershipType

**Graph API Limitation Note:**
- Cannot paginate `/teams/{id}/channels` (Graph API limitation)
- Fetch all, then client-side slice for consistency
- Typical teams have < 100 channels

---

### F-5.1.3: `list_channel_messages` (Safe)

**Graph API:** GET /teams/{id}/channels/{id}/messages
**Classification:** safe (read-only)
**Permission:** ChannelMessage.Read.All

**Functionality:**
- List messages in a Teams channel
- Returns sender, timestamp, message preview, importance
- Pagination via top/skip
- Newest messages first (ordered)

**Schema:** `src/schemas/teams.ts` → `ListChannelMessagesParams` (extends ListParams)
```typescript
ListChannelMessagesParams = ListParams.extend({
  team_id: z.string().min(1).describe("The ID of the team"),
  channel_id: z.string().min(1).describe("The ID of the channel"),
})
```

**Key Implementation Details:**
- $select: id, from, createdDateTime, body, importance, lastEditedDateTime
- Pagination: top (max 50), skip, @odata.nextLink
- Format: "Sender: message preview (timestamp) [importance]"
- Body truncated to 500 chars with "..." if longer

---

### F-5.1.4: `list_chats` (Safe)

**Graph API:** GET /me/chats
**Classification:** safe (read-only)
**Permission:** Chat.Read

**Functionality:**
- List all Teams chats (1-on-1, group, meeting)
- Filter by chat type (oneOnOne, group, meeting)
- Returns chat topic, type, last updated timestamp
- Pagination via top/skip

**Schema:** `src/schemas/teams.ts` → `ListChatsParams` (extends ListParams)
```typescript
ListChatsParams = ListParams.extend({
  chat_type: z.enum(["oneOnOne", "group", "meeting"]).optional()
    .describe("Filter by chat type"),
})
```

**Key Implementation Details:**
- $select: id, topic, chatType, lastUpdatedDateTime, webUrl
- Pagination: top, skip, @odata.nextLink
- Note: `/me/chats` does NOT support `$orderby` (Graph limitation)
- Format: "Chat type: topic (last updated)"

**Graph API Limitation Note:**
- Cannot use `$orderby` on `/me/chats`
- Results ordered by API default (usually by recency)

---

### F-5.1.5: `list_chat_messages` (Safe)

**Graph API:** GET /chats/{id}/messages
**Classification:** safe (read-only)
**Permission:** Chat.Read

**Functionality:**
- List messages in a Teams chat
- Returns sender, timestamp, message preview
- Pagination via top/skip
- Newest messages first

**Schema:** `src/schemas/teams.ts` → `ListChatMessagesParams` (extends ListParams)
```typescript
ListChatMessagesParams = ListParams.extend({
  chat_id: z.string().min(1).describe("The ID of the chat"),
})
```

**Key Implementation Details:**
- $select: id, from, createdDateTime, body
- Pagination: top (max 50), skip
- Format: "Sender: message preview (timestamp)"
- Body truncated to 500 chars

---

## New Files Created

| File | Purpose |
|---|---|
| `src/schemas/teams.ts` | 5 Zod schemas for Teams read tools |
| `src/tools/teams-list.ts` | list_teams handler |
| `src/tools/teams-channels.ts` | list_channels handler |
| `src/tools/teams-messages.ts` | list_channel_messages handler |
| `src/tools/teams-chats.ts` | list_chats + list_chat_messages handlers |
| `tests/teams-list.test.ts` | 8 tests |
| `tests/teams-channels.test.ts` | 7 tests |
| `tests/teams-messages.test.ts` | 8 tests |
| `tests/teams-chats.test.ts` | 8 tests |
| `tests/mocks/handlers/teams.ts` | MSW handlers for Teams read endpoints |

---

## Tests Summary

**Total:** 39 new tests across 4 test files

### teams-list.test.ts (~8 tests)
1. Schema: user_id optional (multi-tenant)
2. API: list teams
3. API: filter archived teams
4. Pagination: client-side (no Graph pagination)
5. Formatting: team name, archive status, member count
6. Error: 401 unauthorized
7. Empty teams list
8. Multi-tenant path

### teams-channels.test.ts (~7 tests)
1. Schema: team_id required
2. API: list channels in team
3. Filter: standard vs private channels
4. Pagination: client-side
5. Formatting: channel name, membership type
6. Error: 404 team not found
7. Empty channel list

### teams-messages.test.ts (~8 tests)
1. Schema: team_id, channel_id required
2. API: list channel messages
3. Pagination: top/skip + @odata.nextLink
4. Formatting: sender, timestamp, message preview (500 char truncation)
5. Importance indicator (normal/high/urgent)
6. Sort order: newest first
7. Error: 403 not authorized
8. Empty message list

### teams-chats.test.ts (~8 tests)
1. Schema: chat_type filter optional
2. API: list all chats
3. Filter: oneOnOne chats only
4. Filter: group chats only
5. Filter: meeting chats only
6. Pagination: top/skip
7. Formatting: chat type, topic, last updated
8. Error: 401 unauthorized

### teams-chat-messages.test.ts (~8 tests)
1. Schema: chat_id required
2. API: list chat messages
3. Pagination: top/skip
4. Formatting: sender, timestamp, message preview
5. Message body truncation (500 chars)
6. Sort order: newest first
7. Error: 404 chat not found
8. Empty message list

---

## Build + Test Verification

1. ✅ `pnpm build` — all new files compile
2. ✅ `pnpm typecheck` — strict mode clean
3. ✅ `pnpm lint` — Biome clean
4. ✅ `pnpm test` — 591 → 630 (+39 tests)
5. ✅ No regressions in existing tools
6. ✅ All 5 tools registered in index.ts

---

## MSW Handlers

### list_teams
- GET /me/joinedTeams → array of teams
- Simulates Graph limitation: no `$top`/`$skip` support
- Returns: id, displayName, description, isArchived, webUrl

### list_channels
- GET /teams/{id}/channels → array of channels
- Simulates Graph limitation: no pagination
- Includes both standard and private channels

### list_channel_messages
- GET /teams/{id}/channels/{id}/messages → array of messages
- Supports pagination: top/skip, @odata.nextLink
- Returns: id, from, createdDateTime, body, importance

### list_chats
- GET /me/chats → array of chats
- Optional filter by chatType
- Simulates Graph limitation: no `$orderby`

### list_chat_messages
- GET /chats/{id}/messages → array of messages
- Supports pagination: top/skip
- Returns: id, from, createdDateTime, body

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `ListParams` | `src/schemas/common.ts` | All 5 Teams tools |
| `resolveUserPath()` | `src/schemas/common.ts` | list_teams (multi-tenant) |
| `encodeGraphId()` | `src/utils/graph-id.ts` | All Teams tools |
| `fetchPage()` | `src/utils/pagination.ts` | list_channel_messages, list_chats, list_chat_messages |
| `DEFAULT_SELECT` | `src/utils/response-shaper.ts` | All Teams tools |
| `createLogger()` | `src/utils/logger.ts` | All Teams tools |

---

## Known Limitations

1. **list_teams no pagination:** Graph API limitation on `/me/joinedTeams`. Fetch all, then client-side pagination.
2. **list_channels no pagination:** Graph API limitation on `/teams/{id}/channels`. Client-side slicing applied.
3. **list_chats no ordering:** Graph API limitation: `$orderby` not supported on `/me/chats`.
4. **Message preview truncation:** Bodies truncated to 500 chars. Full body available in Phase 5.2+ tools if needed.

---

## Acceptance Criteria

- [x] All 5 read-only Teams tools fully implemented + tested
- [x] Graph API limitations documented (no pagination on list_teams, list_channels; no $orderby on list_chats)
- [x] Client-side pagination implemented where Graph pagination not available
- [x] 39 new tests covering happy path + errors + edge cases
- [x] No regressions in existing tools (Mail, Calendar, OneDrive)
- [x] All tools properly registered in index.ts
- [x] Coverage thresholds maintained (60/50/60/60)

---

## Post-Sprint Notes

Sprint 5.1 establishes the Teams read tooling foundation. Key learnings:
- Graph API has pagination limitations on certain endpoints (list_teams, list_channels, list_chats $orderby)
- These are documented and handled gracefully via client-side filtering where needed
- Message truncation (500 chars) balances context usage with information density

Phase 5.2 will add write tools (send_channel_message, reply_to_channel_message, send_chat_message) and SharePoint foundations.
