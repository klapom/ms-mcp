# Sprint 2.2 — Destructive Mail Tools (Send / Reply / Forward)

**Phase:** 2 (Mail-Modul)
**Ziel:** Erste schreibende/destruktive Tools mit vollständigem Safety-Pattern
**Parallelisierung:** 3 Agents (A: send_email | B: reply_email | C: forward_email)

---

## Review Debt (IMPORTANT/CRITICAL aus Sprint 2.1 Review)

> Wird nach Sprint 2.1 Review ausgefüllt.

- [ ] _placeholder_

---

## Features

### F-2.2.1: `send_email` Tool (Agent A)

**Graph API:** `POST /me/sendMail`
**Klassifizierung:** destructive (confirm-Pattern + Idempotenz)
**Permission:** Mail.Send

**Funktionalität:**
- E-Mail senden mit To, CC, BCC, Subject, Body, Importance
- **Confirmation-Pattern:** Ohne `confirm: true` → Vorschau zurückgeben
- **Idempotenz:** `idempotency_key` → bei gleichem Key vorheriges Ergebnis zurückgeben
- **Duplicate Detection:** Hash aus to+subject+body_first_200_chars → Warnung bei Duplikat innerhalb 2 Min
- Body als HTML oder Plain-Text
- Optionale Anhänge (Base64, <4MB pro Anhang) — **Sprint 2.3 liefert `list_attachments`/`download_attachment`, Anhänge bei send_email erst implementieren wenn Basis-Send stabil ist. Anhang-Support als separates Enhancement nach Sprint 2.3.**
- **saveToSentItems:** Default `true`, optional `false` (Graph API unterstützt dies)

**Graph API Request Body Format:**
```json
{
  "message": {
    "subject": "...",
    "body": { "contentType": "Text|HTML", "content": "..." },
    "toRecipients": [{ "emailAddress": { "address": "...", "name": "..." } }],
    "ccRecipients": [...],
    "bccRecipients": [...],
    "importance": "low|normal|high"
  },
  "saveToSentItems": true
}
```

**Schema:** `src/schemas/mail.ts` → `SendEmailParams` (extends WriteParams)
```typescript
SendEmailParams = WriteParams.extend({
  // WriteParams bringt: user_id?, idempotency_key?, confirm (default: false)
  to: z.array(z.string().email("Ungültige E-Mail-Adresse")).min(1).max(500)
    .describe("Empfänger-E-Mail-Adressen (mindestens 1, max 500)"),
  cc: z.array(z.string().email()).max(500).optional()
    .describe("CC-Empfänger"),
  bcc: z.array(z.string().email()).max(500).optional()
    .describe("BCC-Empfänger"),
  subject: z.string().min(1).max(255)
    .describe("Betreff der E-Mail"),
  body: z.string().min(1).max(100000)
    .describe("E-Mail-Body (Plain-Text oder HTML je nach body_type)"),
  body_type: z.enum(["text", "html"]).default("text")
    .describe("Body-Format: 'text' für Plain-Text, 'html' für HTML"),
  importance: z.enum(["low", "normal", "high"]).default("normal")
    .describe("Wichtigkeit der E-Mail"),
  save_to_sent_items: z.boolean().default(true)
    .describe("E-Mail in 'Gesendete Elemente' speichern (default: true)"),
})
```

**Implementation Notes:**
- Die Empfänger müssen in das Graph-API-Format `{ emailAddress: { address: "..." } }` konvertiert werden. Utility-Funktion `toRecipients(emails: string[])` erstellen.
- Duplicate Detection: SHA-256 Hash aus `sorted(to).join(",") + subject.toLowerCase() + body.slice(0, 200)`. Cache mit 2 Min TTL (separater Map, nicht der IdempotencyCache).
- Bei `confirm=false`: Vorschau MUSS den Body-Auszug (erste 200 Zeichen), alle Empfänger und den Betreff anzeigen. Nutze `formatPreview()` aus `confirmation.ts`.
- **DSGVO-Logging:** Nur loggen: `{ tool: "send_email", recipientCount: to.length + (cc?.length ?? 0), bodyType, importance, status, duration_ms }`. KEINE Empfänger-Adressen oder Betreffzeilen!
- **Graph API Response:** `POST /me/sendMail` gibt bei Erfolg `202 Accepted` mit LEEREM Body zurück. Die Erfolgs-Response muss vom Tool selbst konstruiert werden.

