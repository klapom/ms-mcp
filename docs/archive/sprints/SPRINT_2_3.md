# Sprint 2.3 — Mail Organization + Attachments

**Phase:** 2 (Mail-Modul)
**Ziel:** Mail-Verwaltung (verschieben) und Anhang-Handling, Phase 2 abschließen
**Parallelisierung:** 2 Agents (A: move_email | B: list_attachments + download_attachment)

---

## Review Debt (IMPORTANT/CRITICAL aus Sprint 2.2 Review)

> Wird nach Sprint 2.2 Review ausgefüllt.

- [ ] _placeholder_

---

## Features

### F-2.3.1: `move_email` Tool (Agent A)

**Graph API:** `POST /me/messages/{id}/move`
**Klassifizierung:** destructive (confirm-Pattern + dry_run)
**Permission:** Mail.ReadWrite

**Funktionalität:**
- E-Mail in anderen Ordner verschieben
- **Confirmation-Pattern:** Ohne `confirm: true` → Vorschau (Quell-/Zielordner, Betreff)
- **dry_run-Modus:** Zeigt was passieren würde, ohne auszuführen — auch bei `confirm: true` wird bei `dry_run: true` NICHT ausgeführt
- Zielordner per Name oder ID (wellKnownFolderName oder folder-ID)
- **Hinweis:** Graph API `/move` gibt die VERSCHOBENE E-Mail zurück (neues `parentFolderId`, möglicherweise neue `id`). Die message_id kann sich beim Verschieben ändern! Dies muss in der Response kommuniziert werden.

**Graph API Request Body Format:**
```json
{
  "destinationId": "AAMkAGI2..." // Folder-ID oder Well-Known-Name
}
```

**Hinweis:** `destinationId` akzeptiert sowohl Well-Known-Folder-Names (`inbox`, `deleteditems`, `archive`, etc.) als auch Folder-IDs (lange Base64-Strings). Die Implementierung muss dies transparent durchreichen.

**Schema:** `src/schemas/mail.ts` → `MoveEmailParams` (extends WriteParams)
```typescript
MoveEmailParams = WriteParams.extend({
  // WriteParams bringt: user_id?, idempotency_key?, confirm (default: false)
  message_id: z.string().min(1)
    .describe("ID der E-Mail, die verschoben werden soll"),
  destination_folder: z.string().min(1)
    .describe("Zielordner: Well-Known-Name (inbox, archive, deleteditems, junkemail, drafts, sentitems) oder Folder-ID"),
  dry_run: z.boolean().default(false)
    .describe("Wenn true: Zeigt Vorschau was passieren würde, ohne tatsächlich zu verschieben. Überschreibt confirm=true."),
})
```

**Implementation Notes:**
- **Vorschau-Logik (confirm=false ODER dry_run=true):** Vor der Vorschau die Original-Mail per `GET /me/messages/{id}?$select=subject,parentFolderId` UND den Zielordner per `GET /me/mailFolders/{destinationFolder}?$select=displayName` abrufen. So kann die Vorschau anzeigen: "Verschiebe '{subject}' von '{quellOrdner}' nach '{zielOrdner}'"
- **Quellordner-Name auflösen:** `parentFolderId` aus der Original-Mail ist eine ID, kein lesbarer Name. Zusätzlicher `GET /me/mailFolders/{parentFolderId}?$select=displayName` nötig. Das sind 3 GET-Calls für eine Vorschau — ggf. per `$batch` optimieren (Phase 7) oder einfach die parentFolderId anzeigen.
- **dry_run vs. confirm:** `dry_run` hat VORRANG vor `confirm`. `dry_run=true, confirm=true` → Vorschau, KEIN Move. `dry_run=false, confirm=true` → Move. `dry_run=false, confirm=false` → Vorschau (via checkConfirmation). Logik:
  ```
  if (dry_run || !confirm) → Vorschau
  else → Move ausführen
  ```
- **Response nach Move:** Die Graph API gibt die verschobene Nachricht zurück. Wichtig: Die `id` kann sich ändern! Response muss die NEUE message_id zurückgeben, damit nachfolgende Operationen die korrekte ID verwenden.
- **DSGVO-Logging:** Nur `{ tool: "move_email", status, duration_ms }`. Nicht: message_id, Ordnernamen, Betreff.

