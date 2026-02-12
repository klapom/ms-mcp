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