**MSW-Handler:**
- POST /me/sendMail → 202 Accepted (leerer Body, korrekte Headers)
- POST /me/sendMail (unauth) → 403 `{ error: { code: "ErrorAccessDenied", message: "Access is denied. Check credentials and try again.", innerError: { "request-id": "...", date: "..." } } }`
- POST /me/sendMail (ungültiger Empfänger) → 400 `{ error: { code: "ErrorInvalidRecipients", message: "At least one recipient is not valid." } }`
- POST /me/sendMail (Rate-Limit) → 429 mit `Retry-After: 30` Header
- POST /me/sendMail (zu großer Body/Anhang) → 413 Request Entity Too Large
- POST /users/{user_id}/sendMail → 202 (Multi-Tenant)

---

### F-2.2.2: `reply_email` Tool (Agent B)

**Graph API:** `POST /me/messages/{id}/reply` oder `POST /me/messages/{id}/replyAll`
**Klassifizierung:** destructive (confirm-Pattern)
**Permission:** Mail.Send

**Funktionalität:**
- Auf eine bestehende E-Mail antworten
- `reply_all: boolean` für Reply vs. ReplyAll
- Kommentar (Reply-Body) — wird als `comment` an die Graph API übergeben
- **Confirmation-Pattern:** Vorschau mit Original-Mail-Kontext (Betreff, Absender, Empfänger bei ReplyAll)

**Graph API Request Body Format:**
```json
// POST /me/messages/{id}/reply
{ "comment": "Danke für die Info!" }

// POST /me/messages/{id}/replyAll
{ "comment": "Danke, an alle!" }
```

**Hinweis:** Die Graph API `/reply` und `/replyAll` Endpunkte senden die Antwort SOFORT — es gibt kein "Draft erstellen und dann senden". Die Confirmation-Vorschau auf MCP-Ebene ist daher besonders wichtig.

**Schema:** `src/schemas/mail.ts` → `ReplyEmailParams` (extends WriteParams)
```typescript
ReplyEmailParams = WriteParams.extend({
  // WriteParams bringt: user_id?, idempotency_key?, confirm (default: false)
  message_id: z.string().min(1)
    .describe("ID der Original-E-Mail, auf die geantwortet wird"),
  comment: z.string().min(1).max(100000)
    .describe("Antwort-Text (wird als Kommentar über die Original-Mail gesetzt)"),
  reply_all: z.boolean().default(false)
    .describe("Wenn true: Reply-All an alle Empfänger. Wenn false: nur an den Absender."),
})
```

**Implementation Notes:**
- Bei `confirm=false` (Vorschau): Die Original-Mail per `GET /me/messages/{id}?$select=subject,from,toRecipients,ccRecipients` abrufen, um dem User den Kontext zu zeigen. Dies erfordert einen ZUSÄTZLICHEN API-Call. Bei `reply_all=true` die Empfängerliste in der Vorschau anzeigen.
- Bei `confirm=true`: Direkt `POST /me/messages/{id}/reply` oder `/replyAll` aufrufen. Response ist 202 mit leerem Body.
- **Idempotenz:** Besonders wichtig bei Reply — doppelte Antworten sind in Business-Kontext peinlich. `idempotency_key` sollte empfohlen (nicht erzwungen) werden.
- **DSGVO-Logging:** Nur `{ tool: "reply_email", replyAll: boolean, status, duration_ms }`. NICHT die message_id loggen (enthält indirekt Benutzerkontext).

**MSW-Handler:**
- POST /me/messages/{id}/reply → 202 Accepted (leerer Body)
- POST /me/messages/{id}/replyAll → 202 Accepted (leerer Body)
- POST /me/messages/nonexistent/reply → 404 `{ error: { code: "ErrorItemNotFound", message: "The specified object was not found in the store." } }`
- POST /me/messages/{id}/reply (unauth) → 403 (Mail.Send fehlt)
- GET /me/messages/{id}?$select=subject,from,toRecipients,ccRecipients → Mock für Vorschau-Abruf
- POST /users/{user_id}/messages/{id}/reply → 202 (Multi-Tenant)

---

### F-2.2.3: `forward_email` Tool (Agent C)