**MSW-Handler:**
- POST /me/messages/{id}/move → 200 mit verschobener E-Mail `{ id: "neue-id", parentFolderId: "ziel-folder-id", subject: "...", ... }`
- POST /me/messages/nonexistent/move → 404 `{ error: { code: "ErrorItemNotFound" } }`
- POST /me/messages/{id}/move (ungültiger Ordner) → 400 `{ error: { code: "ErrorInvalidIdMalformed", message: "Id is malformed." } }` oder 404 `{ error: { code: "ErrorItemNotFound" } }` (Ordner nicht gefunden)
- POST /me/messages/{id}/move (already in folder) → 200 (kein Fehler, Mail bleibt im selben Ordner — Graph API Verhalten)
- GET /me/messages/{id}?$select=subject,parentFolderId → Mock für Vorschau
- GET /me/mailFolders/{id}?$select=displayName → Mock für Ordnernamen-Auflösung
- POST /users/{user_id}/messages/{id}/move → 200 (Multi-Tenant)

---

### F-2.3.2: `list_attachments` Tool (Agent B)

**Graph API:** `GET /me/messages/{id}/attachments`
**Klassifizierung:** safe (read-only)
**Permission:** Mail.Read

**Funktionalität:**
- Anhänge einer E-Mail auflisten (Metadaten, nicht Content)
- `$select`: id, name, contentType, size, isInline, lastModifiedDateTime
- Warnung bei Anhängen >4MB (Download-Limit beachten)
- **Attachment-Typen im Graph API:**
  - `#microsoft.graph.fileAttachment` — Reguläre Datei-Anhänge (häufigstes Szenario)
  - `#microsoft.graph.itemAttachment` — Eingebettete Outlook-Items (E-Mails, Termine)
  - `#microsoft.graph.referenceAttachment` — OneDrive/SharePoint-Links (Cloud-Anhänge)
- Jeder Attachment-Typ hat unterschiedliche Felder. `@odata.type` in der Response anzeigen, damit der User weiß, welchen Typ er hat.

**Schema:** `src/schemas/mail.ts` → `ListAttachmentsParams` (extends BaseParams)
```typescript
ListAttachmentsParams = BaseParams.extend({
  // BaseParams bringt: user_id?
  message_id: z.string().min(1)
    .describe("ID der E-Mail, deren Anhänge aufgelistet werden sollen"),
})
```

**Hinweis:** Keine Pagination nötig — E-Mails haben selten >100 Anhänge. Graph API liefert alle Attachments in einer Response (kein `@odata.nextLink`). Kein `top`/`skip` Parameter erforderlich.

**Implementation Notes:**
- **Response-Format:** Für jeden Anhang eine Zeile ausgeben:
  ```
  [1] Dokument.pdf (application/pdf, 2.3 MB) — File Attachment
  [2] Logo.png (image/png, 45 KB, inline) — File Attachment, Inline
  [3] Weitergeleitete_Mail.eml (message/rfc822, 12 KB) — Item Attachment
  [4] Bericht.xlsx (Link zu OneDrive) — Reference Attachment
  ```
- **Größen-Formatierung:** Bytes in KB/MB konvertieren. Utility-Funktion: `formatFileSize(bytes: number): string`
- **Warnung bei großen Anhängen:** Ab 4MB eine Warnung anzeigen: "[!] Datei.zip (6.2 MB) — Größer als 4 MB. Download kann den Context-Budget belasten."
- **$select-Optimierung:** NICHT `contentBytes` abrufen (das wäre der volle Dateiinhalt). Nur Metadaten: `id,name,contentType,size,isInline,lastModifiedDateTime,@odata.type`

**MSW-Handler:**
- GET /me/messages/{id}/attachments → `{ value: [...] }` mit:
  - 1x fileAttachment (klein, 45KB, PDF)
  - 1x fileAttachment (groß, 6MB, ZIP — für Größen-Warnung)
  - 1x fileAttachment (inline, 12KB, PNG — mit `isInline: true`, `contentId: "image001"`)
  - 1x itemAttachment (E-Mail als Anlage)
  - `@odata.type` korrekt gesetzt pro Attachment
- GET /me/messages/nonexistent/attachments → 404 `{ error: { code: "ErrorItemNotFound" } }`
- GET /me/messages/{id}/attachments (Mail ohne Anhänge) → `{ value: [] }`
- GET /users/{user_id}/messages/{id}/attachments → Multi-Tenant-Pfad

---

### F-2.3.3: `download_attachment` Tool (Agent B)

**Graph API:** `GET /me/messages/{id}/attachments/{attachmentId}`
**Klassifizierung:** safe (read-only, aber Context-Budget beachten!)
**Permission:** Mail.Read

