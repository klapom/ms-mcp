# Sprint 8.3 — Advanced Calendar Features

**Phase:** 8 (Advanced Features)
**Goal:** Implement 6 advanced calendar tools for recurring events and meeting rooms
**Status:** PLANNED
**Test-Delta:** ~955 → ~1015 (+60 tests)

---

## New Permissions Required

| Scope | Reason |
|---|---|
| `Place.Read.All` | Read meeting room availability and properties |
| `Calendars.ReadWrite.Shared` | Share calendars with other users |

---

## Features to Implement

### F-8.3.1: `create_recurring_event` (Destructive)

**Graph API:** POST /me/events
**Classification:** destructive
**Permission:** Calendars.ReadWrite

**Functionality:**
- Create recurring calendar events (daily, weekly, monthly, yearly)
- Support complex recurrence patterns (e.g., "every 2nd Tuesday")
- Define recurrence range (end date, number of occurrences, or no end)
- All standard event properties (attendees, location, reminders)
- Destructive safety: confirm + idempotency + preview

**Schema:** `src/schemas/calendar-recurrence.ts` → `CreateRecurringEventParams` (extends WriteParams)
```typescript
// Reuse DateTimeTimeZone from calendar-write.ts

RecurrencePattern = z.object({
  type: z.enum(["daily", "weekly", "monthly", "yearly", "absoluteMonthly", "absoluteYearly", "relativeMonthly", "relativeYearly"])
    .describe("Recurrence type"),
  interval: z.number().min(1).max(99).default(1)
    .describe("Interval between occurrences (e.g., 2 = every 2 weeks)"),
  days_of_week: z.array(z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]))
    .optional()
    .describe("Days of week for weekly recurrence"),
  day_of_month: z.number().min(1).max(31).optional()
    .describe("Day of month for monthly recurrence"),
  month: z.number().min(1).max(12).optional()
    .describe("Month for yearly recurrence"),
  first_day_of_week: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
    .default("monday")
    .describe("First day of week for calculations"),
});

RecurrenceRange = z.object({
  type: z.enum(["endDate", "noEnd", "numbered"])
    .describe("Recurrence range type"),
  start_date: z.string().describe("Start date (YYYY-MM-DD)"),
  end_date: z.string().optional()
    .describe("End date for 'endDate' type (YYYY-MM-DD)"),
  number_of_occurrences: z.number().min(1).max(999).optional()
    .describe("Number of occurrences for 'numbered' type"),
});

CreateRecurringEventParams = WriteParams.extend({
  subject: z.string().min(1).max(255).describe("Event subject"),
  start: DateTimeTimeZone.describe("Start date/time of first occurrence"),
  end: DateTimeTimeZone.describe("End date/time of first occurrence"),
  recurrence_pattern: RecurrencePattern.describe("Recurrence pattern"),
  recurrence_range: RecurrenceRange.describe("Recurrence range"),
  location: z.string().optional(),
  body: z.string().optional(),
  body_type: z.enum(["text", "html"]).default("text"),
  attendees: z.array(AttendeeInput).optional(),  // Reuse from calendar-write.ts
  is_reminder_on: z.boolean().optional(),
  reminder_minutes_before_start: z.number().min(0).max(40320).optional(),
  is_online_meeting: z.boolean().optional(),
});
```

**Key Implementation Details:**
- POST /me/events with `recurrence` property
- Graph API recurrence structure:
  ```json
  {
    "recurrence": {
      "pattern": {
        "type": "weekly",
        "interval": 2,
        "daysOfWeek": ["tuesday", "thursday"]
      },
      "range": {
        "type": "endDate",
        "startDate": "2026-02-15",
        "endDate": "2026-12-31"
      }
    }
  }
  ```
- Preview: "Create recurring event 'Sprint Planning' (every 2 weeks on Tuesday, 20 occurrences)"
- Validation: weekly recurrence requires days_of_week
- Validation: monthly/yearly require day_of_month or month
- Idempotency: cache key includes subject + start + recurrence hash

---

### F-8.3.2: `update_event_series` (Destructive)

