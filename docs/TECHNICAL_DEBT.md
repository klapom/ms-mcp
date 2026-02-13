# Technical Debt & Improvement Notes

Dieses Dokument sammelt Beobachtungen aus der laufenden Implementierung:
- Code, der nicht ganz sauber ist
- Patterns, die bei Erweiterung refactored werden sollten
- Nice-to-haves aus Code Reviews, die nicht sofort umgesetzt wurden

**Workflow:** Vor jedem neuen Sprint reviewen und entscheiden, was in den Sprint aufgenommen wird.

---

## Offene Items

### ~~encodeURIComponent für Graph API IDs~~ ✅ ERLEDIGT (Sprint 3.1)
- **Erledigt:** `encodeGraphId()` in `src/utils/graph-id.ts` erstellt und in ALLEN Tools angewendet (mail + calendar).

### Attachment-Interfaces lokal statt shared
- **Quelle:** Sprint 2.3 Review (Architect)
- **Status:** `AttachmentListItem`, `AttachmentMetadata`, `FileAttachmentFull` sind lokal in `mail-attachments.ts` definiert.
- **Vorschlag:** Bei Phase 5 (OneDrive) nach `src/types/graph.ts` extrahieren, da OneDrive-Attachments die gleichen Shapes nutzen.
- **Risiko:** Keins aktuell, nur Duplizierung bei Erweiterung.

### formatFileSize negative Zahlen
- **Quelle:** Sprint 2.3 Review (Developer)
- **Status:** `formatFileSize(-500)` gibt `-500 B` aus.
- **Vorschlag:** Guard `if (bytes < 0) return "0 B"` oder throw.
- **Risiko:** Irrelevant in Praxis (Größen immer >= 0).

### Mock-Handler-Dateien werden groß
- **Quelle:** Sprint 2.3 Review (Developer)
- **Status:** `mail-attachments.ts` Handler hat eine große Map mit 12 Einträgen. `calendar.ts` Handler wächst mit jeder neuen Tool-Gruppe.
- **Vorschlag:** Bei weiterer Vergrößerung Mock-Daten in separate `fixtures/` Dateien auslagern.
- **Risiko:** Wartbarkeit bei Erweiterung.

### Temporal Validation (end >= start) in calendarView
- **Quelle:** Sprint 3.1 Review
- **Status:** Schema nutzt `.datetime()` für ISO-Validierung, aber keine `.refine()` für `end >= start`, weil `.refine()` → ZodEffects → `.shape` nicht verfügbar → MCP SDK inkompatibel.
- **Vorschlag:** Validierung im Tool-Handler (nicht im Schema). Aktuell dokumentiert im JSDoc von `GetCalendarViewParams`.
- **Risiko:** Gering — Graph API gibt 400 bei ungültigem Zeitraum.

### GET_EVENT_DEFAULT_BODY_LENGTH könnte zentral definiert werden
- **Quelle:** Sprint 3.1 Review
- **Status:** `5000` als Konstante in `calendar-events.ts` und `mail-read.ts` (READ_EMAIL_DEFAULT_BODY_LENGTH). Gleicher Wert, verschiedene Namen.
- **Vorschlag:** In `config.ts` als `limits.detailBodyLength` oder als shared Konstante in `response-shaper.ts`.
- **Risiko:** Keins aktuell, nur Inkonsistenz.

### Response-Strings auf Englisch vereinheitlichen
- **Quelle:** Sprint 3.2 Vorbereitung
- **Status:** Tool-Responses nutzen gemischt Deutsch ("Keine Events gefunden.", "ganztägig", "kein Betreff") und Englisch ("Subject:", "Location:", "CANCELLED"). Tool-Descriptions und MCP-Protokoll sind durchgehend Englisch.
- **Vorschlag:** Nach Abschluss Phase 3 alle User-facing Strings einmalig auf Englisch vereinheitlichen. Kein i18n-Framework nötig — Strings-Konstanten in einer Datei (z.B. `src/utils/strings.ts`).
- **Risiko:** Keins funktional, nur inkonsistentes UX. LLMs verstehen beides.

### Attendees-Mapping dupliziert (calendar-create + calendar-update)
- **Quelle:** Sprint 3.2 Review
- **Status:** `buildAttendeesBody()` in `calendar-create.ts` und inline in `buildPatchBody()` in `calendar-update.ts` mappen beide `{email, name, type}` → `{emailAddress: {address, name}, type}`.
- **Vorschlag:** Shared `toAttendees()` Utility in `src/utils/recipients.ts` (analog zu `toRecipients()`).
- **Risiko:** Keins aktuell, nur Duplizierung bei Erweiterung.

