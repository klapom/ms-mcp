# Sprint 3.2 — Calendar Write Tools + Availability Check (Retrospective)

**Phase:** 3 (Kalender-Modul)
**Ziel:** 5 Calendar Write Tools (4 destructive + 1 safe)
**Status:** COMPLETE
**Test-Delta:** 473 → 516 (+43 tests in 5 test files)

---

## Features Implemented

### F-3.2.1: `create_event` (Destructive)

**Graph API:** POST /me/events (or /me/calendars/{id}/events)
**Klassifizierung:** destructive (confirm + idempotency_key)

**Functionality:**
- Create calendar event with subject, start/end (with timezone), location, body, attendees
- buildCreateRequestBody maps snake_case→Graph camelCase
- Attendee mapping: name + email required, type optional (required/optional/resource)
- Timezone support via DateTimeTimeZone sub-schema
- Preview → Execute pattern with confirmation

**Reusable Sub-Schemas:**
- `DateTimeTimeZone` — dateTime (ISO 8601) + timeZone (IANA)
- `AttendeeInput` — email + name + type (optional)
- `CreateEventParams` extends WriteParams

### F-3.2.2: `update_event` (Destructive)

**Graph API:** PATCH /me/events/{id}
**Klassifizierung:** destructive (confirm + idempotency_key)

**Functionality:**
- Update event fields (subject, start, end, location, body, attendees, etc.)
- UPDATABLE_FIELDS validation — only patches defined fields
- buildPatchBody excludes undefined values
- handleUpdateConfirmed extracted to reduce cognitive complexity
- Preview shows current vs new values
- Timezone-aware DateTime updates

**Constraints:**
- Cannot modify recurring events (Graph limitation)
- UPDATABLE_FIELDS: subject, start, end, location, body, attendees, categories, importance, sensitivity, showAs, isOnlineMeeting, reminderMinutesBeforeStart

### F-3.2.3: `delete_event` (Destructive)

**Graph API:** DELETE /me/events/{id}
**Klassifizierung:** destructive (confirm + idempotency_key)
**Response:** 204 No Content

**Functionality:**
- Delete single event (no recurring expansion)
- Preview does NOT include attendee count (DEFAULT_SELECT.event excludes attendees)
- Confirmation check, idempotency, success confirmation

### F-3.2.4: `respond_to_event` (Destructive)

**Graph API:** POST /me/events/{id}/{action} (action ∈ {accept, decline, tentativelyAccept})
**Klassifizierung:** destructive (confirm + idempotency_key)
**Guard:** isOrganizer check (reject if user is organizer)

**Functionality:**
- Accept, decline, or tentatively accept event invitation
- Optional comment with response
- Direct if(!parsed.confirm) instead of checkConfirmation helper (simplifies code)
- Organizer self-response detected and rejected

### F-3.2.5: `check_availability` (Safe, Non-Destructive)

**Graph API:** POST /me/calendar/getSchedule
**Klassifizierung:** safe (no confirm required)

**Functionality:**
- Check free/busy for 1–20 users in time window
- schedules array (1–20 email addresses)
- availabilityView decode: 0=free, 1=tentative, 2=busy, 3=oof (out-of-office), 4=workingElsewhere
- formatScheduleDetailLine extracted for complexity
- Returns per-user availability grid with 30-min intervals (configurable via availabilityViewInterval)

---

## New Files Created

