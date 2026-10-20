# Sprint 3.1 — Read-Only Calendar Tools + encodeGraphId Refactor

**Phase:** 3 (Kalender-Modul)
**Ziel:** Kalender-Infrastruktur aufbauen (Schemas, Mocks, Tests) + 4 read-only Calendar Tools + Cross-Cutting encodeGraphId Refactor
**Parallelisierung:** 3 Agents (A: Schemas + encodeGraphId Refactor | B: list_calendars + get_calendar_view | C: list_events + get_event)

---

## Review Debt (aus Sprint 2.3 / TECHNICAL_DEBT.md)

- [x] **encodeURIComponent für Graph API IDs** — Shared Helper `encodeGraphId()` in `src/utils/graph-id.ts` erstellen und in ALLEN bestehenden Tools anwenden (mail-read, mail-reply, mail-forward, mail-search, mail.ts). Sprint 2.3 Tools (mail-move, mail-attachments) haben bereits inline `encodeURIComponent()`.

---

## Features

### F-3.1.0: `encodeGraphId()` Shared Utility (Agent A — Review Debt)

**Motivation:** Graph API IDs (Message-IDs, Folder-IDs, Attachment-IDs) können Sonderzeichen enthalten (z.B. `+`, `/`, `=` in Base64-codierten IDs). Alle URL-Interpolationen müssen `encodeURIComponent()` verwenden.

**Implementierung:**
- `src/utils/graph-id.ts` — `encodeGraphId(id: string): string` Wrapper um `encodeURIComponent()`
- Alle bestehenden Tools refactoren: raw ID-Interpolation → `encodeGraphId()`
- Sprint 2.3 Tools (mail-move, mail-attachments) von inline `encodeURIComponent()` auf `encodeGraphId()` umstellen
- Neue Calendar Tools nutzen `encodeGraphId()` von Anfang an

**Betroffene Dateien:**
| Datei | Änderung |
|---|---|
| `src/utils/graph-id.ts` | NEU: `encodeGraphId()` |
| `src/tools/mail.ts` | `folder` in URL-Pfad encodieren |
| `src/tools/mail-read.ts` | `message_id` encodieren |
| `src/tools/mail-search.ts` | `folder` encodieren |
| `src/tools/mail-reply.ts` | `message_id` encodieren |
| `src/tools/mail-forward.ts` | `message_id` encodieren |
| `src/tools/mail-move.ts` | `encodeURIComponent()` → `encodeGraphId()` |
| `src/tools/mail-attachments.ts` | `encodeURIComponent()` → `encodeGraphId()` |
| `src/tools/mail-folders.ts` | `folder.id` in childFolders-URL encodieren |

### F-3.1.1: Calendar Schemas (Agent A)

**Datei:** `src/schemas/calendar.ts`

```typescript
// ListCalendarsParams — extends ListParams (pagination)
ListCalendarsParams = ListParams.extend({})

// ListEventsParams — extends ListParams (pagination + filter + orderby)
ListEventsParams = ListParams.extend({
  calendar_id: z.string().optional()
    .describe("Kalender-ID. Default: Standard-Kalender"),
  filter: z.string().optional()
    .describe("OData $filter, z.B. \"start/dateTime ge '2026-02-01T00:00:00Z'\""),
  orderby: z.string().optional()
    .describe("OData $orderby. Default: start/dateTime asc"),
})

// GetEventParams — extends BaseParams
GetEventParams = BaseParams.extend({
  event_id: z.string().min(1).describe("ID des Kalender-Events"),
  calendar_id: z.string().optional()
    .describe("Kalender-ID. Default: Standard-Kalender"),
})

// GetCalendarViewParams — extends ListParams (pagination)
GetCalendarViewParams = ListParams.extend({
  start_date_time: z.string().min(1)
    .describe("Start des Zeitfensters in ISO 8601, z.B. '2026-02-12T00:00:00Z'"),
  end_date_time: z.string().min(1)
    .describe("Ende des Zeitfensters in ISO 8601, z.B. '2026-02-19T00:00:00Z'"),
  calendar_id: z.string().optional()
    .describe("Kalender-ID. Default: Standard-Kalender"),
})
```

### F-3.1.2: `list_calendars` Tool (Agent B)

**Graph API:** `GET /me/calendars`
**Klassifizierung:** safe
**Permission:** Calendars.ReadWrite

**Funktionalität:**
- Liste aller Kalender des Benutzers
- `$select`: id, name, color, hexColor, isDefaultCalendar, canEdit, canShare, owner
- Pagination via `top`/`skip`
- Formatierung: Kalender-Name, Owner, Default-Marker, Farbe

**$select Fields:**
```
id,name,color,hexColor,isDefaultCalendar,canEdit,canShare,owner
```

**Response-Format:**
```
📅 Calendar (default) | Owner: user@domain.com | canEdit: true
  Project Calendar | Owner: user@domain.com | canEdit: true
  Shared: Team Calendar | Owner: team@domain.com | canEdit: false
```

