# Sprint 9.4 — Presence

**Phase:** 9 (Complete Microsoft 365 Coverage)
**Goal:** Enable real-time presence and status management capabilities
**Status:** PLANNED
**Test-Delta:** ~1,240 → ~1,252 (+12 tests)

---

## Features to Implement

### F-9.4.1: `get_my_presence` (Safe)

**Graph API:** GET /me/presence
**Classification:** safe (read-only)
**Permission:** Presence.Read.All

**Functionality:**
- Retrieve current user's presence status
- Returns availability (Available, Busy, Away, BeRightBack, Offline, etc.)
- Return activity (InACall, InAMeeting, Presenting, etc.)
- Include custom status message if set
- No parameters required

**Schema:** `src/schemas/presence.ts` → `GetMyPresenceParams` (extends BaseParams)
```typescript
GetMyPresenceParams = BaseParams
```

**Key Implementation Details:**
- GET /me/presence with $select: ["id", "availability", "activity", "statusMessage"]
- Availability values: Available, Busy, Away, BeRightBack, DoNotDisturb, Offline, PresenceUnknown
- Activity values: InACall, InAMeeting, Presenting, InAConferenceCall, etc.
- Status message: Custom user-set message (may be empty)
- Response format: "Availability: [status] | Activity: [activity] | Status: [message]"
- No confirmation needed (safe read operation)

---

### F-9.4.2: `get_presence` (Safe)

**Graph API:** GET /users/{id}/presence
**Classification:** safe (read-only)
**Permission:** Presence.Read.All

**Functionality:**
- Retrieve presence status of another user
- Requires user ID (or UPN for cross-tenant lookup)
- Returns same presence data as get_my_presence
- Subject to privacy controls (may be limited/unavailable)

**Schema:** `src/schemas/presence.ts` → `GetPresenceParams` (extends BaseParams)
```typescript
GetPresenceParams = BaseParams.extend({
  user_id: z.string().min(1).describe("User ID or UPN of the user to check presence for"),
})
```

**Key Implementation Details:**
- GET /users/{userId}/presence with $select
- User ID can be GUID or UPN (e.g., user@example.com)
- Returns same fields as /me/presence
- Privacy: Limited presence may be returned (e.g., "Busy" without activity)
- Response format: Same as get_my_presence

---

### F-9.4.3: `set_status_message` (Destructive)

**Graph API:** POST /me/presence/setStatusMessage
**Classification:** destructive (write, modifies user status)
**Permission:** Presence.ReadWrite

**Functionality:**
- Set custom status message
- Optional expiration date/time
- Empty message clears previous status
- Confirmation pattern for safety
- Idempotency for duplicate prevention

**Schema:** `src/schemas/presence.ts` → `SetStatusMessageParams` (extends WriteParams)
```typescript
SetStatusMessageParams = WriteParams.extend({
  message: z.string().max(280).optional().describe("Custom status message (empty = clear)"),
  expires_at: z.string().datetime().optional().describe("ISO 8601 datetime for expiration (optional)"),
})
```

**Key Implementation Details:**
- POST /me/presence/setStatusMessage with request body
- Payload: `{ statusMessage: { message: "...", expiresAt: "2026-02-20T10:00:00Z" } }`
- Empty message: Omit `message` field or set to empty string to clear
- Returns 200 with updated presence
- Preview format: "Setting status: '[message]'" or "Clearing status message"
- Confirmation required (destructive)
- Idempotency key for replay protection

---

## Test Plan

### get_my_presence (~4 tests)
- [ ] Schema: Empty params valid (extends BaseParams)
- [ ] Happy path: Get presence → returns availability + activity + status
- [ ] Availability: "Available" status returned correctly
- [ ] Status message: Custom message included if set

### get_presence (~4 tests)
- [ ] Schema: user_id required
- [ ] Happy path: Get another user's presence → returns data
- [ ] User ID by GUID: Works with user ID format
- [ ] User ID by UPN: Works with email format
- [ ] Error: 404 User not found

### set_status_message (~4 tests)
- [ ] Schema: message optional, expires_at optional
- [ ] Schema: confirm=false returns preview only (no change)
- [ ] Happy path: Set status → confirmation required, message set
- [ ] Clear status: Empty message clears previous status
- [ ] Expiration: Message expires at specified datetime
- [ ] Idempotency: Same idempotency_key returns same result
- [ ] Error: 400 Message too long (>280 chars)
- [ ] Preview format: Shows current → new message

---

## New Files to Create

| File | Purpose | Estimated LOC |
|---|---|---|
| `src/schemas/presence.ts` | 3 Zod schemas (get_my_presence, get_presence, set_status_message) | ~60 |
| `src/tools/presence.ts` | All 3 presence tools in single module | ~120 |
| `tests/presence.test.ts` | ~12 tests for presence operations | ~160 |
| `tests/mocks/handlers/presence.ts` | MSW handlers for /me/presence endpoints | ~200 |

---

## Modified Files