**Graph API:** `POST /me/messages/{id}/forward`
**Klassifizierung:** destructive (confirm-Pattern)
**Permission:** Mail.Send

**Funktionalität:**
- Bestehende E-Mail weiterleiten an neue Empfänger
- Optionaler Kommentar (wird über die weitergeleitete Mail gesetzt)
- **Confirmation-Pattern:** Vorschau mit Empfänger-Liste und Original-Mail-Info (Betreff, Absender)
- Anhänge der Original-Mail werden automatisch mitgeliefert (Graph API Verhalten)

**Graph API Request Body Format:**
```json
{
  "comment": "Zur Info, siehe unten.",
  "toRecipients": [
    { "emailAddress": { "address": "empfaenger@firma.de" } }
  ]
}
```

**Schema:** `src/schemas/mail.ts` → `ForwardEmailParams` (extends WriteParams)
```typescript
ForwardEmailParams = WriteParams.extend({
  // WriteParams bringt: user_id?, idempotency_key?, confirm (default: false)
  message_id: z.string().min(1)
    .describe("ID der E-Mail, die weitergeleitet werden soll"),
  to: z.array(z.string().email("Ungültige E-Mail-Adresse")).min(1).max(500)
    .describe("Empfänger der Weiterleitung (mindestens 1)"),
  comment: z.string().max(100000).optional()
    .describe("Optionaler Kommentar, der über die weitergeleitete E-Mail gesetzt wird"),
})
```

**Implementation Notes:**
- Bei `confirm=false` (Vorschau): Wie bei `reply_email` die Original-Mail per `GET /me/messages/{id}?$select=subject,from,hasAttachments` abrufen. In der Vorschau anzeigen: "Weiterleitung von: {subject} (von {from}) an: {to}. Anhänge: {ja/nein}."
- Bei `confirm=true`: `POST /me/messages/{id}/forward` mit `toRecipients` und optionalem `comment`. Response: 202 mit leerem Body.
- Die `to`-Adressen müssen wie bei `send_email` in das `{ emailAddress: { address: "..." } }` Format konvertiert werden. Die `toRecipients()`-Utility-Funktion aus `send_email` (Agent A) wiederverwenden. **Abhängigkeit:** Diese Utility muss in eine geteilte Datei extrahiert werden (z.B. `src/utils/recipients.ts` oder direkt in `src/schemas/mail.ts` als Helper).
- **DSGVO-Logging:** Nur `{ tool: "forward_email", recipientCount: to.length, hasComment: !!comment, status, duration_ms }`.

**MSW-Handler:**
- POST /me/messages/{id}/forward → 202 Accepted (leerer Body)
- POST /me/messages/nonexistent/forward → 404 `{ error: { code: "ErrorItemNotFound", message: "The specified object was not found in the store." } }`
- POST /me/messages/{id}/forward (unauth) → 403 (Mail.Send fehlt)
- POST /me/messages/{id}/forward (ungültiger Empfänger) → 400 `{ error: { code: "ErrorInvalidRecipients" } }`
- GET /me/messages/{id}?$select=subject,from,hasAttachments → Mock für Vorschau-Abruf
- POST /users/{user_id}/messages/{id}/forward → 202 (Multi-Tenant)

---

## Cross-Cutting: Destructive Operations Pattern

Alle drei Tools MÜSSEN implementieren:

1. **confirm=false (Default):** Vorschau zurückgeben, NICHT senden
   - Vorschau-Format: Empfänger, Betreff, Body-Auszug, Warnung
   - `checkConfirmation("destructive", confirm, previewMessage)` aus `src/utils/confirmation.ts`
   - `formatPreview(action, details)` für konsistente Vorschau-Formatierung
   - **Wichtig:** Vorschau-Response setzt `isError: false` (keine Fehlermeldung, sondern gewollte Vorschau)
   - **Wichtig:** Bei reply_email/forward_email erfordert die Vorschau einen ZUSÄTZLICHEN GET-Call für die Original-Mail-Metadaten

2. **confirm=true:** Operation tatsächlich ausführen
   - Idempotenz-Check VOR dem API-Call (`idempotencyCache.get(toolName, key)`)
   - Bei Cache-Hit: gecachtes Ergebnis zurückgeben mit Hinweis "Bereits ausgeführt"
   - Bei Cache-Miss: API-Call ausführen, Ergebnis cachen (`idempotencyCache.set(toolName, key, result)`)
   - Erfolgs-Response mit Metadaten (Zeitstempel, Empfängeranzahl — NICHT die Adressen!)