**Funktionalität:**
- Anhang als Base64-Content herunterladen
- **Größen-Check:** Warnung wenn >4MB, Abbruch wenn >10MB
- Content-Type im Response mitsenden
- Für Inline-Attachments: Content-ID mitsenden
- Plain-Text-Dateien (.txt, .csv, .json, .md, .xml, .html, .log) direkt als Text zurückgeben (UTF-8 dekodiert)
- Binärdateien als Base64-String zurückgeben

**WICHTIG — Context-Budget-Warnung:** Ein 4MB-Anhang als Base64 sind ~5.3MB Text im LLM-Kontext. Ein 10MB-Anhang wären ~13.3MB. Das kann das Context-Window sprengen. Daher die harten Limits.

**Graph API Response für fileAttachment:**
```json
{
  "@odata.type": "#microsoft.graph.fileAttachment",
  "id": "AAMkAGI2...",
  "name": "Dokument.pdf",
  "contentType": "application/pdf",
  "size": 234567,
  "isInline": false,
  "contentBytes": "base64encodedcontent..."
}
```

**Schema:** `src/schemas/mail.ts` → `DownloadAttachmentParams` (extends BaseParams)
```typescript
DownloadAttachmentParams = BaseParams.extend({
  // BaseParams bringt: user_id?
  message_id: z.string().min(1)
    .describe("ID der E-Mail, die den Anhang enthält"),
  attachment_id: z.string().min(1)
    .describe("ID des Anhangs (aus list_attachments)"),
})
```

**Implementation Notes:**
- **Größen-Check VOR dem Download:** Zuerst `list_attachments` (oder direkt `GET /me/messages/{id}/attachments/{aid}?$select=size,name,contentType`) aufrufen, um die Größe zu prüfen BEVOR der volle Content geladen wird. Die Graph API hat KEINEN separaten Metadaten-Endpunkt für Attachments — aber `$select=size,name,contentType` schließt `contentBytes` aus und liefert nur Metadaten.
  - < 4MB: Normal herunterladen
  - 4MB-10MB: Herunterladen mit Warnung: "[!] Anhang ist {size} MB groß. Context-Budget wird belastet."
  - \> 10MB: Abbruch mit Fehlermeldung: "Anhang ist {size} MB groß (Limit: 10 MB). Bitte direkt über Outlook/OneDrive zugreifen."
- **Text-Erkennung:** Content-Types für Text-Dateien: `text/*`, `application/json`, `application/xml`, `application/javascript`, `application/csv`. Dateiendungen als Fallback: `.txt`, `.csv`, `.json`, `.md`, `.xml`, `.html`, `.log`, `.yml`, `.yaml`, `.ts`, `.js`, `.py`.
- **Text-Dekodierung:** `Buffer.from(contentBytes, "base64").toString("utf-8")`. Bei Encoding-Problemen (nicht-UTF-8): als Base64 belassen und Hinweis geben.
- **itemAttachment:** Bei Item-Attachments (eingebettete E-Mails) ist das Format anders — kein `contentBytes`, sondern ein eingebettetes Message-Objekt. Empfehlung: Für Sprint 2.3 nur `fileAttachment` unterstützen. `itemAttachment` und `referenceAttachment` mit Hinweis "Nicht unterstützt — verwende Outlook" ablehnen.
- **MCP Content-Type:** Für Text-Dateien: `{ type: "text", text: "..." }`. Für Binär-Dateien: `{ type: "text", text: "Base64-encoded content (application/pdf):\n{base64}" }`. MCP unterstützt aktuell kein Binary-Content-Type — alles muss als Text.
- **DSGVO-Logging:** Nur `{ tool: "download_attachment", contentType, sizeBytes, status, duration_ms }`. NICHT: Dateiname, Dateiinhalt, attachment_id.

**MSW-Handler:**
- GET /me/messages/{id}/attachments/{aid} → fileAttachment mit `contentBytes` (kleiner Text-Anhang, ~100 Bytes, für Happy-Path)
- GET /me/messages/{id}/attachments/{aid-txt} → fileAttachment mit `contentType: "text/plain"` (für Text-Erkennung)
- GET /me/messages/{id}/attachments/{aid-csv} → fileAttachment mit `contentType: "text/csv"` (CSV als Text)
- GET /me/messages/{id}/attachments/nonexistent → 404 `{ error: { code: "ErrorItemNotFound" } }`
- GET /me/messages/{id}/attachments/{aid-large} → fileAttachment mit `size: 5242880` (5MB, für Größen-Warnung)
- GET /me/messages/{id}/attachments/{aid-huge} → fileAttachment mit `size: 11534336` (11MB, für Abbruch-Test)
- GET /me/messages/{id}/attachments/{aid}?$select=size,name,contentType → Metadaten-only Response (für Größen-Pre-Check)
- GET /me/messages/{id}/attachments/{aid-item} → itemAttachment (für "nicht unterstützt" Hinweis)
- GET /users/{user_id}/messages/{id}/attachments/{aid} → Multi-Tenant-Pfad