| File | Changes |
|---|---|
| `src/index.ts` | Register presence module with 3 tools |
| `src/utils/response-shaper.ts` | Add presence to DEFAULT_SELECT |
| `tests/mocks/handlers/index.ts` | Spread presenceHandlers |

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `BaseParams`, `WriteParams` | `src/schemas/common.js` | All 3 tools |
| `createLogger()` | `src/utils/logger.js` | All tools |
| `McpToolError` | `src/utils/errors.js` | Error handling |
| `resolveUserPath()` | `src/schemas/common.js` | Multi-tenant support |
| `encodeGraphId()` | `src/utils/graph-id.js` | User ID encoding |

---

## Acceptance Criteria

- [ ] All 3 presence tools fully implemented + tested
- [ ] get_my_presence working (current user status)
- [ ] get_presence working (other users by ID/UPN)
- [ ] set_status_message working with expiration
- [ ] 12 new tests covering happy path + errors
- [ ] No regressions in existing tools
- [ ] NEW SCOPE: `Presence.ReadWrite` added to DEFAULT_SCOPES and Azure Portal
- [ ] Documentation updated: TOOLS.md, PERMISSIONS.md, SCOPES.md
- [ ] E2E tests: get_my_presence → set_status_message → get_presence verification

---

## Known Limitations & Future Work

1. **Limited AI Use Cases:** Presence primarily useful for user availability context, not for automation.
2. **Availability Control:** Cannot set availability directly (only system can change based on activity). Tool only controls status message.
3. **Privacy Controls:** Admin can limit presence visibility. Full presence may not be available for all users.
4. **Status Message Max:** Graph API limits to 280 characters (similar to social media limits).
5. **Expiration Granularity:** Expiration times rounded to nearest minute by Graph API.
6. **Status Synchronization:** Changes may take 1-2 seconds to propagate to other clients.
7. **Activity-Based Presence:** User activity (calls, meetings) automatically updates availability. Tool cannot override.

---

## Implementation Notes

### DEFAULT_SELECT Fields

```typescript
const DEFAULT_SELECT = {
  presence: ["id", "availability", "activity", "statusMessage"],
};
```

### Availability States

```typescript
const AVAILABILITY_STATES = [
  "Available",           // User is available
  "Busy",               // User is busy
  "Away",               // User away (idle > 5 min)
  "BeRightBack",        // User will be back soon
  "DoNotDisturb",       // User has DND enabled
  "Offline",            // User offline
  "PresenceUnknown",    // Presence unknown/unavailable
];
```

### Activity States

```typescript
const ACTIVITY_STATES = [
  "InACall",                    // In call
  "InAMeeting",                 // In meeting
  "Presenting",                 // Presenting
  "InAConferenceCall",          // In conference call
  "InAGroupCall",               // In group call
  "Idle",                       // Idle
  "OffWork",                    // Off work
  "Available",                  // Available
  "OnThePhone",                 // On phone
  "PresenceUnknown",            // Unknown activity
];
```

### Get Presence Response Format

```typescript
interface PresenceResponse {
  id: string;                    // Presence entry ID
  availability: string;          // Availability state
  activity: string;              // Current activity
  statusMessage: {
    message: string;
    expiresAt?: string;           // ISO 8601
  };
}
```

### Set Status Message Request

```typescript
interface SetStatusMessageRequest {
  statusMessage: {
    message: string;             // May be empty to clear
    expiresAt?: string;           // ISO 8601 datetime
  };
}
```

### Formatting Presence for Response

```typescript
function formatPresenceDetail(presence: PresenceResponse): string {
  const lines = [
    `Availability: ${presence.availability}`,
    `Activity: ${presence.activity}`,
  ];

  if (presence.statusMessage?.message) {
    lines.push(`Status: "${presence.statusMessage.message}"`);
    if (presence.statusMessage.expiresAt) {
      const expires = new Date(presence.statusMessage.expiresAt);
      lines.push(`Expires: ${expires.toLocaleString()}`);
    }
  }

  return lines.join("\n");
}
```

### Set Status Message Flow

1. **Preview (confirm=false):**
   ```
   Current status: "In meeting"
   New status: "Working from home"
   Expires: 2026-02-20T17:00:00Z
   ```

2. **Execute (confirm=true):**
   ```
   POST /me/presence/setStatusMessage
   {
     "statusMessage": {
       "message": "Working from home",
       "expiresAt": "2026-02-20T17:00:00Z"
     }
   }
   → Returns 200 with updated presence
   ```

3. **Idempotency:**
   ```
   Same idempotency_key → Same response, no duplicate execution
   ```

---

## Post-Sprint Notes

Sprint 9.4 completes Phase 9 with presence and status capabilities. While presence has limited AI use cases (primarily useful for context like "is user available for interruption?"), it completes the Microsoft 365 API coverage. The tools are straightforward to implement and test. The decision to not support availability control is intentional—Graph API doesn't allow direct availability changes; only status messages and system-based activity changes are permitted. Presence tools integrate naturally with the existing infrastructure and require no new utilities.

