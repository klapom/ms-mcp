# Sprint 2.1 — Read-Only Mail Tools + Review Debt

**Phase:** 2 (Mail-Modul)
**Ziel:** Lesende Mail-Tools implementieren, Review-Schulden aus Phase 1 abbauen
**Parallelisierung:** 3 Agents (A: read_email | B: list_mail_folders + search_emails | C: Review Debt)

---

## Review Debt (IMPORTANT/CRITICAL aus Phase 1 Reviews)

### Senior Developer
- [ ] `src/auth/graph-client.ts:100-114` — JSDoc-Kommentare referenzieren noch "MsalClient" statt "GraphClientDeps". Alle Docs aktualisieren.

### Senior Tester
- [ ] `tests/mail.test.ts:199-235` — Error-Tests verlassen sich auf GraphError-Wrapper-Verhalten (code-Feld). Annahme dokumentieren und Guard-Assertion (`expect(e).toHaveProperty("statusCode")`) hinzufügen.
- [ ] `tests/middleware.test.ts:593-612` — "MSAL network failure"-Test ist identisch mit ECONNREFUSED-Test. Durch sinnvollen Test ersetzen (z.B. MSAL-spezifische Fehler-Shape oder Auth-Middleware-Position in Chain).

### Senior Architect
- [ ] `src/index.ts:34-35` — MsalClient wird direkt in `main()` instanziiert ohne DI-Seam. Factory-Pattern einführen für Testbarkeit und alternative Auth-Flows (Phase 5+).

---

## Features

### F-2.1.1: `read_email` Tool (Agent A)

**Graph API:** `GET /me/messages/{id}`
**Klassifizierung:** safe (read-only)
**Permission:** Mail.Read
**Hinweis:** Kein `/me/mailFolders/{folder}/messages/{id}` nötig — die message_id ist global eindeutig innerhalb eines Postfachs. Der Graph-Endpunkt `GET /me/messages/{id}` findet die E-Mail unabhängig vom Ordner.

**Funktionalität:**
- E-Mail mit vollständigem Body und Metadaten abrufen
- `$select` für Context-Budget: subject, from, toRecipients, ccRecipients, body, receivedDateTime, hasAttachments, importance, isRead, conversationId, internetMessageId
- Body-Truncation via `maxBodyLength` (Config)
- HTML-Body zu Plain-Text konvertieren (optional, default: text)
- **Implementation Note:** Für HTML→Text-Konvertierung `html-to-text` (npm) verwenden — unterstützt Tabellen, Links, Listen. Alternative: `turndown` (→ Markdown). Empfehlung: `html-to-text` mit Option `{ wordwrap: 120, selectors: [{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } }] }`

**Schema:** `src/schemas/mail.ts` → `ReadEmailParams` (extends BaseParams)
```typescript
ReadEmailParams = BaseParams.extend({
  message_id: z.string().min(1)
    .describe("ID der E-Mail (aus list_emails oder search_emails)"),
  format: z.enum(["text", "html"]).default("text")
    .describe("Body-Format: 'text' konvertiert HTML zu Plain-Text, 'html' liefert Original-HTML"),
  max_body_length: z.number().int().positive().max(50000).optional()
    .describe("Maximale Body-Länge in Zeichen. Default: config.limits.maxBodyLength (5000). Für vollständigen Body: 50000"),
  include_internet_headers: z.boolean().default(false)
    .describe("Wenn true, werden Internet-Message-Headers wie Message-ID und In-Reply-To mitgeliefert"),
})
```

**Hinweis zur $select:** Die Standard-$select für read_email muss MEHR Felder als list_emails enthalten:
`id, subject, from, toRecipients, ccRecipients, bccRecipients, body, receivedDateTime, hasAttachments, importance, isRead, conversationId, internetMessageId, replyTo, sentDateTime, parentFolderId`

**MSW-Handler:**
- GET /me/messages/{id} → Erfolgsresponse mit vollständigem Body (HTML-Body mit `<p>`, `<a>`, `<table>` Tags für Konvertierungstest)
- GET /me/messages/nonexistent → 404 `{ error: { code: "ErrorItemNotFound", message: "The specified object was not found in the store." } }`
- GET /me/messages/{id} (mit `$select`) → Response mit nur den angeforderten Feldern
- GET /users/{user_id}/messages/{id} → Erfolgsresponse (Multi-Tenant-Pfad)

---

