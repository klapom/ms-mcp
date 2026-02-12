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

### Multi-Tenant Test-Assertions in calendar-availability
- **Quelle:** Sprint 3.2 Review
- **Status:** `calendar-availability.test.ts` Multi-Tenant-Test assertet `toHaveLength(2)` — gibt immer die gleiche Mock-Response zurück, testet nicht wirklich Routing-Unterschiede.
- **Vorschlag:** MSW-Handler für Multi-Tenant eigene Response liefern lassen oder Request-URL asserten.
- **Risiko:** Gering — Routing wird durch andere Tools implizit getestet.