### Kalenderzeiten in lokaler Zeitzone anzeigen
- **Quelle:** E2E-Nutzung Sprint 3.2
- **Status:** Calendar-Tools geben Zeiten in UTC zurück (Graph-Default). Das führt zu Missverständnissen (z.B. 07:30 UTC statt 08:30 CET).
- **Lösung:** `GET /me/mailboxSettings` einmalig beim ersten Calendar-Tool-Call aufrufen → `timeZone` cachen (Lazy Singleton, Server-Laufzeit). Dann `Prefer: outlook.timezone="<tz>"` Header auf allen Calendar-Requests setzen, damit Graph direkt in der User-Zeitzone antwortet.
- **Architektur:** Neues Modul `src/utils/user-settings.ts` mit `getUserTimezone(graphClient): Promise<string>`, intern gecacht. Kein Coupling mit Auth/Token-Refresh.
- **Risiko:** Mittel — betrifft alle Calendar-Tools, aber rein additiv (Header hinzufügen).

### proposedNewTime Support für respond_to_event
- **Quelle:** E2E-Nutzung Sprint 3.2
- **Status:** `respond_to_event` unterstützt nur accept/decline/tentativelyAccept ohne Zeitvorschlag. Graph API erlaubt `proposedNewTime` (Start + End + TimeZone) als optionalen Body-Parameter bei allen drei Actions.
- **Vorschlag:** `RespondToEventParams` um optionales `proposed_new_time: { start: DateTimeTimeZone, end: DateTimeTimeZone }` erweitern. Im Handler als `proposedNewTime: { start, end }` an den POST-Body anhängen.
- **Risiko:** Gering — rein additiv, keine Breaking Changes.

### Multi-Tenant Test-Assertions in calendar-availability
- **Quelle:** Sprint 3.2 Review
- **Status:** `calendar-availability.test.ts` Multi-Tenant-Test assertet `toHaveLength(2)` — gibt immer die gleiche Mock-Response zurück, testet nicht wirklich Routing-Unterschiede.
- **Vorschlag:** MSW-Handler für Multi-Tenant eigene Response liefern lassen oder Request-URL asserten.
- **Risiko:** Gering — Routing wird durch andere Tools implizit getestet.

### parseSearchHits() Duplikation in Search Tools
- **Quelle:** Phase 8 Final Review (Senior Developer)
- **Status:** `parseSearchHits()` ist in 5 Search-Tools leicht unterschiedlich implementiert (search-emails-advanced, search-events, search-contacts-advanced, search-teams-messages, search-all). ~40 LOC Duplikation.
- **Vorschlag:** Shared `parseSearchResponse()` utility in `src/utils/search.ts`
- **Decision:** NICHT fixen — entity-spezifische Formatierung legitim, Abstraktion würde Flexibilität reduzieren
- **Risiko:** Keins — legitime Design-Entscheidung

### E2E Test Coverage für Phase 8 Tools
- **Quelle:** Phase 8 Final Review (Senior Tester)
- **Status:** Alle 22 Phase-8-Tools haben nur Unit-Tests, keine E2E-Tests gegen echte Graph API
- **Vorschlag:** E2E-Tests für repräsentative Tools (advanced_search_emails, batch_move_emails, create_recurring_event, get_meeting_transcript)
- **Decision:** NICHT blockierend — existierendes Pattern, E2E separat via scripts/test-*-e2e.ts
- **Risiko:** Gering — Integration-Bugs könnten übersehen werden, aber Unit-Tests + MSW decken API-Verträge ab

### Batch Utility Cross-Module Helper Extraction
- **Quelle:** Phase 8 Final Review (Senior Architect)
- **Status:** `handleBatchTool()` helper in `batch-mail.ts` (3 tools). Ähnlicher Boilerplate in `batch-calendar.ts` und `batch-files.ts` (jeweils nur 1 tool). ~30 LOC Duplikation.
- **Vorschlag:** Extract shared `createBatchToolHandler()` in `src/utils/batch.ts`
- **Decision:** NICHT fixen — nur 2 weitere tools, Abstraktion komplexer als Duplikation
- **Risiko:** Keins — bei mehr Batch-Tools würde Refactoring sinnvoll