### F-2.1.2: `list_mail_folders` Tool (Agent B)

**Graph API:** `GET /me/mailFolders`
**Klassifizierung:** safe (read-only)
**Permission:** Mail.Read

**Funktionalität:**
- Alle Mail-Ordner des Benutzers auflisten
- `$select`: id, displayName, parentFolderId, childFolderCount, totalItemCount, unreadItemCount
- Pagination via `top`/`skip`
- **Hinweis:** `GET /me/mailFolders` liefert nur Top-Level-Ordner. Unterordner werden via `GET /me/mailFolders/{id}/childFolders` abgerufen. In Sprint 2.1 nur Top-Level implementieren; verschachtelte Ordner als Enhancement für später markieren.
- **Hinweis:** Well-known Folder Names (`inbox`, `sentitems`, `drafts`, `deleteditems`, `junkemail`, `outbox`, `archive`) werden von der Graph API als IDs akzeptiert. Dies in der Tool-Description dokumentieren.
- **Implementation Note:** `includeHiddenFolders` gibt es in der Graph API nicht — unsichtbare Ordner wie "Conversation History" werden standardmäßig zurückgegeben. Nicht filtern.

**Schema:** `src/schemas/mail.ts` → `ListMailFoldersParams` (extends ListParams)
```typescript
ListMailFoldersParams = ListParams.extend({
  // ListParams bringt bereits: user_id?, top? (max 100), skip?
  include_children: z.boolean().default(false)
    .describe("Wenn true, werden auch Unterordner (1 Ebene tief) mit $expand=childFolders aufgelistet"),
})
```

**Hinweis:** `ListParams` (aus `common.ts`) liefert bereits `user_id`, `top` (max 100), `skip`. Kein eigenes Schema für diese Felder nötig.

**MSW-Handler:**
- GET /me/mailFolders → Liste mit Well-Known-Folders: `[{ id: "AAMk...", displayName: "Inbox", parentFolderId: "AAMk...", childFolderCount: 2, totalItemCount: 142, unreadItemCount: 5 }, ...]` — mindestens 6 Ordner (Inbox, Sent, Drafts, Deleted, Junk, Archive)
- GET /me/mailFolders (leerer Mailbox-Case) → `{ value: [] }` (unwahrscheinlich, aber defensiv testen)
- GET /me/mailFolders?$top=2 → Pagination mit `@odata.nextLink`
- GET /users/{user_id}/mailFolders → Multi-Tenant-Pfad

---

### F-2.1.3: `search_emails` Tool (Agent B)

**Graph API:** `GET /me/messages?$search="..."` (KQL) oder `GET /me/messages?$filter=...`
**Klassifizierung:** safe (read-only)
**Permission:** Mail.Read

**Funktionalität:**
- Volltext-Suche über E-Mails via KQL ($search)
- Strukturierte Suche via OData ($filter)
- Kombination von $search und $filter
- Relevanz-Sortierung bei $search, ansonsten konfigurierbar

**WICHTIG — Graph API $search Einschränkungen:**
1. `$search` und `$orderby` können NICHT kombiniert werden (Graph API Limitation). Bei `$search` wird automatisch nach Relevanz sortiert.
2. `$search` und `$filter` können kombiniert werden, aber nur mit bestimmten Feldern (`from`, `subject`, `receivedDateTime`, etc.) — NICHT mit `body`.
3. `$search` erfordert KQL-Syntax: `"subject:Angebot"`, `"from:mueller"`, `"body:Projekt AND hasAttachments:true"`
4. `$search`-Queries müssen URL-encoded und in doppelte Anführungszeichen eingeschlossen werden.
5. `$skip` wird bei `$search` NICHT unterstützt (Graph API Limitation). Pagination nur über `@odata.nextLink`.

**Implementation Note:** Da `list_emails` bereits `search` und `filter` als Parameter hat, muss klar abgegrenzt werden: `search_emails` ist für explizite Suchintention optimiert (bessere Tool-Description für LLM-Routing), während `list_emails` für ordnerbasiertes Browsen gedacht ist. Interner Code kann dieselbe Query-Logik teilen.