---

## Tests

### Unit-Tests (Vitest + MSW)

**move_email (Agent A):**
- [ ] Vorschau (confirm=false): GET für Original-Mail + Zielordner, Response zeigt Quell-/Zielordner + Betreff
- [ ] Verschieben (confirm=true): POST /me/messages/{id}/move wird aufgerufen, Response enthält NEUE message_id
- [ ] dry_run=true, confirm=true: Vorschau wird angezeigt, KEIN Move (dry_run hat Vorrang)
- [ ] dry_run=true, confirm=false: Vorschau wird angezeigt (doppelt abgesichert)
- [ ] dry_run=false, confirm=false: Vorschau via checkConfirmation (Standard-Confirmation-Pattern)
- [ ] destination_folder mit Well-Known-Name ("archive"): Korrekt an Graph API übergeben
- [ ] destination_folder mit Folder-ID: Korrekt an Graph API übergeben
- [ ] 404 für ungültige message_id: NotFoundError
- [ ] 400/404 für ungültigen Ordner: ValidationError mit Hinweis
- [ ] Verschieben in denselben Ordner (already in folder): 200 OK, kein Fehler
- [ ] Idempotenz: gleicher Key → kein doppelter Move
- [ ] Idempotenz bei geänderter message_id: Cache-Response enthält neue message_id
- [ ] 403 Forbidden: AuthError mit requiredScope "Mail.ReadWrite" (NICHT Mail.Read!)
- [ ] Multi-Tenant: user_id → POST /users/{user_id}/messages/{id}/move
- [ ] DSGVO: Kein Loggen von message_id, Ordnernamen, Betreff
- [ ] Zod-Validierung: message_id="" → ValidationError, destination_folder="" → ValidationError

**list_attachments (Agent B):**
- [ ] Happy Path: Mehrere Anhänge korrekt aufgelistet mit Name, Typ, Größe
- [ ] Leere Anhang-Liste: `{ value: [] }` → "Diese E-Mail hat keine Anhänge." (freundliche Meldung)
- [ ] Inline-Attachment: `isInline: true` korrekt angezeigt mit Content-ID
- [ ] Große Anhänge: Anhang >4MB → Warnung in der Auflistung
- [ ] Attachment-Typen: fileAttachment, itemAttachment, referenceAttachment korrekt unterschieden
- [ ] Größen-Formatierung: Bytes → KB/MB korrekt konvertiert (1024-basiert)
- [ ] 404 für ungültige message_id: NotFoundError
- [ ] Multi-Tenant: user_id → `/users/{user_id}/messages/{id}/attachments`
- [ ] $select enthält korrekte Felder (NICHT contentBytes!)
- [ ] Zod-Validierung: message_id="" → ValidationError
- [ ] Response-Format: Nummerierte Liste [1], [2], [3] mit Typ-Annotation

**download_attachment (Agent B):**
- [ ] Happy Path: fileAttachment <4MB → Base64-Content korrekt zurückgegeben
- [ ] Text-Datei (.txt): contentType "text/plain" → UTF-8-dekodierter Text, KEIN Base64
- [ ] CSV-Datei: contentType "text/csv" → UTF-8-dekodierter Text
- [ ] JSON-Datei: contentType "application/json" → UTF-8-dekodierter Text
- [ ] Markdown-Datei (.md): Dateiendung-basierte Erkennung → Text
- [ ] PDF-Datei: contentType "application/pdf" → Base64 mit Content-Type-Hinweis
- [ ] Warnung (>4MB, <10MB): Warnung in Response, aber Content wird trotzdem geliefert
- [ ] Ablehnung (>10MB): Fehler, KEIN Content Download (Größen-Pre-Check)
- [ ] Größen-Pre-Check: Zuerst `$select=size,name,contentType`, dann erst voller Download
- [ ] 404 für ungültige attachment_id: NotFoundError
- [ ] 404 für ungültige message_id: NotFoundError
- [ ] itemAttachment: Hinweis "Item-Attachments werden nicht unterstützt"
- [ ] referenceAttachment: Hinweis "Reference-Attachments (Cloud-Links) werden nicht unterstützt"
- [ ] Inline-Attachment: Content-ID wird in Response mitgegeben
- [ ] Multi-Tenant: user_id → `/users/{user_id}/messages/{id}/attachments/{aid}`
- [ ] DSGVO: Kein Loggen von Dateiname, Dateiinhalt
- [ ] Zod-Validierung: message_id="" → ValidationError, attachment_id="" → ValidationError
- [ ] Boundary: Anhang mit 0 Bytes → leerer String/leeres Base64
- [ ] Boundary: Anhang mit exakt 4MB (4.194.304 Bytes) → KEIN Warning (Grenze ist >4MB)
- [ ] Boundary: Anhang mit exakt 10MB (10.485.760 Bytes) → Ablehnung (Grenze ist >10MB, also = abgelehnt? Klären!)

