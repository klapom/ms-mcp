# Sprint 8.1 — Search & Query Enhancements

**Phase:** 8 (Advanced Features)
**Goal:** Implement 6 advanced search and query tools with KQL support
**Status:** PLANNED
**Test-Delta:** ~850 → ~905 (+55 tests)

---

## Features to Implement

### F-8.1.1: `advanced_search_emails` (Safe)

**Graph API:** POST /search/query
**Classification:** safe (read-only)
**Permission:** Mail.Read

**Functionality:**
- Advanced email search using Keyword Query Language (KQL)
- Support complex queries: from, subject, hasAttachment, received date ranges
- Return top-ranked results with relevance scores
- Pagination via from/size (not top/skip)
- Example KQL: `from:john@example.com subject:quarterly hasAttachment:true received>=2026-01-01`

**Schema:** `src/schemas/search-advanced.ts` → `AdvancedSearchEmailsParams` (extends ListParams)
```typescript
AdvancedSearchEmailsParams = ListParams.extend({
  kql_query: z.string().min(1).max(1000).describe("KQL query for email search"),
  from: z.number().min(0).optional().describe("Result offset (default 0)"),
  size: z.number().min(1).max(50).optional().describe("Number of results (default 25)"),
  enable_query_interpretation: z.boolean().default(true).describe("Enable query spelling correction"),
  sort: z.array(z.object({
    property: z.enum(["receivedDateTime", "from", "subject"]),
    direction: z.enum(["ascending", "descending"])
  })).optional().describe("Sort criteria"),
})
```

**Key Implementation Details:**
- POST /search/query with body: `{ requests: [{ entityTypes: ["message"], query: { queryString: kqlQuery } }] }`
- Returns: hitsContainers[0].hits[] with resource (email), rank, summary
- KQL builder utility: `buildKqlQuery(filters)` in `src/utils/kql-builder.ts`
- Pagination: `from` (offset) + `size` (limit) instead of skip/top
- Response includes relevance score for ranking

---

### F-8.1.2: `search_events` (Safe)

**Graph API:** POST /search/query
**Classification:** safe (read-only)
**Permission:** Calendars.Read

**Functionality:**
- Advanced calendar event search using KQL
- Support queries: subject, location, attendees, date ranges
- Return events with relevance ranking
- Example KQL: `subject:"sprint planning" attendees:john@example.com start>=2026-02-01`

**Schema:** `src/schemas/search-advanced.ts` → `SearchEventsParams` (extends ListParams)
```typescript
SearchEventsParams = ListParams.extend({
  kql_query: z.string().min(1).max(1000).describe("KQL query for event search"),
  from: z.number().min(0).optional(),
  size: z.number().min(1).max(50).optional(),
})
```

**Key Implementation Details:**
- POST /search/query with entityTypes: ["event"]
- KQL supports: subject, location, attendees, start/end datetime ranges
- Response: hitsContainers[0].hits[] with event resource
- Format: Event subject | Location | Start-End | Attendees

---

### F-8.1.3: `track_file_changes` (Safe)

**Graph API:** GET /me/drive/root/delta
**Classification:** safe (read-only)
**Permission:** Files.Read

**Functionality:**
- Track OneDrive file changes using delta queries
- Return added/modified/deleted files since last sync
- Delta token for incremental sync
- Supports folder-specific tracking (optional folder_id)

**Schema:** `src/schemas/files-delta.ts` → `TrackFileChangesParams` (extends BaseParams)
```typescript
TrackFileChangesParams = BaseParams.extend({
  folder_id: z.string().optional().describe("Track changes in specific folder (default: root)"),
  delta_token: z.string().optional().describe("Token from previous request for incremental sync"),
})
```

**Key Implementation Details:**
- GET /me/drive/root/delta (initial) returns all items + @odata.deltaLink
- GET /me/drive/root/delta?token={deltaToken} returns only changes
- Response includes: @odata.deltaLink for next request
- Deleted items: { id, deleted: { state: "deleted" } }
- Format: [Added/Modified/Deleted] filename | size | timestamp
- Store delta token for next request (returned in response)