**Schema:** `src/schemas/mail.ts` → `SearchEmailsParams` (extends ListParams)
```typescript
SearchEmailsParams = ListParams.extend({
  // ListParams bringt: user_id?, top? (max 100), skip?
  query: z.string().min(1).max(500)
    .describe("KQL-Suchbegriff, z.B. 'subject:Angebot', 'from:mueller', 'body:Projekt AND hasAttachments:true'"),
  folder: z.string().optional()
    .describe("Mail-Ordner einschränken (well-known name oder ID). Default: alle Ordner"),
  filter: z.string().optional()
    .describe("Zusätzlicher OData $filter, z.B. 'receivedDateTime ge 2025-01-01T00:00:00Z'"),
  orderby: z.string().optional()
    .describe("OData $orderby — ACHTUNG: kann NICHT mit $search kombiniert werden. Wird bei $search ignoriert."),
})
```

**Hinweis zu `skip`:** Da `$skip` bei `$search` nicht unterstützt wird, sollte die Implementierung bei vorhandenem `query` den `skip`-Parameter ignorieren und stattdessen auf `@odata.nextLink`-basierte Pagination hinweisen.

**MSW-Handler:**
- GET /me/messages?$search="subject:Test" → Suchergebnisse (3-5 Items, nach Relevanz sortiert, KEIN `@odata.count`)
- GET /me/mailFolders/{folder}/messages?$search="..." → Ordner-spezifische Suche
- GET /me/messages?$search="..."&$filter=receivedDateTime... → Kombinierte Suche
- GET /me/messages?$search="nonexistent_term_xyz" → Leere Ergebnisse `{ value: [] }`
- GET /me/messages?$search="..."&$orderby=... → 400 Bad Request (Graph API Limitation simulieren)
- GET /users/{user_id}/messages?$search="..." → Multi-Tenant-Pfad

---

## Tests

### Unit-Tests (Vitest + MSW)

**read_email (Agent A):**
- [ ] Happy Path: Body + alle Metadaten korrekt extrahiert
- [ ] format="text": HTML-Body wird korrekt zu Plain-Text konvertiert (Tabellen, Links, Listen)
- [ ] format="html": HTML-Body wird unverändert zurückgegeben
- [ ] max_body_length: Body wird bei Überschreitung korrekt truncated mit Hinweis
- [ ] max_body_length=50000: Großer Body wird vollständig zurückgegeben
- [ ] 404 Not Found: Korrekte NotFoundError-Message mit message_id
- [ ] 401 Unauthorized: AuthError mit Hinweis auf Token-Erneuerung
- [ ] 403 Forbidden: AuthError mit requiredScope "Mail.Read"
- [ ] Multi-Tenant: user_id gesetzt → Pfad `/users/{user_id}/messages/{id}`
- [ ] include_internet_headers=true: Zusätzliche Headers in Response
- [ ] E-Mail ohne Body (body.content === ""): Kein Crash, leerer String
- [ ] E-Mail mit body.contentType "text" (kein HTML): Direkt zurückgeben ohne Konvertierung
- [ ] Response enthält conversationId für Thread-Kontext
- [ ] $select enthält korrekte erweiterte Feldliste (nicht die list_emails-Felder)
- [ ] Zod-Validierung: message_id="" → ValidationError, message_id fehlt → ValidationError

**list_mail_folders (Agent B):**
- [ ] Happy Path: Alle Well-Known-Folders korrekt aufgelistet
- [ ] Pagination: top=2 → nur 2 Ordner + paginationHint mit skip
- [ ] Leere Ordner-Liste: `{ value: [] }` → leere Liste, keine Exception
- [ ] include_children=true: Unterordner mit $expand=childFolders
- [ ] Ordner mit childFolderCount > 0: Korrekt dargestellt
- [ ] Multi-Tenant: user_id → `/users/{user_id}/mailFolders`
- [ ] Response-Format: Enthält totalItemCount und unreadItemCount pro Ordner
- [ ] Zod-Validierung: top=0 → ValidationError (positive), top=101 → ValidationError (max 100)
- [ ] Zod-Validierung: skip=-1 → ValidationError (nonnegative)

**search_emails (Agent B):**
- [ ] KQL-Suche: query="subject:Test" → Ergebnisse nach Relevanz
- [ ] Filter-Kombination: query + filter → beides wird korrekt an Graph API übergeben
- [ ] Leere Ergebnisse: query="nonexistent" → leere Liste, freundliche Meldung
- [ ] Ordner-Einschränkung: folder="sentitems" → Pfad `/me/mailFolders/sentitems/messages?$search=...`
- [ ] $search + $orderby Konflikt: orderby wird bei vorhandenem query ignoriert (mit Log-Warnung)
- [ ] $search + $skip Limitation: skip wird bei vorhandenem query ignoriert (mit Hinweis in Response)
- [ ] Boundary: query mit Sonderzeichen (Umlaute, Anführungszeichen) → korrekt URL-encoded
- [ ] Boundary: query.length=500 → akzeptiert; query.length=501 → ValidationError
- [ ] Multi-Tenant: user_id → `/users/{user_id}/messages?$search=...`
- [ ] Zod-Validierung: query="" → ValidationError (min 1), query fehlt → ValidationError