| Datei | Zweck |
|---|---|
| `src/schemas/calendar-write.ts` | 5 Zod schemas + DateTimeTimeZone, AttendeeInput sub-schemas |
| `src/tools/calendar-create.ts` | create_event handler + buildCreateRequestBody |
| `src/tools/calendar-update.ts` | update_event handler + buildPatchBody + handleUpdateConfirmed |
| `src/tools/calendar-delete.ts` | delete_event handler |
| `src/tools/calendar-respond.ts` | respond_to_event handler |
| `src/tools/calendar-availability.ts` | check_availability handler + formatScheduleDetailLine |
| `tests/calendar-create.test.ts` | 8 tests (schema, API, formatting, errors) |
| `tests/calendar-update.test.ts` | 9 tests (schema, partial updates, UPDATABLE_FIELDS, isOrganizer, errors) |
| `tests/calendar-delete.test.ts` | 8 tests (schema, API, confirmation, idempotency, errors) |
| `tests/calendar-respond.test.ts` | 9 tests (schema, 3 actions, isOrganizer guard, errors) |
| `tests/calendar-availability.test.ts` | 9 tests (schema, 1–20 users, availabilityView decode, errors) |
| `tests/mocks/handlers/calendar-write.ts` | MSW handlers for all 5 write endpoints |

## Modified Files

| Datei | Änderung |
|---|---|
| `src/tools/calendar.ts` | Comment update (referencing new calendar-write tools) |
| `src/index.ts` | 5 new tool registrations (create_event, update_event, delete_event, respond_to_event, check_availability) |
| `tests/mocks/handlers/index.ts` | Spread calendarWriteHandlers alongside existing calendar handlers |

---

## MSW Handlers (`tests/mocks/handlers/calendar-write.ts`)

### create_event
- POST /me/events → 201 (returns created event with ID)
- POST /me/calendars/:calendarId/events → 201
- POST /users/:userId/events → 201 (multi-tenant)

### update_event
- PATCH /me/events/:eventId → 200 (returns updated event)
- PATCH /me/calendars/:calendarId/events/:eventId → 200
- PATCH /users/:userId/events/:eventId → 200 (multi-tenant)

### delete_event
- DELETE /me/events/:eventId → 204 No Content
- DELETE /me/calendars/:calendarId/events/:eventId → 204
- DELETE /users/:userId/events/:eventId → 204

### respond_to_event
- POST /me/events/:eventId/accept → 200
- POST /me/events/:eventId/decline → 200
- POST /me/events/:eventId/tentativelyAccept → 200
- POST /me/calendars/:calendarId/events/:eventId/accept → 200 (calendar-specific)

### check_availability
- POST /me/calendar/getSchedule → 200 (returns availabilityView strings + schedules)

---

## Tests Summary

**Total:** 43 new tests across 5 test files

### calendar-create.test.ts (~8 tests)
1. Schema: parse required/optional fields, validate DateTimeTimeZone
2. Attendee sub-schema: email required, type optional
3. API: create event, returns event with ID
4. Formatting: confirmation + event summary
5. Confirmation: preview without confirm, execute with confirm
6. Idempotency: duplicate creates rejected
7. Error: 400 invalid datetime → ValidationError
8. Error: 401 → AuthError

### calendar-update.test.ts (~9 tests)
1. Schema: event_id required, rest optional
2. UPDATABLE_FIELDS validation (rejects unsupported fields)
3. buildPatchBody: only includes defined fields
4. API: partial update (subject only)
5. API: update with attendees + location
6. Preview: shows current vs new values
7. isOrganizer guard: reject organizer self-update
8. Idempotency: duplicate updates safe
9. Error: 404 event not found → NotFoundError

### calendar-delete.test.ts (~8 tests)
1. Schema: event_id required, calendar_id optional
2. API: delete event, returns 204
3. Preview: does NOT include attendee count (not in DEFAULT_SELECT)
4. Confirmation check
5. Idempotency: duplicate deletes safe
6. Multi-tenant path
7. Error: 403 (organizer protection) → forbidden
8. Error: 404 → NotFoundError

### calendar-respond.test.ts (~9 tests)
1. Schema: event_id + action required (accept/decline/tentativelyAccept)
2. Optional comment with response
3. API: accept → 200
4. API: decline → 200
5. API: tentativelyAccept → 200
6. isOrganizer guard: reject organizer response (direct if check)
7. Confirmation + idempotency
8. Error: 400 invalid action → ValidationError
9. Error: 403 organizer → forbidden