**Graph API:** PATCH /me/events/{seriesMasterId}
**Classification:** destructive
**Permission:** Calendars.ReadWrite

**Functionality:**
- Update recurring event series (changes apply to all future occurrences)
- Modify subject, location, time, attendees, recurrence pattern
- Cannot change past occurrences (Graph API limitation)
- Destructive safety: confirm + idempotency + preview

**Schema:** `src/schemas/calendar-recurrence.ts` → `UpdateEventSeriesParams` (extends WriteParams)
```typescript
UpdateEventSeriesParams = WriteParams.extend({
  series_master_id: z.string().min(1).describe("Series master event ID"),
  subject: z.string().min(1).max(255).optional(),
  start: DateTimeTimeZone.optional(),
  end: DateTimeTimeZone.optional(),
  location: z.string().optional(),
  body: z.string().optional(),
  body_type: z.enum(["text", "html"]).optional(),
  attendees: z.array(AttendeeInput).optional(),
  recurrence_pattern: RecurrencePattern.optional(),
  recurrence_range: RecurrenceRange.optional(),
});
```

**Key Implementation Details:**
- PATCH /me/events/{seriesMasterId} (NOT instance ID!)
- Only update defined fields (partial update pattern from update_event)
- Changes apply to all future occurrences, not past
- Preview: "Update event series 'Team Sync' (15 future occurrences)"
- Get occurrence count via /me/events/{id}/instances?$top=1000&$count=true
- Idempotency: cache key includes series_master_id + update hash

---

### F-8.3.3: `list_event_instances` (Safe)

**Graph API:** GET /me/events/{seriesMasterId}/instances
**Classification:** safe (read-only)
**Permission:** Calendars.Read

**Functionality:**
- List all instances of a recurring event series
- Filter by date range (start/end parameters)
- Returns individual occurrences with actual dates/times
- Pagination support
- Shows exceptions (cancelled/modified instances)

**Schema:** `src/schemas/calendar-recurrence.ts` → `ListEventInstancesParams` (extends ListParams)
```typescript
ListEventInstancesParams = ListParams.extend({
  series_master_id: z.string().min(1).describe("Series master event ID"),
  start_date_time: z.string().optional().describe("Filter: instances after this date (ISO 8601)"),
  end_date_time: z.string().optional().describe("Filter: instances before this date (ISO 8601)"),
});
```

**Key Implementation Details:**
- GET /me/events/{id}/instances
- Query params: startDateTime={iso8601}&endDateTime={iso8601}
- $select: id, subject, start, end, location, isCancelled, type (occurrence, exception)
- Format: "Instance: 2026-03-15 10:00-11:00 | Location | [Cancelled]"
- Show exception indicator for modified instances
- Pagination: top/skip, @odata.nextLink

---

### F-8.3.4: `list_meeting_rooms` (Safe)

**Graph API:** GET /places/microsoft.graph.room
**Classification:** safe (read-only)
**Permission:** Place.Read.All

**Functionality:**
- List all meeting rooms in the organization
- Filter by building, floor, capacity
- Returns room name, email, capacity, equipment (projector, phone, etc.)
- Used for booking rooms in events

**Schema:** `src/schemas/calendar-rooms.ts` → `ListMeetingRoomsParams` (extends ListParams)
```typescript
ListMeetingRoomsParams = ListParams.extend({
  building: z.string().optional().describe("Filter by building name"),
  floor: z.string().optional().describe("Filter by floor"),
  min_capacity: z.number().min(1).optional().describe("Minimum room capacity"),
});
```

**Key Implementation Details:**
- GET /places/microsoft.graph.room
- $filter: building eq 'Building A' or capacity ge 10
- $select: id, displayName, emailAddress, capacity, building, floorNumber, audioDeviceName, videoDeviceName, displayDeviceName
- Format: "Room: Conference Room A | Building 1, Floor 3 | Capacity: 12 | Equipment: Projector, Phone"
- Pagination: top/skip
- Client-side filtering if $filter not supported for building/floor

---

### F-8.3.5: `find_available_rooms` (Safe)