3. **Idempotenz:**
   - `idempotency_key` über `src/utils/idempotency.ts` prüfen (IdempotencyCache Singleton)
   - Key-Format intern: `${tool_name}:${idempotency_key}` (automatisch im IdempotencyCache)
   - TTL: 10 Minuten (DEFAULT_TTL_MS = 600.000ms)
   - **Achtung:** Idempotenz-Check NUR bei `confirm=true`. Bei `confirm=false` ist die Vorschau immer idempotent.
   - **Duplicate Detection (nur send_email):** Zusätzlich zum idempotency_key, Hash-basierte Erkennung: `SHA-256(sorted(to) + subject.lower() + body[:200])`. Separater Cache mit 2 Min TTL. Bei Duplikat: Warnung in Response, aber Senden NICHT blockieren (User könnte absichtlich doppelt senden).

4. **Logging (DSGVO-konform):**
   - Tool-Name, HTTP-Status, Latenz, recipientCount loggen
   - KEINE Empfänger-Adressen, Betreffzeilen, Body-Inhalte, message_ids
   - `logger.info({ tool, method: "POST", endpoint, status, duration_ms, recipientCount })`

5. **Error-Handling:**
   - 400 Bad Request (ungültige Empfänger) → `ValidationError`
   - 403 Forbidden (Mail.Send fehlt) → `AuthError` mit `requiredScope: "Mail.Send"`
   - 404 Not Found (message_id ungültig bei reply/forward) → `NotFoundError`
   - 429 Rate Limit → `RateLimitError` (automatischer Retry durch Middleware)
   - 413 Too Large (Body/Anhang) → `ValidationError` mit Größen-Hinweis

### Shared Utility: `toRecipients()` (NEU)

Alle drei Tools konvertieren E-Mail-Adressen ins Graph-API-Format. Shared Utility extrahieren:

```typescript
// src/utils/recipients.ts (NEU)
export function toRecipients(emails: string[]): Array<{ emailAddress: { address: string } }> {
  return emails.map(address => ({ emailAddress: { address } }));
}
```

Diese Datei ist KEINE Konflikquelle, da nur einmal erstellt. Empfehlung: Agent A erstellt die Datei, Agents B+C importieren sie.

---

## Tests

### Unit-Tests (Vitest + MSW)

**send_email (Agent A):**
- [ ] Vorschau (confirm=false): Response enthält Empfänger, Betreff, Body-Auszug, `isError: false`
- [ ] Senden (confirm=true): POST /me/sendMail wird aufgerufen, Response enthält Zeitstempel
- [ ] Senden mit body_type="html": contentType im Request-Body korrekt gesetzt
- [ ] Idempotenz-Hit: gleicher idempotency_key → kein zweiter API-Call, gecachtes Ergebnis
- [ ] Idempotenz-Miss: anderer idempotency_key → neuer API-Call
- [ ] Idempotenz ohne Key: kein idempotency_key → immer ausführen (kein Cache)
- [ ] Duplicate Detection: gleicher to+subject+body innerhalb 2 Min → Warnung in Response (aber trotzdem senden)
- [ ] Duplicate Detection: gleicher Hash NACH 2 Min → keine Warnung
- [ ] CC + BCC: Empfänger korrekt ins Graph-API-Format konvertiert
- [ ] save_to_sent_items=false: `saveToSentItems: false` im Request-Body
- [ ] importance="high": Korrekt im Message-Objekt
- [ ] 400 Bad Request (ungültige Empfänger): ValidationError mit verständlicher Meldung
- [ ] 403 Forbidden (Mail.Send fehlt): AuthError mit requiredScope
- [ ] 429 Rate Limit: RateLimitError, Retry-After-Header wird respektiert
- [ ] 413 Too Large: ValidationError mit Größen-Hinweis
- [ ] Multi-Tenant: user_id → POST /users/{user_id}/sendMail
- [ ] Leerer to-Array: Zod ValidationError (min 1)
- [ ] subject="" (leerer String): Zod ValidationError (min 1)
- [ ] body mit 100.001 Zeichen: Zod ValidationError (max 100000)
- [ ] to mit ungültiger E-Mail "nicht-eine-email": Zod ValidationError (email)
- [ ] DSGVO: Logger wird aufgerufen, aber KEINE PII enthalten (Empfänger, Betreff prüfen)