### calendar-availability.test.ts (~9 tests)
1. Schema: 1–20 schedules (email addresses)
2. availabilityViewInterval optional (default 30 min)
3. API: single user availability
4. API: multiple users (2–5)
5. availabilityView decode: 0→free, 1→tentative, 2→busy, 3→oof, 4→workingElsewhere
6. formatScheduleDetailLine: renders availability grid correctly
7. Error: 0 or 21+ users → ValidationError
8. Error: 400 invalid datetime → ValidationError
9. Error: 429 rate limit → retryable error

---

## Review Fixes Applied

1. **checkConfirmation Workaround Removed** — respond_to_event uses direct `if(!parsed.confirm)` check instead of reusing checkConfirmation helper (simpler, clearer)
2. **Preview Accuracy** — delete_event preview correctly excludes attendee count (DEFAULT_SELECT.event doesn't include attendees field)
3. **isOrganizer Guard Test** — Added explicit test case ensuring organizer cannot respond to own event
4. **Attendee Count in Delete** — Verified delete_event preview omits attendee count (not available in DEFAULT_SELECT)

---

## Post-Sprint Adjustments

1. **formatEventSummary Enhancement** — Added event ID output so write tools can reference discovered events in subsequent operations
   - Allows Claude to say "Created event [ID: abc123def456]" for better UX

2. **Technical Debt Items Added to docs/TECHNICAL_DEBT.md:**
   - **TD-3.2.1:** Timezone Localization (mailboxSettings) — check user's preferred timezone instead of hardcoding Europe/Berlin
   - **TD-3.2.2:** proposedNewTime Support — update_event should support suggestedNewTime for tentative responders

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `WriteParams`, `BaseParams` | `src/schemas/common.ts` | All 5 write tools |
| `resolveUserPath()` | `src/schemas/common.ts` | All calendar write tools (multi-tenant) |
| `formatPreview()` | `src/utils/format-helpers.ts` | create, update, delete, respond |
| `idempotencyCache` | `src/utils/idempotency.ts` | create, update, delete, respond |
| `McpToolError`, `formatErrorForUser()` | `src/utils/errors.ts` | All 5 tools |
| `createLogger()` | `src/utils/logger.ts` | All 5 tools |
| `encodeGraphId()` | `src/utils/graph-id.ts` | All calendar write tools (event IDs) |
| `formatDateTimeRange()` | `src/utils/format-helpers.ts` | create, update (display start/end) |
| `formatEventSummary()` | `src/utils/format-helpers.ts` | create, update, delete, respond (output) |
| `DEFAULT_SELECT` | `src/utils/response-shaper.ts` | All write tools (shape responses) |
| `extractAddress()` | `src/utils/address-format.ts` | create, update (format attendees) |

---

## Build + Test Verification

1. ✅ `pnpm build` — all new files compile
2. ✅ `pnpm typecheck` — clean
3. ✅ `pnpm lint` — Biome clean (Complexity: formatScheduleDetailLine + handleUpdateConfirmed extracted)
4. ✅ `pnpm test` — 473 → 516 (+43 tests)
5. ✅ No regressions in existing tests
6. ✅ All 5 tools registered in index.ts
7. ✅ MSW handlers cover all write endpoints + error cases

---

## Akzeptanzkriterien

- [x] All 5 write tools (create, update, delete, respond, availability) fully implemented + tested
- [x] Destructive tools (create, update, delete, respond) have confirm + idempotency_key parameters
- [x] Confirmation preview pattern consistent with Sprint 2.2 (send_email, reply_email, forward_email)
- [x] Event ID properly encoded via `encodeGraphId()` in all tools
- [x] isOrganizer guard implemented in respond_to_event + delete_event (where applicable)
- [x] availabilityView correctly decoded (0–4 mapping)
- [x] Cognitive complexity: Biome compliance (formatScheduleDetailLine, handleUpdateConfirmed extracted)
- [x] 43 new tests covering happy path + errors + edge cases
- [x] No regressions in mail/calendar read-only tools
- [x] Technical debt documented (timezone localization, proposedNewTime)