**Schema-Validierung (übergreifend):**
- [ ] MoveEmailParams.shape ist kompatibel mit server.tool() (ZodRawShapeCompat)
- [ ] ListAttachmentsParams.shape ist kompatibel
- [ ] DownloadAttachmentParams.shape ist kompatibel
- [ ] MoveEmailParams erbt WriteParams (idempotency_key, confirm)
- [ ] ListAttachmentsParams erbt BaseParams (user_id)
- [ ] DownloadAttachmentParams erbt BaseParams (user_id)

### Integration-Tests (Vitest + MSW)
- [ ] list_emails (hasAttachments=true) → list_attachments → download_attachment: Vollständiger Anhang-Workflow
- [ ] list_mail_folders → move_email: Ordner auflisten, dann E-Mail in gefundenen Ordner verschieben
- [ ] move_email dry_run → move_email confirm: Zwei-Schritt-Workflow (Vorschau → Verschieben)
- [ ] read_email → list_attachments: E-Mail lesen, dann Anhänge auflisten
- [ ] move_email → read_email mit NEUER message_id: Nach Verschieben die neue ID verwenden
- [ ] list_attachments → download_attachment (Text) → download_attachment (Binary): Verschiedene Typen im selben Flow
- [ ] search_emails → list_attachments: Suche nach "hasAttachments:true", dann Anhänge der gefundenen Mail

### E2E-Tests (M365 Developer Tenant)
- [ ] move_email: E-Mail in "Archive" verschieben, dann zurück in "Inbox" verschieben
- [ ] move_email: Prüfen dass message_id sich ändert
- [ ] list_attachments: Anhänge einer Test-Mail mit Anhang auflisten
- [ ] download_attachment: Text-Anhang (.txt) herunterladen und Content prüfen
- [ ] download_attachment: Binär-Anhang (.pdf) herunterladen und Base64-Validierung
- [ ] **Seed-Daten:** 1 E-Mail mit 3 Anhängen (1x .txt <1KB, 1x .pdf <1MB, 1x .png inline)
- [ ] **Seed-Daten:** 1 leerer benutzerdefinierter Ordner "MS-MCP-TestArchive" als Move-Ziel
- [ ] **Cleanup:** Verschobene E-Mails zurück in Inbox verschieben

---

## Agent-Aufteilung

| Agent | Dateien | Abhängigkeiten |
|---|---|---|
| A: move_email | `src/schemas/mail.ts` (Schema), `src/tools/mail-move.ts` (NEU), `tests/mail-move.test.ts` (NEU), `tests/mocks/handlers/mail-move.ts` (NEU) | WriteParams, confirmation, idempotency, errors, logger, graphClient (GET für Vorschau) |
| B: list_attachments + download_attachment | `src/schemas/mail.ts` (Schemas), `src/tools/mail-attachments.ts` (NEU), `src/utils/file-size.ts` (NEU — formatFileSize Utility), `tests/mail-attachments.test.ts` (NEU), `tests/mocks/handlers/mail-attachments.ts` (NEU) | BaseParams, errors, logger, graphClient |

**Merge-Konflikt-Strategie (Architect):**

1. **`src/schemas/mail.ts`** — Beide Agents fügen Schemas hinzu. A fügt `MoveEmailParams` hinzu, B fügt `ListAttachmentsParams` und `DownloadAttachmentParams` hinzu. Da verschiedene Namen am Dateiende: Merge trivial. Agent A und B können parallel arbeiten.

2. **MSW-Handler** — Separate Dateien (`mail-move.ts`, `mail-attachments.ts`). In `handlers/index.ts` per Spread zusammenführen. Kein Konflikt.