**Graph API:** POST /me/findRooms or POST /me/findMeetingTimes
**Classification:** safe (read-only)
**Permission:** Place.Read.All, Calendars.Read

**Functionality:**
- Find meeting rooms available for a specific time slot
- Check room availability (free/busy) for date/time range
- Filter by capacity, building, equipment
- Returns list of available rooms sorted by relevance
- Integrates with check_availability from Phase 3

**Schema:** `src/schemas/calendar-rooms.ts` → `FindAvailableRoomsParams` (extends BaseParams)
```typescript
FindAvailableRoomsParams = BaseParams.extend({
  start: DateTimeTimeZone.describe("Meeting start date/time"),
  end: DateTimeTimeZone.describe("Meeting end date/time"),
  min_capacity: z.number().min(1).optional().describe("Minimum room capacity"),
  building: z.string().optional().describe("Filter by building"),
  equipment: z.array(z.enum(["projector", "phone", "videoConferencing", "whiteboard"]))
    .optional()
    .describe("Required equipment"),
});
```

**Key Implementation Details:**
- POST /me/calendar/getSchedule for room email addresses
- First: list_meeting_rooms with filters → get room list
- Then: check availability for each room via getSchedule
- Filter: free (availabilityView = "0") during time slot
- Sort: by capacity (closest to min_capacity), then building
- Format: "Available: Conference Room B | Capacity: 10 | Building 2 | Equipment: Projector, Phone"
- Limit: check max 20 rooms per request (Graph API limit)

---

### F-8.3.6: `share_calendar` (Destructive)

**Graph API:** POST /me/calendar/calendarPermissions
**Classification:** destructive
**Permission:** Calendars.ReadWrite.Shared

**Functionality:**
- Share calendar with other users
- Set permission level (read, write, delegate)
- Send sharing invitation email
- Returns permission ID for management
- Destructive safety: confirm + idempotency + preview

**Schema:** `src/schemas/calendar-sharing.ts` → `ShareCalendarParams` (extends WriteParams)
```typescript
ShareCalendarParams = WriteParams.extend({
  recipient_email: z.string().email().describe("Email of user to share calendar with"),
  role: z.enum(["freeBusyRead", "limitedRead", "read", "write", "delegateWithoutPrivateEventAccess", "delegateWithPrivateEventAccess"])
    .describe("Permission level"),
  send_invitation: z.boolean().default(true).describe("Send email invitation to recipient"),
});
```

**Key Implementation Details:**
- POST /me/calendar/calendarPermissions
- Body: `{ emailAddress: { address: recipientEmail }, role: role }`
- Roles:
  - `freeBusyRead`: See only free/busy times
  - `limitedRead`: See free/busy + subject/location
  - `read`: See all details (read-only)
  - `write`: See all + create/edit/delete
  - `delegate*`: Act as calendar owner
- Preview: "Share calendar with john@example.com (Permission: read, Send invitation: yes)"
- Returns: permission ID (for later revocation)
- Idempotency: cache key includes recipient_email + role

---

## New Files to Create

| File | Purpose | Estimated LOC |
|---|---|---|
| `src/schemas/calendar-recurrence.ts` | RecurrencePattern, RecurrenceRange, 3 event schemas | ~150 |
| `src/schemas/calendar-rooms.ts` | 2 meeting room schemas | ~60 |
| `src/schemas/calendar-sharing.ts` | ShareCalendarParams schema | ~30 |
| `src/tools/calendar-recurring.ts` | create_recurring_event, update_event_series | ~200 |
| `src/tools/calendar-instances.ts` | list_event_instances handler | ~100 |
| `src/tools/calendar-rooms.ts` | list_meeting_rooms, find_available_rooms | ~180 |
| `src/tools/calendar-sharing.ts` | share_calendar handler | ~100 |
| `tests/calendar-recurring.test.ts` | ~20 tests (create + update series) | ~300 |
| `tests/calendar-instances.test.ts` | ~10 tests | ~150 |
| `tests/calendar-rooms.test.ts` | ~18 tests (list + find available) | ~270 |
| `tests/calendar-sharing.test.ts` | ~12 tests | ~180 |
| `tests/mocks/handlers/calendar-recurrence.ts` | MSW handlers for recurrence endpoints | ~150 |
| `tests/mocks/handlers/calendar-rooms.ts` | MSW handlers for /places, findRooms | ~100 |