---

### F-8.1.4: `advanced_search_contacts` (Safe)

**Graph API:** POST /search/query
**Classification:** safe (read-only)
**Permission:** Contacts.Read

**Functionality:**
- Advanced contact search using KQL
- Support queries: displayName, emailAddress, companyName, jobTitle
- Return ranked contacts
- Example KQL: `displayName:john emailAddress:@example.com companyName:Microsoft`

**Schema:** `src/schemas/search-advanced.ts` → `AdvancedSearchContactsParams` (extends ListParams)
```typescript
AdvancedSearchContactsParams = ListParams.extend({
  kql_query: z.string().min(1).max(500).describe("KQL query for contact search"),
  from: z.number().min(0).optional(),
  size: z.number().min(1).max(50).optional(),
})
```

**Key Implementation Details:**
- POST /search/query with entityTypes: ["person"]
- KQL supports: displayName, emailAddress, companyName, jobTitle
- Response: person resource with rank
- Format: DisplayName | Email | Company | JobTitle

---

### F-8.1.5: `search_teams_messages` (Safe)

**Graph API:** POST /search/query
**Classification:** safe (read-only)
**Permission:** ChannelMessage.Read.All, Chat.Read

**Functionality:**
- Search across ALL Teams messages (channels + chats) using KQL
- Support queries: from, body content, date ranges
- Return messages with channel/chat context
- Example KQL: `from:john@example.com body:budget created>=2026-01-01`

**Schema:** `src/schemas/search-advanced.ts` → `SearchTeamsMessagesParams` (extends ListParams)
```typescript
SearchTeamsMessagesParams = ListParams.extend({
  kql_query: z.string().min(1).max(1000).describe("KQL query for Teams message search"),
  from: z.number().min(0).optional(),
  size: z.number().min(1).max(50).optional(),
})
```

**Key Implementation Details:**
- POST /search/query with entityTypes: ["chatMessage"]
- KQL supports: from, body, created datetime
- Response includes: message + parent channel/chat context
- Format: Sender: message preview | Channel/Chat | Timestamp

---

### F-8.1.6: `search_all` (Safe)

**Graph API:** POST /search/query
**Classification:** safe (read-only)
**Permission:** Mail.Read, Calendars.Read, Files.Read, Contacts.Read, ChannelMessage.Read.All, Chat.Read

**Functionality:**
- Universal search across ALL Microsoft 365 content types
- Single query searches: emails, events, files, contacts, Teams messages
- Return results grouped by entity type
- Useful for "find everything about project X" queries

**Schema:** `src/schemas/search-advanced.ts` → `SearchAllParams` (extends ListParams)
```typescript
SearchAllParams = ListParams.extend({
  query: z.string().min(1).max(500).describe("Search query (applied to all entity types)"),
  entity_types: z.array(z.enum(["message", "event", "driveItem", "person", "chatMessage"]))
    .optional()
    .describe("Filter by entity types (default: all)"),
  from: z.number().min(0).optional(),
  size: z.number().min(1).max(25).optional().describe("Results per entity type (default 10)"),
})
```

**Key Implementation Details:**
- POST /search/query with multiple entityTypes in single request
- Response: hitsContainers[] array (one per entity type)
- Group results by type: "Emails (5)", "Events (2)", "Files (8)", etc.
- Format per type: count + top 3 previews per type
- Full results available via type-specific search tools

---

## New Files to Create