3. **`src/utils/file-size.ts`** — Nur von Agent B erstellt. Kein Konfliktpotential.

4. **`src/index.ts`** — Zwei neue `register*Tools()` Imports. Wenn das Tool-Registry-Pattern aus Sprint 2.1/2.2 steht, trivial.

**Empfohlene Reihenfolge:**
1. Agent A und Agent B können VOLLSTÄNDIG PARALLEL arbeiten (keine gegenseitigen Abhängigkeiten)
2. Finale Integration: Schemas zusammenführen, Handler-Index aktualisieren, Tool-Registrierung

**Abhängigkeiten zu vorherigen Sprints:**
- Agent A (move_email): Nutzt `list_mail_folders` (Sprint 2.1) für Ordnernamen-Auflösung in der Vorschau. **Aber:** Die Vorschau kann auch direkt `GET /me/mailFolders/{id}?$select=displayName` nutzen, ohne das list_mail_folders-Tool aufzurufen. Keine harte Abhängigkeit.
- Agent B (list_attachments + download_attachment): Unabhängig von Sprint 2.1/2.2. Nutzt nur BaseParams und Graph-Client.

---

## Phase-2-Abschluss

### Checkliste

- [ ] Alle 10 Mail-Tools implementiert und registriert (1 aus Phase 1, 9 aus Phase 2):
  - `list_emails` (Phase 1) — `src/tools/mail.ts`
  - `read_email` (Sprint 2.1) — `src/tools/mail-read.ts`
  - `list_mail_folders` (Sprint 2.1) — `src/tools/mail-folders.ts`
  - `search_emails` (Sprint 2.1) — `src/tools/mail-search.ts`
  - `send_email` (Sprint 2.2) — `src/tools/mail-send.ts`
  - `reply_email` (Sprint 2.2) — `src/tools/mail-reply.ts`
  - `forward_email` (Sprint 2.2) — `src/tools/mail-forward.ts`
  - `move_email` (Sprint 2.3) — `src/tools/mail-move.ts`
  - `list_attachments` (Sprint 2.3) — `src/tools/mail-attachments.ts`
  - `download_attachment` (Sprint 2.3) — `src/tools/mail-attachments.ts` (gleiche Datei wie list_attachments)
- [ ] Alle Cross-Cutting Concerns implementiert und getestet:
  - Context-Budget ($select pro Tool, maxItems, maxBodyLength, Body-Truncation)
  - Destructive Safety (confirm-Pattern bei send/reply/forward/move, dry_run bei move)
  - Idempotenz (idempotency_key bei allen destructive Tools, Duplicate Detection bei send)
  - Observability (pino structured logging, KEINE PII — automatisierter Test!)
  - Error-Mapping (Graph HTTP → McpToolError-Hierarchy → deutsche Fehlermeldungen)
  - Multi-Tenant (user_id Parameter auf allen Tools, korrekte Pfad-Auflösung)
- [ ] Shared Utilities erstellt:
  - `src/utils/recipients.ts` — toRecipients() für E-Mail-Format-Konvertierung
  - `src/utils/file-size.ts` — formatFileSize() für Größen-Anzeige
  - `src/utils/mail-context.ts` — fetchMailContext() für Vorschau-Abruf (optional)
- [ ] docs/TOOLS.md zeigt alle 10 Tools mit Beschreibung und Klassifizierung
- [ ] docs/PERMISSIONS.md zeigt Mail.Read, Mail.ReadWrite, Mail.Send mit Tool-Zuordnung
- [ ] E2E-Tests für kritische Pfade bestanden (list → read → reply Workflow)
- [ ] E2E-Seed-Daten sind idempotent erstellbar (seed.ts)
- [ ] Finales 3-Perspektiven-Review → Findings dokumentieren für Phase 3
- [ ] Coverage-Thresholds (60/50/60/60) werden eingehalten
- [ ] Keine `any`-Types, keine Non-Null-Assertions in neuem Code
- [ ] Alle neuen Dateien haben korrekte ESM-Imports (mit .js Extension)

## Akzeptanzkriterien

- [ ] Alle 3 neuen Tools registriert und via `tools/list` sichtbar
- [ ] move_email Confirmation + dry_run funktionieren (alle 4 Kombinationen getestet)
- [ ] move_email gibt NEUE message_id in Response zurück
- [ ] download_attachment Größen-Checks funktionieren (Pre-Check, Warning, Ablehnung)
- [ ] download_attachment erkennt Text-Dateien und gibt sie als Text zurück
- [ ] list_attachments unterscheidet File/Item/Reference Attachments
- [ ] KEINE PII in Logs — automatisierter Test vorhanden
- [ ] Alle Quality Gates bestanden (lint, typecheck, test, coverage)
- [ ] Phase-2-Checkliste komplett