**reply_email (Agent B):**
- [ ] Vorschau (confirm=false): GET für Original-Mail wird aufgerufen, Response zeigt Kontext
- [ ] Vorschau bei reply_all=true: Empfängerliste (To+CC) in Vorschau angezeigt
- [ ] Reply (confirm=true): POST /me/messages/{id}/reply wird aufgerufen
- [ ] ReplyAll (confirm=true, reply_all=true): POST /me/messages/{id}/replyAll wird aufgerufen
- [ ] 404 für ungültige message_id: NotFoundError
- [ ] 403 Forbidden: AuthError mit requiredScope "Mail.Send"
- [ ] Idempotenz: gleicher Key → kein doppelter Reply
- [ ] comment="" (leerer String): Zod ValidationError (min 1)
- [ ] Multi-Tenant: user_id → POST /users/{user_id}/messages/{id}/reply
- [ ] DSGVO: Kein Loggen von message_id, comment-Inhalt

**forward_email (Agent C):**
- [ ] Vorschau (confirm=false): GET für Original-Mail, Response zeigt Empfänger + Original-Info
- [ ] Vorschau zeigt "hat Anhänge" wenn hasAttachments=true in Original-Mail
- [ ] Forward (confirm=true): POST /me/messages/{id}/forward wird aufgerufen
- [ ] Forward ohne comment: comment-Feld fehlt im Request-Body (nicht als leerer String)
- [ ] 404 für ungültige message_id: NotFoundError
- [ ] 400 für ungültigen Empfänger: ValidationError
- [ ] 403 Forbidden: AuthError
- [ ] Idempotenz: gleicher Key → kein doppeltes Forward
- [ ] to mit 1 Empfänger: Korrekt
- [ ] to mit mehreren Empfängern: Alle im Request-Body
- [ ] Multi-Tenant: user_id → POST /users/{user_id}/messages/{id}/forward
- [ ] DSGVO: Kein Loggen von Empfänger-Adressen, message_id

**Schema-Validierung (übergreifend):**
- [ ] SendEmailParams.shape ist kompatibel mit server.tool() (ZodRawShapeCompat)
- [ ] ReplyEmailParams.shape ist kompatibel
- [ ] ForwardEmailParams.shape ist kompatibel
- [ ] Defaults: confirm=false, body_type="text", importance="normal", reply_all=false, save_to_sent_items=true
- [ ] WriteParams-Vererbung: Alle drei Schemas haben idempotency_key und confirm

**Confirmation-Pattern (übergreifend):**
- [ ] checkConfirmation("destructive", false, "...") → { isPreview: true, message: "..." }
- [ ] checkConfirmation("destructive", true, "...") → null (proceed)
- [ ] formatPreview() gibt konsistentes Format für alle drei Tools

**Idempotenz (übergreifend):**
- [ ] IdempotencyCache.get() nach set() → gecachtes Ergebnis
- [ ] IdempotencyCache.get() nach TTL-Ablauf → undefined
- [ ] IdempotencyCache mit verschiedenen Tool-Namen → verschiedene Keys (send_email:key1 !== reply_email:key1)

### Integration-Tests (Vitest + MSW)
- [ ] list_emails → reply_email: E-Mail-ID aus Liste → Vorschau → Reply
- [ ] list_emails → forward_email: E-Mail-ID aus Liste → Vorschau → Forward
- [ ] send_email mit Idempotenz: doppelter Call mit gleicher Key → nur 1 POST-Request im MSW
- [ ] send_email → list_emails (sentitems): Nach Senden prüfen ob in Sent Items (MSW-Mock)
- [ ] search_emails → reply_email: Suchen → Antworten Workflow
- [ ] reply_email confirm=false → confirm=true: Zwei-Schritt-Workflow