| File | Purpose | Estimated LOC |
|---|---|---|
| `src/schemas/search-advanced.ts` | 6 Zod schemas for advanced search tools | ~120 |
| `src/schemas/files-delta.ts` | Delta tracking schema | ~30 |
| `src/utils/kql-builder.ts` | KQL query builder utilities | ~80 |
| `src/tools/search-emails-advanced.ts` | advanced_search_emails handler | ~100 |
| `src/tools/search-events.ts` | search_events handler | ~80 |
| `src/tools/files-delta.ts` | track_file_changes handler | ~90 |
| `src/tools/search-contacts-advanced.ts` | advanced_search_contacts handler | ~80 |
| `src/tools/search-teams-messages.ts` | search_teams_messages handler | ~90 |
| `src/tools/search-all.ts` | search_all handler + grouping logic | ~120 |
| `tests/search-emails-advanced.test.ts` | ~10 tests | ~150 |
| `tests/search-events.test.ts` | ~8 tests | ~120 |
| `tests/files-delta.test.ts` | ~10 tests | ~150 |
| `tests/search-contacts-advanced.test.ts` | ~8 tests | ~120 |
| `tests/search-teams-messages.test.ts` | ~9 tests | ~135 |
| `tests/search-all.test.ts` | ~10 tests | ~150 |
| `tests/mocks/handlers/search.ts` | MSW handlers for /search/query + delta | ~200 |

---

## Modified Files

| File | Changes |
|---|---|
| `src/index.ts` | Register 6 new search tools |
| `tests/mocks/handlers/index.ts` | Spread searchHandlers |

---

## KQL Query Builder Utility

Create `src/utils/kql-builder.ts`:

```typescript
export interface KqlFilter {
  property: string;
  operator: "=" | ":" | ">=" | "<=" | ">" | "<";
  value: string;
}

export function buildKqlQuery(filters: KqlFilter[]): string {
  return filters
    .map(f => {
      const value = f.value.includes(" ") ? `"${f.value}"` : f.value;
      return `${f.property}${f.operator}${value}`;
    })
    .join(" ");
}

export function parseKqlDate(dateStr: string): string {
  // Convert ISO 8601 to KQL format (YYYY-MM-DD)
  return dateStr.split("T")[0];
}
```

---

## MSW Handlers

### POST /search/query
- Handle `entityTypes: ["message"]` → return email results
- Handle `entityTypes: ["event"]` → return event results
- Handle `entityTypes: ["driveItem"]` → return file results
- Handle `entityTypes: ["person"]` → return contact results
- Handle `entityTypes: ["chatMessage"]` → return Teams message results
- Handle multiple entityTypes → return hitsContainers[] array

### GET /me/drive/root/delta
- Initial request (no token) → return all items + @odata.deltaLink with token
- Incremental request (with token) → return only changes since last sync
- Include deleted items with `{ deleted: { state: "deleted" } }`

---

## Tests Summary

**Total:** ~55 new tests across 6 test files

### search-emails-advanced.test.ts (~10 tests)
1. Schema: kql_query required, from/size optional
2. KQL: from:user@example.com
3. KQL: subject:"quarterly report"
4. KQL: hasAttachment:true
5. KQL: received>=2026-01-01 received<=2026-03-01
6. KQL: complex query with multiple filters
7. Pagination: from=10, size=20
8. Sort: by receivedDateTime descending
9. Empty results
10. Error: 400 invalid KQL syntax

### search-events.test.ts (~8 tests)
1. Schema: kql_query required
2. KQL: subject:"sprint"
3. KQL: location:"conference room"
4. KQL: attendees:john@example.com
5. KQL: start>=2026-02-01
6. Pagination: from/size
7. Empty results
8. Error: 403 insufficient permissions

### files-delta.test.ts (~10 tests)
1. Schema: delta_token optional
2. Initial sync: no token → full listing + deltaLink
3. Incremental sync: with token → changes only
4. Added files: new items in delta
5. Modified files: updated items
6. Deleted files: { deleted: { state: "deleted" } }
7. Folder-specific: folder_id filter
8. Empty delta: no changes
9. Format: [Added/Modified/Deleted] prefix
10. Error: 410 token expired

### search-contacts-advanced.test.ts (~8 tests)
1. Schema: kql_query required
2. KQL: displayName:john
3. KQL: emailAddress:@example.com
4. KQL: companyName:Microsoft
5. KQL: jobTitle:engineer
6. Pagination: from/size
7. Empty results
8. Error: 401 unauthorized