---

## Modified Files

| File | Changes |
|---|---|
| `src/index.ts` | Register 6 new calendar tools |
| `src/schemas/calendar-write.ts` | Export AttendeeInput, DateTimeTimeZone for reuse |
| `tests/mocks/handlers/index.ts` | Spread calendarRecurrenceHandlers, calendarRoomHandlers |

---

## Tests Summary

**Total:** ~60 new tests across 4 test files

### calendar-recurring.test.ts (~20 tests)

**create_recurring_event:**
1. Schema: subject, start, end, recurrence_pattern, recurrence_range required
2. Schema: recurrence_pattern.type enum validation
3. Schema: recurrence_range.type enum validation
4. Schema: weekly requires days_of_week
5. Preview: shows pattern summary
6. API: create daily recurrence (7 days, endDate)
7. API: create weekly recurrence (every 2 weeks on Tue/Thu)
8. API: create monthly recurrence (1st Monday of month)
9. API: create yearly recurrence (Feb 14th)
10. API: numbered range (10 occurrences)
11. API: noEnd range (forever)
12. Idempotency: cached after first creation
13. Format: preview includes occurrence count estimate
14. Error: invalid days_of_week for daily
15. Error: missing end_date for endDate range type

**update_event_series:**
16. Schema: series_master_id required
17. Preview: shows series + future occurrence count
18. API: update series subject
19. API: update series time (start/end)
20. API: update recurrence pattern (weekly → monthly)

### calendar-instances.test.ts (~10 tests)
1. Schema: series_master_id required
2. API: list all instances (no filter)
3. API: filter by start_date_time
4. API: filter by end_date_time
5. API: filter by both start and end
6. Format: instance date/time, location
7. Show exception indicator (modified instance)
8. Show cancelled indicator
9. Pagination: top/skip
10. Error: 404 series not found

### calendar-rooms.test.ts (~18 tests)

**list_meeting_rooms:**
1. Schema: building, floor, min_capacity optional
2. API: list all rooms
3. Filter: by building
4. Filter: by floor
5. Filter: by min_capacity
6. Format: room name, building, floor, capacity, equipment
7. Pagination: top/skip
8. Empty: no rooms found
9. Error: 403 insufficient permission

**find_available_rooms:**
10. Schema: start, end required
11. Schema: min_capacity, building, equipment optional
12. API: find available rooms for time slot
13. Filter: by min_capacity (capacity >= min)
14. Filter: by building
15. Filter: by equipment (projector, phone)
16. Sort: by capacity (closest to min)
17. Format: available room details
18. Empty: no available rooms

### calendar-sharing.test.ts (~12 tests)
1. Schema: recipient_email required (email format)
2. Schema: role enum validation
3. Preview: shows recipient + role + invitation
4. API: share with read permission
5. API: share with write permission
6. API: share with delegate permission
7. Send invitation: true
8. Send invitation: false
9. Idempotency: cached result
10. Returns: permission ID
11. Error: 400 invalid email
12. Error: 403 insufficient permission

---

## Build + Test Verification

- [ ] `pnpm build` — all new files compile
- [ ] `pnpm typecheck` — strict mode clean
- [ ] `pnpm lint` — Biome clean (extract helpers if complexity >15)
- [ ] `pnpm test` — 955 → 1015 (+60 tests)
- [ ] No regressions in existing tools
- [ ] All 6 tools registered in index.ts
- [ ] New scopes added to README/SETUP docs

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `WriteParams`, `BaseParams`, `ListParams` | `src/schemas/common.ts` | All 6 tools |
| `DateTimeTimeZone`, `AttendeeInput` | `src/schemas/calendar-write.ts` | Recurring event tools |
| `checkConfirmation()` | `src/utils/confirmation.ts` | Destructive tools |
| `idempotencyCache` | `src/utils/idempotency.ts` | Destructive tools |
| `encodeGraphId()` | `src/utils/graph-id.ts` | All tools |
| `fetchPage()` | `src/utils/pagination.ts` | List tools |
| `getUserTimezone()` | `src/utils/timezone.ts` | Recurring event tools |
| `createLogger()` | `src/utils/logger.ts` | All tools |