---

## Review Notes (3-Perspektiven-Review)

### Senior Developer

1. **move_email message_id-Änderung:** Die Graph API `/move` gibt die verschobene Nachricht mit einer NEUEN `id` zurück. Das ist ein kritisches Detail, das im Original-Dokument fehlte. Jede nachfolgende Operation auf diese E-Mail muss die neue ID verwenden. Die Response des Tools MUSS die neue ID prominent anzeigen, z.B.: "E-Mail verschoben. Neue ID: AAMkAGI2... (ACHTUNG: Die alte ID ist nicht mehr gültig)."

2. **download_attachment Größen-Pre-Check:** Ein zweistufiger Ansatz ist nötig:
   - Schritt 1: `GET /me/messages/{id}/attachments/{aid}?$select=size,name,contentType` (kein contentBytes!)
   - Schritt 2: Wenn size OK, `GET /me/messages/{id}/attachments/{aid}` (mit contentBytes)
   Das sind 2 API-Calls, aber vermeidet das Laden von 10MB+ Daten in den Speicher.

3. **Attachment-Typ-Einschränkung:** Nur `fileAttachment` wird vollständig unterstützt. `itemAttachment` (eingebettete E-Mails) und `referenceAttachment` (OneDrive-Links) werden mit einem informativen Hinweis abgelehnt. Dies ist für Sprint 2.3 ausreichend — volle Unterstützung kann in Phase 7 als Enhancement nachgereicht werden.

4. **Text-Erkennung-Logik:** Die Erkennung basiert auf Content-Type UND Dateiendung. Priority: Content-Type zuerst (ist zuverlässiger). Dateiendung als Fallback, wenn Content-Type `application/octet-stream` ist (passiert häufig bei unbekannten Dateitypen). Regex für Text-Content-Types: `/^text\//` oder explizite Liste: `application/json`, `application/xml`, `application/javascript`, `application/csv`.

5. **formatFileSize() Utility:** Eigene Datei `src/utils/file-size.ts` statt in mail-attachments.ts inline. Wird auch in Phase 4 (OneDrive) wiederverwendet. Implementation:
   ```typescript
   export function formatFileSize(bytes: number): string {
     if (bytes < 1024) return `${bytes} B`;
     if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
     if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
     return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
   }
   ```

6. **dry_run Semantik klargestellt:** dry_run ist STÄRKER als confirm. `dry_run=true, confirm=true` ergibt Vorschau, NICHT Ausführung. Das ist konsistent mit Unix-Konventionen (`--dry-run` überschreibt alles). Die Logik ist: `if (dry_run) → preview; else if (!confirm) → preview; else → execute`.

### Senior Architect

1. **Keine zusätzlichen Cross-Cutting Concerns nötig:** Sprint 2.3 nutzt dieselben Patterns wie Sprint 2.2 (confirmation, idempotency, error-mapping, logging). Keine neuen Infrastruktur-Erweiterungen nötig. Das ist ein Zeichen, dass die Phase-1-Infrastruktur gut designed ist.

2. **File-Splitting konsistent:** Die Aufteilung in `mail-move.ts` und `mail-attachments.ts` folgt dem in Sprint 2.2 etablierten Pattern. `list_attachments` und `download_attachment` teilen sich eine Datei (`mail-attachments.ts`), da sie thematisch zusammengehören und vom selben Agent implementiert werden. Analog zu `list_emails` und `search_emails` könnten sie auch separate Dateien haben, aber die thematische Zusammengehörigkeit rechtfertigt die gemeinsame Datei.

3. **Abhängigkeits-Graph der gesamten Phase 2:**
   ```
   Phase 1 (list_emails, Infrastruktur)
     ├── Sprint 2.1 (read_email, list_mail_folders, search_emails)
     │     └── Sprint 2.3 (move_email nutzt list_mail_folders für Vorschau)
     ├── Sprint 2.2 (send_email, reply_email, forward_email)
     │     └── Recipients-Utility wird von Sprint 2.2 erstellt
     └── Sprint 2.3 (list_attachments, download_attachment — unabhängig von 2.1/2.2)
   ```
   Sprint 2.3 ist fast vollständig unabhängig. Nur `move_email` hat eine weiche Abhängigkeit auf `list_mail_folders` für die Ordnernamen-Auflösung — aber nutzt einen direkten GET-Call, kein Tool.