### E2E-Tests (M365 Developer Tenant)
- [ ] send_email: E-Mail an Test-Postfach senden, anschließend in Sent Items prüfen
- [ ] reply_email: Auf Test-Mail antworten, Antwort im Thread prüfen
- [ ] forward_email: Test-Mail an zweites Test-Postfach weiterleiten
- [ ] **Seed-Daten:** Mindestens 1 E-Mail im Postfach des Test-Users (für reply/forward)
- [ ] **Seed-Daten:** Zweites Test-Postfach als Empfänger (forward-Ziel, send-Ziel)
- [ ] **Cleanup:** Nach E2E-Tests gesendete Test-Mails aus Sent Items löschen (oder deterministischen Betreff verwenden und vor Test aufräumen)

---

## Agent-Aufteilung

| Agent | Dateien | Abhängigkeiten |
|---|---|---|
| A: send_email | `src/schemas/mail.ts` (Schema), `src/tools/mail-send.ts` (NEU), `src/utils/recipients.ts` (NEU), `tests/mail-send.test.ts` (NEU), `tests/mocks/handlers/mail-send.ts` (NEU) | WriteParams, confirmation, idempotency, errors, logger |
| B: reply_email | `src/schemas/mail.ts` (Schema), `src/tools/mail-reply.ts` (NEU), `tests/mail-reply.test.ts` (NEU), `tests/mocks/handlers/mail-reply.ts` (NEU) | WriteParams, confirmation, idempotency, errors, logger, graphClient (GET für Vorschau) |
| C: forward_email | `src/schemas/mail.ts` (Schema), `src/tools/mail-forward.ts` (NEU), `tests/mail-forward.test.ts` (NEU), `tests/mocks/handlers/mail-forward.ts` (NEU) | WriteParams, confirmation, idempotency, errors, logger, recipients.ts (von Agent A), graphClient (GET für Vorschau) |

**Merge-Konflikt-Strategie (Architect):**

1. **`src/schemas/mail.ts`** — Alle drei Agents fügen ein Schema hinzu. **Lösung:** Sequentielle Schema-Erweiterung: Agent A fügt `SendEmailParams` hinzu → mergt zuerst. Agents B+C fügen `ReplyEmailParams` und `ForwardEmailParams` danach hinzu (parallel möglich, da verschiedene Schema-Namen am Dateiende).

2. **`src/utils/recipients.ts`** — Nur von Agent A erstellt, von Agent C importiert. **Reihenfolge:** Agent A MUSS vor Agent C fertig sein (oder Agent C definiert die Funktion inline und refactored später).

3. **MSW-Handler** — Separate Handler-Dateien pro Agent (`mail-send.ts`, `mail-reply.ts`, `mail-forward.ts`). In `tests/mocks/handlers/index.ts` per Spread zusammenführen: `export const handlers = [...mailHandlers, ...mailSendHandlers, ...mailReplyHandlers, ...mailForwardHandlers]`.

4. **`src/index.ts`** — Drei neue `register*Tools()` Imports hinzufügen. **Lösung:** Wenn Sprint 2.1 Agent C den DI-Refactor implementiert hat (`createToolRegistry()`), ist die Erweiterung trivial. Andernfalls: Agent A fügt alle drei Registrierungen hinzu (da A zuerst mergt).

**Empfohlene Reihenfolge:**
1. Agent A (send_email) startet zuerst → erstellt `recipients.ts`, `SendEmailParams`, mergt
2. Agents B + C starten parallel danach
3. Finale Integration: Handler zusammenführen in `handlers/index.ts`, Tool-Registrierung in `index.ts`

**Abhängigkeit zu Sprint 2.1:** Alle drei Agents setzen voraus:
- WriteParams existiert (aus Phase 1, common.ts) -- bereits vorhanden
- confirmation.ts existiert (aus Phase 1) -- bereits vorhanden
- idempotency.ts existiert (aus Phase 1) -- bereits vorhanden
- Für Vorschau (reply/forward): `read_email` oder direkter GET-Call. Empfehlung: Direkter GET-Call, NICHT das read_email-Tool aufrufen. Vermeidet zirkuläre Abhängigkeit und unnötige HTML→Text-Konvertierung.

---

## Akzeptanzkriterien

