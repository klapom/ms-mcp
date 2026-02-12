# Technical Debt & Improvement Notes

Dieses Dokument sammelt Beobachtungen aus der laufenden Implementierung:
- Code, der nicht ganz sauber ist
- Patterns, die bei Erweiterung refactored werden sollten
- Nice-to-haves aus Code Reviews, die nicht sofort umgesetzt wurden

**Workflow:** Vor jedem neuen Sprint reviewen und entscheiden, was in den Sprint aufgenommen wird.

---

## Offene Items

### encodeURIComponent für Graph API IDs
- **Quelle:** Sprint 2.3 Review
- **Status:** Neue Tools (mail-move, mail-attachments) haben Encoding. Bestehende Tools (mail-read, mail-reply, mail-forward, mail-search) nutzen noch raw IDs.
- **Vorschlag:** Shared Helper `encodeGraphId()` in `src/utils/` erstellen und in ALLEN Tools anwenden.
- **Risiko:** Gering (IDs kommen aus Graph API), aber unsicher bei manipulierten Inputs.

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
- **Status:** `mail-attachments.ts` Handler hat eine große Map mit 12 Einträgen.
- **Vorschlag:** Bei weiterer Vergrößerung Mock-Daten in separate `fixtures/` Dateien auslagern.
- **Risiko:** Wartbarkeit bei Erweiterung.