**Schema-Validierung (alle Tools, kann in separatem describe-Block):**
- [ ] ReadEmailParams: Defaults korrekt (format="text", include_internet_headers=false)
- [ ] ListMailFoldersParams: Erbt top/skip/user_id von ListParams
- [ ] SearchEmailsParams: query ist Pflichtfeld, rest optional
- [ ] Alle Schemas: `.shape` ist kompatibel mit `server.tool()` (ZodRawShapeCompat)

### Integration-Tests (Vitest + MSW)
- [ ] read_email nach list_emails: E-Mail-ID aus Liste → read_email → vollständiger Body
- [ ] search_emails → read_email: Suchen, erste ID nehmen, lesen
- [ ] list_mail_folders → list_emails mit folder-Parameter: Ordner auflisten, dann Mails darin
- [ ] search_emails mit folder → list_mail_folders: Suche in spezifischem Ordner, der via list_mail_folders ermittelt wurde
- [ ] read_email + format="text" auf HTML-Body: Durchgängiger Flow von Suche bis formatierter Ausgabe

### E2E-Tests (M365 Developer Tenant)
- [ ] Vitest E2E-Config (`vitest.config.e2e.ts`) anlegen mit separatem `include`-Pattern und längeren Timeouts
- [ ] E2E-Setup: Auth gegen Developer Tenant via Client Credentials (für CI) oder Device Code (lokal)
- [ ] **Seed-Daten:** Mindestens 5 Test-Mails in Inbox (davon 2 ungelesen, 1 mit HTML-Body, 1 mit Anhang, 1 mit hoher Importance)
- [ ] **Seed-Daten:** Mindestens 1 benutzerdefinierter Ordner mit 2 Mails darin
- [ ] read_email: echte E-Mail lesen → Body und Metadaten prüfen
- [ ] list_mail_folders: echte Ordner auflisten → Well-Known-Folders vorhanden
- [ ] search_emails: echte Suche nach bekanntem Betreff → Ergebnis gefunden
- [ ] search_emails: Suche nach nicht-existentem Term → leere Liste
- [ ] **Fixture Recording:** E2E-Responses als sanitized Fixtures nach `tests/mocks/fixtures/` schreiben

---

## Agent-Aufteilung

| Agent | Dateien | Abhängigkeiten |
|---|---|---|
| A: read_email | `src/schemas/mail.ts` (Schema hinzufügen), `src/tools/mail-read.ts` (NEU), `tests/mail-read.test.ts` (NEU), `tests/mocks/handlers/mail.ts` (Handler hinzufügen) | BaseParams, response-shaper, errors, logger, pagination |
| B: list_mail_folders + search_emails | `src/schemas/mail.ts` (Schemas hinzufügen), `src/tools/mail-folders.ts` (NEU), `src/tools/mail-search.ts` (NEU), `tests/mail-folders.test.ts` (NEU), `tests/mail-search.test.ts` (NEU), `tests/mocks/handlers/mail.ts` (Handler hinzufügen) | ListParams, response-shaper, errors, logger, pagination |
| C: Review Debt | `src/auth/graph-client.ts`, `src/index.ts`, `tests/mail.test.ts`, `tests/middleware.test.ts` | Keine |

**Merge-Konflikt-Strategie (Architect):**

1. **`src/schemas/mail.ts`** — Beide Agents A und B fügen Schemas hinzu. **Lösung:** Agent A fügt `ReadEmailParams` VOR Agent B ans Dateiende an. Agent B fügt `ListMailFoldersParams` und `SearchEmailsParams` danach hinzu. Alternativ: Agent A und B arbeiten sequentiell auf dieser Datei (A zuerst, dann B).

2. **Tool-Dateien** — Separate Dateien pro Agent (`mail-read.ts`, `mail-folders.ts`, `mail-search.ts`) vermeiden Konflikte komplett. Jede Datei exportiert eine `register*Tools(server, graphClient, config)` Funktion.