- [ ] Alle 3 Tools registriert und via `tools/list` sichtbar
- [ ] Confirmation-Pattern funktioniert korrekt (confirm=false → Vorschau, isError: false)
- [ ] Idempotenz funktioniert (doppelter Call mit gleichem Key → kein doppeltes Senden)
- [ ] Duplicate Detection bei send_email funktioniert (Warnung, nicht Blockierung)
- [ ] KEINE PII in Logs (Empfänger, Betreff, Body) — automatisierter Test dafür
- [ ] Alle Quality Gates bestanden (lint, typecheck, test, coverage >= 60/50/60/60)
- [ ] docs/TOOLS.md und docs/PERMISSIONS.md aktualisiert (Mail.Send Permission dokumentiert)
- [ ] `src/utils/recipients.ts` als geteilte Utility erstellt und von allen drei Tools genutzt
- [ ] Tool-Descriptions sind LLM-optimiert (klar formuliert, wann welches Tool zu verwenden ist)

---

## Review Notes (3-Perspektiven-Review)

### Senior Developer

1. **Graph API Response-Format:** Alle drei Endpunkte (`/sendMail`, `/reply`, `/replyAll`, `/forward`) geben `202 Accepted` mit LEEREM Response-Body zurück. Die Erfolgs-Response muss komplett vom Tool konstruiert werden. Das ist anders als bei GET-Endpunkten und muss in der Implementierung berücksichtigt werden — kein `response.json()` Parsing.

2. **E-Mail-Validierung:** Die Zod `.email()` Validierung nutzt eine einfache Regex. Für Business-Einsatz reicht das. Exotische Adressen (IP-Literale, Quoted-Strings) werden von der Graph API selbst validiert und ggf. mit 400 abgelehnt. Die Zod-Validierung ist ein First-Line-Filter.

3. **Recipient-Format-Konvertierung:** Die `toRecipients()` Utility-Funktion muss in eine eigene Datei (`src/utils/recipients.ts`), nicht inline in einem Tool. Wird von send_email (to, cc, bcc) und forward_email (to) benötigt. Reply braucht sie NICHT (Empfänger werden von der Graph API aus der Original-Mail übernommen).

4. **Vorschau bei reply/forward erfordert GET-Call:** Die Vorschau (confirm=false) bei reply_email und forward_email benötigt einen zusätzlichen `GET /me/messages/{id}?$select=subject,from,toRecipients,ccRecipients,hasAttachments` Call, um dem User den Kontext zu zeigen. Dieser GET-Call wird NICHT durch den Idempotenz-Cache abgedeckt (da GET, nicht POST). Overhead ist akzeptabel (~100ms).

5. **Anhänge bei send_email:** Das Original-Dokument listet "Optionale Anhänge (Base64, <4MB)" als Feature. Empfehlung: Anhang-Support bei send_email erst nach Sprint 2.3 implementieren, wenn `list_attachments` und `download_attachment` die Basis geschaffen haben. Verhindert Scope-Creep in Sprint 2.2. Im Sprint-Plan als "deferred" markiert.

6. **Duplicate Detection Hash:** Für den Hash SHA-256 verwenden (Node.js built-in `crypto.createHash("sha256")`). Kein externer Dependency nötig. Der Hash-Cache braucht eine KÜRZERE TTL als der Idempotenz-Cache (2 Min vs. 10 Min) — separaten Map verwenden, NICHT den IdempotencyCache.

### Senior Architect

1. **Geteilte Utility-Extraktionsstrategie:** Die `toRecipients()` Funktion und ggf. die Vorschau-Logik (Original-Mail für Kontext abrufen) sind Kandidaten für geteilte Utilities. Empfehlung:
   - `src/utils/recipients.ts` → `toRecipients(emails: string[])`
   - `src/utils/mail-context.ts` → `fetchMailContext(graphClient, messageId, userId?)` — holt Original-Mail für Vorschau

   Alternative: Beide in `src/utils/mail-helpers.ts` zusammenfassen. Separate Dateien sind sauberer für Parallelisierung.

2. **Tool-Registration-Pattern:** Sprint 2.2 etabliert das Pattern "eine Tool-Datei pro Tool" (`mail-send.ts`, `mail-reply.ts`, `mail-forward.ts`). Dieses Pattern sollte rückwirkend auch für Sprint 2.1 gelten (dort wurde es bereits vorgeschlagen). Ab jetzt Standard: Jeder neue Tool-Handler bekommt seine eigene Datei.