### search-teams-messages.test.ts (~9 tests)
1. Schema: kql_query required
2. KQL: from:user@example.com
3. KQL: body:budget
4. KQL: created>=2026-01-01
5. Channel context included
6. Chat context included
7. Pagination: from/size
8. Empty results
9. Error: 403 insufficient scope

### search-all.test.ts (~10 tests)
1. Schema: query required, entity_types optional
2. Default: searches all entity types
3. Filter: specific entity_types array
4. Grouping: results grouped by type
5. Format: count + top 3 per type
6. Mixed results: multiple types with hits
7. Partial results: some types with 0 hits
8. Empty: no results across all types
9. Pagination: from/size per type
10. Error: 400 invalid query

---

## Build + Test Verification

- [ ] `pnpm build` — all new files compile
- [ ] `pnpm typecheck` — strict mode clean
- [ ] `pnpm lint` — Biome clean (extract helpers if complexity >15)
- [ ] `pnpm test` — 850 → 905 (+55 tests)
- [ ] No regressions in existing tools
- [ ] All 6 tools registered in index.ts
- [ ] KQL builder utility unit tested

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `ListParams`, `BaseParams` | `src/schemas/common.ts` | All 6 tools |
| `resolveUserPath()` | `src/schemas/common.ts` | All tools (multi-tenant) |
| `createLogger()` | `src/utils/logger.ts` | All tools |
| `McpToolError` | `src/utils/errors.ts` | Error handling |

---

## Acceptance Criteria

- [ ] All 6 advanced search tools fully implemented + tested
- [ ] KQL query builder utility created and tested
- [ ] Delta tracking for files working with incremental sync
- [ ] Universal search groups results by entity type
- [ ] 55 new tests covering happy path + errors + edge cases
- [ ] No regressions in existing tools
- [ ] Documentation updated: TOOLS.md, PERMISSIONS.md
- [ ] E2E tests: advanced_search_emails, track_file_changes, search_all

---

## Known Limitations & Future Work

1. **KQL Syntax Validation:** Basic client-side validation only. Graph API returns 400 for invalid KQL.
2. **Delta Token Expiration:** Tokens expire after 30 days. Tool returns 410 Gone with instructions to re-sync.
3. **Search Ranking:** Relevance scores returned but not customizable (Graph API limitation).
4. **Cross-Tenant Search:** Not supported by Graph API /search/query endpoint.

---

## Implementation Notes

### KQL Query Examples

**Email:**
```
from:john@example.com subject:"budget report" hasAttachment:true received>=2026-01-01
```

**Events:**
```
subject:"sprint planning" location:"room 101" attendees:jane@example.com start>=2026-02-15
```

**Files:**
```
filename:budget extension:xlsx modified>=2026-01-01
```

**Contacts:**
```
displayName:john emailAddress:@pommerconsulting.de companyName:"Pommer IT"
```

**Teams Messages:**
```
from:admin@example.com body:"quarterly review" created>=2026-01-01
```

### Delta Query Flow

1. **Initial Sync:**
   - Request: GET /me/drive/root/delta
   - Response: all items + `@odata.deltaLink: "...?token=abc123"`
   - Store token for next request

2. **Incremental Sync:**
   - Request: GET /me/drive/root/delta?token=abc123
   - Response: only changed items + new deltaLink
   - Changes include: added (new items), modified (updated items), deleted ({ deleted: { state: "deleted" } })

3. **Token Expiration:**
   - HTTP 410 Gone
   - Clear stored token, restart with initial sync

---

## Post-Sprint Notes

Sprint 8.1 establishes advanced search capabilities using Microsoft Graph Search API and delta queries. The KQL query builder utility is designed to be extended in future sprints for more complex query construction. Delta tracking provides efficient file sync capabilities without fetching full listings on each request.

Performance note: /search/query has rate limits (Graph API: ~10 requests/second). Tools should be used for targeted searches, not continuous polling.