3. **`src/index.ts`** — Muss alle neuen Tool-Registrierungen importieren. **Lösung:** Agent C (Review Debt) kümmert sich um den DI-Refactor in `index.ts`. A und B liefern nur die Export-Funktionen. C integriert am Ende alle.

4. **`tests/mocks/handlers/mail.ts`** — Beide Agents erweitern die Handler. **Lösung:** Handler in separaten Dateien (`handlers/mail-read.ts`, `handlers/mail-folders.ts`, `handlers/mail-search.ts`) definieren, dann in `handlers/mail.ts` re-exportieren/spreaden. Alternativ: Handler-Arrays per Spread zusammenführen.

5. **Test-Dateien** — Separate Test-Dateien pro Agent eliminieren Konflikte vollständig.

**Empfohlene Reihenfolge:**
1. Agent C startet sofort (Review Debt hat keine Abhängigkeiten)
2. Agent A startet sofort (read_email hat keine Abhängigkeit auf B)
3. Agent B startet sofort (list_mail_folders + search_emails sind unabhängig von A)
4. Finale Integration: Alle Tool-Registrierungen in `index.ts` zusammenführen

**Dependency: `html-to-text` Package:**
Agent A benötigt `html-to-text` als neue Dependency. Muss VOR Agent A in `package.json` hinzugefügt werden:
```bash
pnpm add html-to-text && pnpm add -D @types/html-to-text
```

---

## Akzeptanzkriterien

- [ ] Alle neuen Tools registriert und via `tools/list` sichtbar
- [ ] Alle Quality Gates bestanden (lint, typecheck, test)
- [ ] docs/TOOLS.md und docs/PERMISSIONS.md aktualisiert
- [ ] Review Debt komplett abgebaut
- [ ] E2E-Infrastruktur lauffähig (mindestens Config + Auth)
- [ ] `html-to-text` Dependency installiert und typisiert
- [ ] read_email HTML→Text Konvertierung funktioniert für typische Business-E-Mails (Outlook, Gmail)
- [ ] search_emails: $search + $orderby Limitation ist dokumentiert und defensiv behandelt
- [ ] Coverage-Thresholds (60/50/60/60) werden weiterhin eingehalten

---

## Review Notes (3-Perspektiven-Review)

### Senior Developer

1. **read_email Graph-Endpunkt:** Das Sprint-Dokument listete ursprünglich `GET /me/mailFolders/{folder}/messages/{id}` als Alternative. Das ist unnötig — die message_id ist global eindeutig innerhalb eines Postfachs. `GET /me/messages/{id}` findet die E-Mail unabhängig vom Ordner. Korrigiert.

2. **HTML→Text-Konvertierung:** Die Bibliothekswahl muss früh getroffen werden. `html-to-text` ist die etablierteste Option mit 5M+ Downloads/Woche. `turndown` wäre eine Alternative für Markdown-Output, aber Plain-Text ist für LLM-Kontext besser geeignet. Die `@types/html-to-text` Typen sind vorhanden.

3. **$select-Unterschied read vs. list:** Die `$select`-Felder für `read_email` müssen signifikant mehr enthalten als für `list_emails` (z.B. `body`, `toRecipients`, `ccRecipients`, `bccRecipients`, `replyTo`). Dies sollte als eigene Konstante in `response-shaper.ts` definiert werden: `DEFAULT_SELECT.mailDetail = [...]`.

4. **SearchEmailsParams vs. ListEmailsParams Überlappung:** `search_emails` und `list_emails` teilen viel Logik. Der `search`-Parameter existiert bereits auf `ListEmailsParams`. Die Implementierung sollte intern dieselbe Query-Builder-Funktion nutzen. Die Abgrenzung ist rein auf Tool-Ebene (bessere LLM-Tool-Selection via unterschiedliche Descriptions).

5. **Graph API $search Encoding:** KQL-Queries müssen in doppelte Anführungszeichen eingeschlossen werden: `$search="subject:Test"`. Dies muss in der Implementierung automatisch passieren, nicht vom User erwartet werden. Die Zod-Schema-Description sollte das klarstellen.

### Senior Architect

1. **File-Split-Strategie bestätigt:** Die Aufteilung in `mail-read.ts`, `mail-folders.ts`, `mail-search.ts` ist korrekt für Parallelisierung. Jede Datei exportiert eine `register*Tools()` Funktion. In `src/index.ts` werden alle registriert. Dies setzt das Pattern für Sprint 2.2 (separate Dateien pro Tool).