---

## Acceptance Criteria

- [ ] All 6 advanced calendar tools fully implemented + tested
- [ ] RecurrencePattern and RecurrenceRange schemas support all Graph API patterns
- [ ] Meeting room search integrates with availability checking
- [ ] Calendar sharing works with all permission levels
- [ ] 60 new tests covering happy path + errors + edge cases
- [ ] No regressions in existing tools
- [ ] New scopes (Place.Read.All, Calendars.ReadWrite.Shared) documented
- [ ] E2E tests: create_recurring_event, find_available_rooms, share_calendar

---

## Known Limitations & Future Work

1. **Past Occurrence Updates:** Cannot modify past occurrences of recurring events (Graph API limitation). Only future occurrences can be changed.
2. **Exception Handling:** Cancelling/modifying single occurrence not supported in MVP (would need `cancel_event_occurrence` tool).
3. **Room Equipment Details:** Equipment list may be incomplete depending on organization's room configuration.
4. **Room Booking:** Creating event with room does NOT guarantee booking (room may have auto-accept disabled). Check event acceptance via attendee response.
5. **Calendar Sharing Revocation:** Removing calendar permissions requires separate `unshare_calendar` tool (Phase 9 candidate).
6. **Cross-Tenant Rooms:** Cannot search rooms in other tenants (Graph API limitation).

---

## Implementation Notes

### Recurrence Pattern Examples

**Daily (every day for 2 weeks):**
```json
{
  "pattern": { "type": "daily", "interval": 1 },
  "range": { "type": "endDate", "startDate": "2026-02-15", "endDate": "2026-02-28" }
}
```

**Weekly (every 2 weeks on Tue/Thu for 10 occurrences):**
```json
{
  "pattern": { "type": "weekly", "interval": 2, "daysOfWeek": ["tuesday", "thursday"] },
  "range": { "type": "numbered", "startDate": "2026-02-15", "numberOfOccurrences": 10 }
}
```

**Monthly (1st Monday of every month, no end):**
```json
{
  "pattern": { "type": "relativeMonthly", "interval": 1, "daysOfWeek": ["monday"], "index": "first" },
  "range": { "type": "noEnd", "startDate": "2026-02-15" }
}
```

**Yearly (Feb 14th every year, 5 years):**
```json
{
  "pattern": { "type": "absoluteYearly", "interval": 1, "dayOfMonth": 14, "month": 2 },
  "range": { "type": "numbered", "startDate": "2026-02-14", "numberOfOccurrences": 5 }
}
```

### Room Availability Flow

1. **List Rooms:**
   - GET /places/microsoft.graph.room with filters
   - Returns: room list with email addresses

2. **Check Availability:**
   - POST /me/calendar/getSchedule
   - Body: `{ schedules: ["room1@example.com", "room2@example.com"], startTime: {...}, endTime: {...} }`
   - Response: scheduleItems[] with availabilityView

3. **Filter Available:**
   - availabilityView = "0000" (all 0s) = completely free
   - Any "1", "2", "3", or "4" = busy during slot

4. **Sort & Return:**
   - Sort by capacity (closest to requested)
   - Format with room details

---

## Post-Sprint Notes

Sprint 8.3 adds powerful recurring event management and meeting room booking capabilities. The recurrence pattern schema supports all Graph API recurrence types, providing flexibility for complex scheduling scenarios.

Key insight: Room availability checking requires integration between `/places` (list rooms) and `/calendar/getSchedule` (check availability). The find_available_rooms tool combines these into a single user-facing operation.

Performance note: Checking availability for many rooms (>20) may require multiple API calls due to getSchedule batch limits. Consider implementing batch processing for large room lists.