3. **MSW-Handler-Organisation:** Handler in separaten Dateien pro Tool, re-exportiert über `handlers/index.ts`. Das `handlers/mail.ts` aus Phase 1 bleibt bestehen (für list_emails). Neue Handler werden DANEBEN erstellt, nicht in die bestehende Datei geschrieben. In `handlers/index.ts`:
   ```typescript
   import { mailHandlers } from "./mail.js";
   import { mailSendHandlers } from "./mail-send.js";
   import { mailReplyHandlers } from "./mail-reply.js";
   import { mailForwardHandlers } from "./mail-forward.js";
   export const handlers = [...mailHandlers, ...mailSendHandlers, ...mailReplyHandlers, ...mailForwardHandlers];
   ```

4. **Sprint 2.2 kann PARALLEL zu Sprint 2.1 starten:** Die einzige Abhängigkeit sind die WriteParams und Cross-Cutting Utilities, die bereits aus Phase 1 existieren. Die neuen read-only Tools (Sprint 2.1) sind für Sprint 2.2 nicht erforderlich. Nur die Vorschau-Logik (GET für Original-Mail) nutzt eine ähnliche Query wie read_email, aber als direkter Graph-Call, nicht über das Tool.

5. **Idempotenz-Architektur-Überlegung:** Der IdempotencyCache ist ein Singleton. Bei Multi-Tenant (user_id) muss der Cache-Key den user_id einbeziehen, sonst könnten Cache-Hits über Tenant-Grenzen hinweg auftreten. **Empfehlung:** `buildKey` um `userId` erweitern: `${toolName}:${userId ?? "me"}:${idempotencyKey}`. Dies ist ein Breaking Change am IdempotencyCache-Interface — als Review Debt für Sprint 2.2 aufnehmen.

### Senior Tester

1. **DSGVO-Compliance-Tests:** Für JEDES destructive Tool muss ein dedizierter Test verifizieren, dass der pino-Logger KEINE PII enthält. Ansatz: Custom pino-Transport im Test, der alle Log-Entries captured. Dann assertieren, dass kein Log-Entry Empfänger-Adressen, Betreffzeilen oder Body-Inhalte enthält. Testbeispiel:
   ```typescript
   it("should not log PII", async () => {
     const logEntries = captureLogEntries();
     await sendEmail({ to: ["secret@test.de"], subject: "Geheim", body: "Vertraulich", confirm: true });
     for (const entry of logEntries) {
       expect(JSON.stringify(entry)).not.toContain("secret@test.de");
       expect(JSON.stringify(entry)).not.toContain("Geheim");
       expect(JSON.stringify(entry)).not.toContain("Vertraulich");
     }
   });
   ```

2. **Fehlende Boundary-Tests im Original:**
   - send_email mit 500 Empfängern (max Array-Länge) — Graph API Limit prüfen
   - send_email mit body_type="html" und < script>-Tags — XSS ist hier kein Thema (kein Browser), aber Graph API könnte ablehnen
   - reply_email auf eine Mail, die inzwischen gelöscht wurde (race condition) → 404
   - forward_email an sich selbst → sollte funktionieren (Graph API erlaubt das)
   - Alle Tools: confirm=true OHNE idempotency_key → funktioniert (kein idempotency_key ist valid)

3. **Vorschau-Qualitätstests:** Die Vorschau bei confirm=false muss genug Information enthalten, damit der LLM (und der User) eine informierte Entscheidung treffen kann. Testen:
   - send_email Vorschau: enthält To, CC (falls gesetzt), Subject, Body-Auszug (200 Zeichen)
   - reply_email Vorschau: enthält Original-Betreff, Original-Absender, bei reply_all die Empfängerliste
   - forward_email Vorschau: enthält Original-Betreff, Original-Absender, neue Empfänger, Anhang-Hinweis

4. **Idempotenz-Timing-Test:** Test mit `vi.useFakeTimers()` dass der Cache nach 10 Minuten abläuft und ein neuer Call wieder die API aufruft. Nicht nur Happy-Path testen.

5. **E2E-Cleanup-Strategie:** Destructive E2E-Tests hinterlassen Spuren (gesendete Mails, Antworten). Jeder E2E-Test muss:
   - Deterministischen Betreff verwenden (z.B. "MS-MCP-E2E-Send-{timestamp}")
   - After-Hook: Gesendete Mails in Sent Items finden und löschen
   - Alternativ: Dediciertes Test-Postfach, das regelmäßig geleert wird