2. **Schema-Datei als Shared Resource:** `src/schemas/mail.ts` ist die einzige echte Konflikt-Quelle. Da Schemas nur am Dateiende angefügt werden (kein Refactoring bestehender Schemas), ist der Merge-Aufwand gering. Trotzdem: Agent A sollte zuerst mergen, dann Agent B.

3. **DI-Refactor (Review Debt, Agent C):** Die Einführung eines Factory-Patterns in `src/index.ts` ist der richtige Zeitpunkt, da ohnehin neue Tool-Registrierungen hinzukommen. Empfehlung: `createToolRegistry(server, graphClient, config)` Funktion, die alle `register*Tools()` aufruft. Das vermeidet eine wachsende `main()` Funktion.

4. **`response-shaper.ts` Erweiterung:** `DEFAULT_SELECT` muss um `mailDetail` (für read_email) und `mailFolder` (für list_mail_folders) erweitert werden. Dies ist ein geteilter Zustand, der von Agent A und B geschrieben wird. **Lösung:** Agent A fügt `mailDetail` hinzu, Agent B fügt `mailFolder` hinzu. Da es verschiedene Keys im selben Objekt sind, ist der Merge trivial.

5. **Sprint-Abhängigkeiten:** Sprint 2.1 hat keine Abhängigkeit zu Sprint 2.2 oder 2.3. Sprint 2.2 hängt ab von: WriteParams (existiert), confirmation.ts (existiert), idempotency.ts (existiert). Sprint 2.3 hängt ab von: list_mail_folders (Sprint 2.1), read_email (Sprint 2.1). Die Reihenfolge 2.1 → 2.2 → 2.3 ist korrekt, wobei 2.2 parallel zu 2.1 starten KÖNNTE (keine Laufzeit-Abhängigkeit, nur Schema-Abhängigkeit).

### Senior Tester

1. **Fehlende Error-Kombinationstests:** Das Testplan-Original hatte keine Tests für 401/403 bei read_email. Ergänzt. Auch fehlten Boundary-Tests für query-Länge bei search_emails.

2. **HTML→Text Edge Cases:** Die Format-Konvertierung braucht Tests für:
   - Outlook-generierte HTML (stark verschachtelte `<div>`, `<span>`, `<!--[if mso]>` Conditional Comments)
   - Gmail-generierte HTML (inline CSS, `<div dir="ltr">` Wrapper)
   - Leerer HTML-Body (`<html><body></body></html>` → leerer String)
   - Body mit nur Bildern/Inline-Attachments (kein Text)
   - Body mit Tabellen (z.B. Signatur-Tabelle)

3. **MSW-Handler-Qualität:** Die Handler müssen realistische Graph-API-Responses liefern. Empfehlung: Echte Fixture-Dateien aus dem Developer Tenant als Basis. Mindestens die `@odata.context`, `@odata.count` (wo applicable), und `@odata.nextLink` Felder korrekt simulieren.

4. **E2E Seed-Daten-Strategie:** Für reproduzierbare E2E-Tests braucht der Developer Tenant:
   - 1 Test-User mit bekanntem Postfach
   - 5+ E-Mails mit deterministischen Betreffzeilen (z.B. "MS-MCP-Test-001", "MS-MCP-Test-002")
   - 1 E-Mail mit HTML-Body (Tabelle + Link + Bild)
   - 1 E-Mail mit Anhang (für Sprint 2.3 vorbereiten)
   - 1 benutzerdefinierter Ordner "MS-MCP-TestFolder" mit 2 E-Mails
   - Ein `seed.ts` Script, das diese Daten idempotent erstellt (prüft ob vorhanden, erstellt nur fehlende)

5. **$search + $orderby Limitation:** Dieser Test ist kritisch, da die Graph API einen 400-Fehler zurückgibt. Der MSW-Handler muss dieses Verhalten korrekt simulieren (nicht einfach ignorieren). Die Implementierung muss den `orderby`-Parameter bei vorhandenem `query` proaktiv entfernen und eine Warnung loggen.

6. **Pagination-Edge-Cases für search_emails:** `$skip` wird bei `$search` nicht unterstützt. Wenn ein User `skip=25` mit `query` übergibt, muss die Implementierung dies graceful behandeln (ignorieren + Hinweis in Response). Test dafür ergänzt.