### F-3.1.3: `list_events` Tool (Agent C)

**Graph API:** `GET /me/events` oder `GET /me/calendars/{id}/events`
**Klassifizierung:** safe
**Permission:** Calendars.ReadWrite

**Funktionalität:**
- Events aus Standard- oder spezifischem Kalender
- `$select`: id, subject, start, end, location, organizer, isAllDay, importance, showAs, isCancelled, isOnlineMeeting
- OData `$filter` für Zeitraum-Einschränkung
- OData `$orderby` (Default: `start/dateTime asc`)
- Pagination via `top`/`skip`

**Formatierung:**
```
[1] 2026-02-12 10:00–11:00 | Team Meeting
    Location: Conf Room A | Organizer: boss@domain.com | busy

[2] 2026-02-12 (ganztägig) | Company Holiday
    Organizer: hr@domain.com | free
```

### F-3.1.4: `get_event` Tool (Agent C)

**Graph API:** `GET /me/events/{id}` oder `GET /me/calendars/{calendarId}/events/{id}`
**Klassifizierung:** safe
**Permission:** Calendars.ReadWrite

**Funktionalität:**
- Einzelnes Event mit vollem Detail (Body, Attendees, Recurrence, etc.)
- `$select`: id, subject, body, bodyPreview, start, end, location, locations, organizer, attendees, isAllDay, importance, sensitivity, showAs, isCancelled, isOrganizer, isOnlineMeeting, onlineMeeting, onlineMeetingUrl, recurrence, hasAttachments, responseStatus, webLink, categories
- Body-Konvertierung: HTML → Text (wie read_email, via html-to-text)

**Formatierung:**
```
Subject: Team Meeting
Start: 2026-02-12 10:00 (Europe/Berlin)
End: 2026-02-12 11:00 (Europe/Berlin)
Location: Conf Room A
Organizer: Boss <boss@domain.com>
Status: busy | Importance: normal | Sensitivity: normal

Attendees:
  [required] Alice <alice@domain.com> — accepted
  [required] Bob <bob@domain.com> — tentativelyAccepted
  [optional] Charlie <charlie@domain.com> — none

Online Meeting: https://teams.microsoft.com/...

Categories: Project-X, Weekly

--- Body ---
Let's discuss the project timeline...
```

### F-3.1.5: `get_calendar_view` Tool (Agent B)

**Graph API:** `GET /me/calendarView` oder `GET /me/calendars/{id}/calendarView`
**Klassifizierung:** safe
**Permission:** Calendars.ReadWrite

**Funktionalität:**
- Tages-/Wochenansicht mit start/end Zeitfenster (required)
- Unterschied zu list_events: calendarView expandiert Recurring Events zu einzelnen Occurrences
- `$select`: wie list_events
- `startDateTime` und `endDateTime` als Query-Parameter (nicht $filter!)
- Pagination via `top`/`skip`
- Gleiche Formatierung wie list_events

**Hinweis:** Graph API `calendarView` unterstützt kein `$orderby` — Events kommen in Start-Zeit-Reihenfolge.

---

## Neue Dateien

| Datei | Zweck |
|---|---|
| `src/utils/graph-id.ts` | `encodeGraphId(id)` shared utility |
| `src/schemas/calendar.ts` | Zod-Schemas für alle 4 Calendar Tools |
| `src/tools/calendar-list.ts` | `registerCalendarListTools()` — list_calendars |
| `src/tools/calendar-events.ts` | `registerCalendarEventTools()` — list_events + get_event |
| `src/tools/calendar-view.ts` | `registerCalendarViewTools()` — get_calendar_view |
| `tests/calendar-list.test.ts` | Tests für list_calendars |
| `tests/calendar-events.test.ts` | Tests für list_events + get_event |
| `tests/calendar-view.test.ts` | Tests für get_calendar_view |
| `tests/graph-id.test.ts` | Tests für encodeGraphId + Refactor-Verifikation |
| `tests/mocks/handlers/calendar.ts` | MSW Handlers für alle Calendar-Endpunkte |

## Geänderte Dateien

| Datei | Änderung |
|---|---|
| `src/schemas/calendar.ts` | TODO-Kommentar → volle Schemas |
| `src/tools/calendar.ts` | TODO-Kommentar entfernen (ersetzt durch calendar-*.ts) |
| `src/tools/mail*.ts` (7 Dateien) | Raw ID → `encodeGraphId()` |
| `src/utils/response-shaper.ts` | `DEFAULT_SELECT.calendar` und `DEFAULT_SELECT.calendarDetail` hinzufügen |
| `src/index.ts` | Neue Calendar registrations + import |
| `tests/mocks/handlers/index.ts` | `calendarHandlers` hinzufügen |

---

## MSW Handlers (`tests/mocks/handlers/calendar.ts`)