4. **Phase-3-Vorbereitung:** Die in Phase 2 etablierten Patterns (Tool-Dateien, Schema-Organisation, Handler-Split, Test-Strategie) werden 1:1 auf Phase 3 (Kalender) übertragbar sein. Die Lernkurve für Phase 3 ist daher deutlich geringer. Empfehlung: Phase-3-Sprint-Planung kann bereits parallel zum Sprint 2.3 beginnen, da die Struktur klar ist.

5. **IdempotencyCache user_id-Erweiterung:** In Sprint 2.2 Review Notes wurde identifiziert, dass der Cache-Key den `user_id` einbeziehen sollte. Falls dies bis Sprint 2.3 nicht umgesetzt wurde: MUSS in Sprint 2.3 als Review Debt aufgenommen werden. Move mit verschiedenen user_ids und gleichem idempotency_key darf nicht zum Cache-Hit führen.

### Senior Tester

1. **download_attachment Grenzwerte klären:** Die Spezifikation sagt "Warnung wenn >4MB, Abbruch wenn >10MB". Aber: Was passiert bei EXAKT 4MB und EXAKT 10MB?
   - Empfehlung: `size > 4 * 1024 * 1024` → Warnung (exakt 4MB = OK)
   - Empfehlung: `size > 10 * 1024 * 1024` → Abbruch (exakt 10MB = Warnung, NICHT Abbruch)
   - Oder: `size >= 10 * 1024 * 1024` → Abbruch (exakt 10MB = Abbruch)
   - **Entscheidung muss getroffen und in Tests codiert werden!** Boundary-Tests für exakte Grenzen hinzugefügt.

2. **move_email Idempotenz-Komplikation:** Beim Verschieben ändert sich die message_id. Wenn der User denselben `idempotency_key` mit derselben (alten) `message_id` sendet, gibt der Cache das alte Ergebnis zurück (mit der NEUEN message_id). Das ist korrekt — aber der Test muss verifizieren, dass die gecachte Response die NEUE ID enthält, nicht die alte.

3. **Attachment-Typen-Matrix:** Folgende Kombinationen testen:

   | Attachment-Typ | Größe | Content-Type | Erwartet |
   |---|---|---|---|
   | fileAttachment | 100 B | text/plain | Text-Inhalt direkt |
   | fileAttachment | 500 KB | application/pdf | Base64 |
   | fileAttachment | 5 MB | image/png | Base64 + Warnung |
   | fileAttachment | 11 MB | application/zip | Abbruch |
   | fileAttachment | 0 B | text/plain | Leerer String |
   | itemAttachment | any | message/rfc822 | "Nicht unterstützt" |
   | referenceAttachment | N/A | N/A | "Nicht unterstützt" |

4. **E2E-Seed-Daten für Attachments:** Das Test-Postfach braucht eine E-Mail mit mehreren Anhängen verschiedener Typen. Die Seed-Daten müssen via Graph API erstellt werden (nicht manuell):
   ```typescript
   // seed.ts Auszug
   const message = await graphClient.api("/me/messages").post({
     subject: "MS-MCP-E2E-Attachments",
     body: { contentType: "Text", content: "Test-Mail mit Anhängen" },
     toRecipients: [{ emailAddress: { address: testUser } }],
     attachments: [
       { "@odata.type": "#microsoft.graph.fileAttachment", name: "test.txt", contentBytes: btoa("Hello World"), contentType: "text/plain" },
       { "@odata.type": "#microsoft.graph.fileAttachment", name: "test.pdf", contentBytes: btoa("fake-pdf-content"), contentType: "application/pdf" },
     ]
   });
   ```

5. **move_email Undo-Test (E2E):** Der E2E-Test verschiebt eine Mail nach "Archive" und dann zurück nach "Inbox". Dabei ändert sich die ID ZWEIMAL. Der Test muss beide neuen IDs tracken. Dies ist ein guter Integrationstest für die Korrektheit der ID-Weitergabe.

6. **Phase-2-Abschluss Smoke-Test:** Nach Sprint 2.3 einen End-to-End Workflow testen, der alle 10 Tools nutzt:
   ```
   list_mail_folders → list_emails (inbox) → search_emails → read_email →
   reply_email (confirm=false) → reply_email (confirm=true) →
   forward_email → send_email → list_attachments → download_attachment →
   move_email (archive) → move_email (inbox, mit neuer ID)
   ```
   Dies validiert, dass alle Tools korrekt zusammenarbeiten.