### list_calendars
- `GET /me/calendars` → 2 Kalender (default + project)
- `GET /users/:userId/calendars` → 1 Kalender (multi-tenant)

### list_events
- `GET /me/events` → 3 Events (normal, all-day, cancelled)
- `GET /me/calendars/:calendarId/events` → 2 Events (calendar-specific)
- `GET /me/events` mit $filter → gefilterte Results
- `GET /users/:userId/events` → 1 Event (multi-tenant)

### get_event
- `GET /me/events/:eventId` → Full event detail mit Attendees, Body, Location
- `GET /me/events/nonexistent` → 404
- `GET /me/calendars/:calId/events/:eventId` → Calendar-specific event
- `GET /users/:userId/events/:eventId` → Multi-tenant

### get_calendar_view
- `GET /me/calendarView` mit startDateTime/endDateTime → 3 Events (inkl. recurring expansion)
- `GET /me/calendars/:calId/calendarView` → Calendar-specific view
- `GET /users/:userId/calendarView` → Multi-tenant

---

## Tests

### `tests/graph-id.test.ts` (~6 Tests)
1. Encodes special characters (+, /, =)
2. Passes through simple IDs unchanged
3. Handles empty string
4. Encodes already-encoded strings (double-encode safety — verify behavior)

### `tests/calendar-list.test.ts` (~8 Tests)
1. Schema: parse defaults, optional user_id
2. API: multiple calendars returned
3. API: default calendar marked
4. API: empty calendar list
5. API: multi-tenant path
6. Formatting: calendar summary output
7. Pagination hint
8. Error: 401 → AuthError

### `tests/calendar-events.test.ts` (~14 Tests)
**list_events:**
1. Schema: defaults, optional calendar_id/filter/orderby
2. API: events from default calendar
3. API: events from specific calendar (calendar_id)
4. API: filtered events
5. API: multi-tenant
6. Formatting: normal event, all-day event, cancelled event
7. Pagination hint
8. Error: 404 calendar → NotFoundError

**get_event:**
1. Schema: required event_id, optional calendar_id
2. API: full event detail
3. API: event with attendees formatted
4. API: event with online meeting URL
5. API: multi-tenant
6. Error: 404 → NotFoundError

### `tests/calendar-view.test.ts` (~8 Tests)
1. Schema: required start/end, optional calendar_id
2. Schema: reject missing start/end
3. API: events in time window
4. API: recurring event expanded
5. API: specific calendar view
6. API: multi-tenant
7. Pagination hint
8. Error: 400 invalid date → ValidationError

---

## DEFAULT_SELECT Erweiterung

```typescript
// response-shaper.ts
calendar: ["id", "name", "color", "hexColor", "isDefaultCalendar", "canEdit", "canShare", "owner"],
event: ["id", "subject", "start", "end", "location", "organizer", "isAllDay", "importance", "showAs", "isCancelled", "isOnlineMeeting"],
eventDetail: ["id", "subject", "body", "bodyPreview", "start", "end", "location", "locations", "organizer", "attendees", "isAllDay", "importance", "sensitivity", "showAs", "isCancelled", "isOrganizer", "isOnlineMeeting", "onlineMeeting", "onlineMeetingUrl", "recurrence", "hasAttachments", "responseStatus", "webLink", "categories"],
```

---

## Wiederverwendete Utilities

| Utility | Datei | Genutzt von |
|---|---|---|
| `BaseParams`, `ListParams`, `resolveUserPath()` | `src/schemas/common.ts` | Alle 4 Tools |
| `encodeGraphId()` | `src/utils/graph-id.ts` (NEU) | Alle Tools (neu + refactored) |
| `fetchPage()` | `src/utils/pagination.ts` | list_calendars, list_events, get_calendar_view |
| `shapeListResponse()` | `src/utils/response-shaper.ts` | list_calendars, list_events, get_calendar_view |
| `McpToolError`, `formatErrorForUser()` | `src/utils/errors.ts` | Alle 4 Tools |
| `createLogger()` | `src/utils/logger.ts` | Alle 4 Tools |
| `ToolRegistrationFn` | `src/types/tools.ts` | Alle 4 Tools |
| `extractAddress()` | `src/utils/address-format.ts` | get_event (Organizer, Attendees) |
| `truncateBody()`, `htmlToText` | `src/utils/response-shaper.ts` | get_event (Body) |

---

## Akzeptanzkriterien

1. `pnpm build` — alle neuen Dateien kompilieren
2. `pnpm typecheck` — clean
3. `pnpm lint` — Biome clean
4. `pnpm test` — alle bestehenden 420 Tests + ~36 neue Tests bestehen
5. `encodeGraphId()` in ALLEN Tools angewandt (kein raw ID in URL-Pfaden)
6. Keine Regression in bestehenden Mail-Tests nach Refactor
7. Calendar TODO-Placeholders entfernt
