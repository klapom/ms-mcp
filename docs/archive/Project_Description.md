# Office 365 MCP Connector – Gap-Analyse & Implementierungsroadmap v3

**Autor:** Pommer IT-Consulting GmbH
**Datum:** 2026-02-11
**Ziel:** Eigenentwicklung eines Office 365 MCP-Servers für Claude Desktop / Cowork via Claude Code
**Strategische Entscheidung:** Build (nicht Buy) – volle Kontrolle über Datenfluss, Funktionalität und Erweiterbarkeit
**Lizenz:** Offen (wird in Phase 7 entschieden)

---

## 1. Bestandsaufnahme: Existierende Lösungen

### 1.1 CData Connect AI

**Architektur:** Managed Cloud-MCP-Server, SQL-Abstraktionsschicht über Microsoft Graph API

**Verfügbare Entitäten (Tables):**
- **Mail:** Messages, MailFolders, MessageAttachments
- **Kalender:** Calendars, Events, CalendarView (Occurrences)
- **Kontakte:** Contacts, ContactFolders
- **Dateien:** Files (OneDrive), DriveItems
- **SharePoint:** Sites, Lists, ListItems
- **Teams:** Teams, Channels, ChannelMessages
- **Aufgaben:** Tasks (To Do), Plans, Buckets (Planner)
- **Benutzer:** Users, Groups
- **Stored Procedures:** SendMail, MoveMessage, CopyFile, etc.

**Funktionalität:**
- Vollständiges CRUD über SQL-Interface (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
- Delegated + Application Permissions
- Admin-Operationen über `UserId`-Spalte
- Dynamic Schema Discovery

**MCP-Tools (Connect AI):**
- `queryData` – SQL-Abfragen gegen verbundene Quellen
- `execProcedure` – Stored Procedures ausführen
- `getCatalogs`, `getSchemas`, `getTables`, `getColumns` – Schema Discovery

**Limitierungen:**
- Kostenpflichtig (SaaS-Abo erforderlich)
- Cloud-hosted → Daten fließen über CData-Server
- Kein direkter Dateizugriff (kein File-Download/-Upload)
- Kein Streaming / Real-time (Polling-basiert)
- SQL-Abstraktionsschicht verliert Graph-API-Nuancen

### 1.2 Anthropic M365 Connector (offiziell)

**Einschränkungen:**
- Nur Team/Enterprise-Pläne
- Nur Lesezugriff (read-only)
- Keine Schreiboperationen (kein Mail senden, kein Kalender erstellen)
- SharePoint, OneDrive, Outlook, Teams

### 1.3 Lokka (Open Source, merill/lokka)

**Architektur:** Lokaler MCP-Server, direkter Graph-API-Proxy

**Features:**
- Generischer Graph-API-Aufruf (GET/POST/PATCH/DELETE)
- Azure Resource Manager Support
- Multi-Auth: Interactive, Client Credentials, Certificate, Client Token
- Lesen UND Schreiben (wenn Permissions vorhanden)
- v1.0 und beta Graph-API-Versionen

**Limitierungen:**
- Nur ein generisches Tool (`call_graph_api`) → LLM muss Graph-API-Pfade kennen
- Keine domänenspezifischen Tools (kein `send_mail`, `create_event`, etc.)
- Kein File-Upload/-Download
- Keine Pagination-Logik
- Keine Batch-Operationen

### 1.4 Softeria ms-365-mcp-server (Open Source)

**Architektur:** Lokaler MCP-Server mit domänenspezifischen Tools

**Features:**
- Granulare Tools: `list-emails`, `send-email`, `create-event`, `list-files`, etc.
- Org-Mode für Teams/SharePoint
- Read-Only-Modus verfügbar
- Tool-Presets (Subsets von Tools)
- HTTP-Transport (Streamable)

**Limitierungen:**
- Noch kein vollständiger Graph-Coverage
- Kein File-Content-Download als Base64
- Keine SharePoint-Seitenbearbeitung
- Aktive Entwicklung, API-Stabilität unklar

---

## 2. Gap-Analyse

### 2.1 Scope: Vollumfänglicher Office 365 Connector

| Funktionsbereich | CData | Anthropic | Lokka | Softeria | **Ziel** |
|---|---|---|---|---|---|
| **Outlook – Lesen** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Outlook – Senden/Antworten** | ✅ | ❌ | ✅¹ | ✅ | ✅ |
| **Outlook – Anhänge hoch/runterladen** | ⚠️² | ❌ | ❌ | ⚠️ | ✅ |
| **Kalender – CRUD** | ✅ | ❌ | ✅¹ | ✅ | ✅ |
| **Kalender – Verfügbarkeit prüfen** | ❌ | ❌ | ✅¹ | ❌ | ✅ |
| **Kontakte – CRUD** | ✅ | ❌ | ✅¹ | ⚠️ | ✅ |
| **OneDrive – Browse/Download** | ⚠️² | ✅ (nur lesen) | ✅¹ | ✅ | ✅ |
| **OneDrive – Upload/Create** | ❌ | ❌ | ✅¹ | ⚠️ | ✅ |
| **SharePoint – Sites/Listen** | ✅ | ✅ | ✅¹ | ⚠️ | ✅ |
| **SharePoint – Dokument-Upload** | ❌ | ❌ | ✅¹ | ❌ | ✅ |
| **Teams – Nachrichten lesen** | ✅ | ✅ | ✅¹ | ✅ | ✅ |
| **Teams – Nachrichten senden** | ❌ | ❌ | ✅¹ | ✅ | ✅ |
| **Planner – Tasks** | ✅ | ❌ | ✅¹ | ❌ | ✅ |
| **To Do – Tasks** | ✅ | ❌ | ✅¹ | ✅ | ✅ |
| **OneNote – Notizbücher** | ❌ | ❌ | ✅¹ | ❌ | ✅ |
| **Batch-Operationen** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Pagination (auto)** | ✅ | ? | ❌ | ✅ | ✅ |
| **Webhook/Subscriptions** | ❌ | ❌ | ❌ | ❌ | 🔮 |
| **Offline/Lokal** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Kostenlos** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Claude Code-kompatibel** | ❌ | ❌ | ✅ | ✅ | ✅ |

¹ = nur über generischen `call_graph_api` – LLM muss API-Pfade kennen
² = Metadaten ja, File-Content als Blob eingeschränkt

### 2.2 Identifizierte Gaps für vollumfänglichen Connector

**Kritische Gaps (kein Anbieter löst vollständig):**
1. **File-Content-Transfer:** Kein MCP-Server unterstützt zuverlässig Base64-File-Upload/-Download
2. **Batch-Requests:** `$batch`-Endpunkt der Graph API wird nirgends unterstützt
3. **Webhook/Change-Notifications:** Keine Lösung bietet Subscriptions für Real-time-Updates
4. **Cross-Service-Queries:** z.B. "Finde alle E-Mails mit Anhängen, die auch in OneDrive liegen"
5. **Granulare Berechtigungssteuerung pro Tool** im MCP-Server selbst

**Moderate Gaps:**
6. **OneNote-Integration:** Komplexe API (HTML-basiert), von keinem vollständig abgedeckt
7. **Planner/To Do-Kombination:** Kein einheitliches Task-Interface
8. **SharePoint-Seiten (Pages):** Erstellen/Bearbeiten von SharePoint-Seiten
9. **Präsenz/Status-Abfrage:** Online-Status von Benutzern

### 2.3 MVP-Scope

| Priorität | Feature | Graph-API-Endpunkt |
|---|---|---|
| **P0** | E-Mail lesen/suchen | `/me/messages`, `/me/mailFolders` |
| **P0** | E-Mail senden/antworten | `/me/sendMail`, `/me/messages/{id}/reply` |
| **P0** | Kalender CRUD | `/me/events`, `/me/calendar/calendarView` |
| **P0** | OneDrive browse/download | `/me/drive/root/children`, `/me/drive/items/{id}/content` |
| **P1** | Kontakte CRUD | `/me/contacts` |
| **P1** | OneDrive upload | `/me/drive/root:/{path}:/content` |
| **P1** | E-Mail-Anhänge | `/me/messages/{id}/attachments` |
| **P2** | To Do Tasks | `/me/todo/lists`, `/me/todo/lists/{id}/tasks` |
| **P2** | Teams Nachrichten (lesen) | `/me/chats`, `/me/chats/{id}/messages` |
| **P3** | SharePoint Sites/Listen | `/sites`, `/sites/{id}/lists` |
| **P3** | Planner | `/me/planner/tasks` |

---

## 3. Use-Case-Katalog

Konkrete Szenarien die der Connector ermöglicht, geordnet nach MVP-Priorität.
Dienen gleichzeitig als Demo-Skripte und Akzeptanz-Kriterien.

### 3.1 MVP-Szenarien (P0 – Phase 1–4)

**UC-01: Inbox-Triage**
> "Fasse meine ungelesenen E-Mails der letzten 24 Stunden zusammen.
> Kategorisiere nach: dringend, informativ, delegierbar."

Tools: `list_emails` (filter: isRead eq false), `read_email`
Wert: 15-30 Min Zeitersparnis pro Morgen

**UC-02: Meeting-Vorbereitung**
> "Was steht morgen in meinem Kalender? Lade für jedes Meeting
> die relevanten Dokumente aus OneDrive."

Tools: `get_calendar_view`, `list_files`, `download_file`
Wert: Kontext für Meetings automatisch zusammenstellen

**UC-03: Termin-Koordination**
> "Finde den nächsten freien 60-Minuten-Slot mit
> max.mustermann@heidenhain.de diese Woche und schlage drei Optionen vor."

Tools: `check_availability`, `create_event`
Wert: Eliminiert 3-5 Ping-Pong-Mails

**UC-04: Dokument-Suche**
> "Finde den letzten Monatsbericht im OneDrive-Ordner 'PHOENIX/Reports'
> und erstelle eine Zusammenfassung."

Tools: `search_files`, `download_file`
Wert: Sofortiger Zugriff statt manueller Ordner-Navigation

**UC-05: Quick Reply**
> "Antworte auf die letzte Mail von Frau Schmidt mit: 'Danke, wir
> besprechen das im nächsten Jour Fixe am Donnerstag.'"

Tools: `list_emails` (filter: from), `reply_email`
Wert: Kontext-bewusste Antworten ohne App-Wechsel

### 3.2 Erweiterte Szenarien (P1–P2 – Phase 5–6)

**UC-06: Action-Items aus Mails**
> "Gehe meine Mails der letzten Woche durch und erstelle für jede
> Mail mit einer Aufgabe ein To-Do-Item mit Deadline."

Tools: `list_emails`, `read_email`, `create_task`
Wert: Automatische Task-Extraktion

**UC-07: Kontakt-Recherche**
> "Zeige mir alle Kontakte bei PHOENIX und wann ich zuletzt
> mit ihnen kommuniziert habe."

Tools: `list_contacts` (filter: company), `search_emails`
Wert: CRM-light ohne extra Tool

**UC-08: Weekly Digest**
> "Erstelle einen Wochenbericht: alle gesendeten Mails, erledigten Tasks,
> vergangene und kommende Termine."

Tools: `list_emails`, `list_tasks`, `list_events`
Wert: Automatischer Wochenbericht für Zeiterfassung / Kunden

### 3.3 Fortgeschrittene Szenarien (P3 – Phase 6–7)

**UC-09: Team-Sync**
> "Was wurde heute im Teams-Kanal 'Projekt-X' besprochen?
> Fasse die Kernpunkte zusammen."

Tools: `list_channel_messages`
Wert: Async Teams-Teilnahme

**UC-10: SharePoint-Reporting**
> "Liste alle Items aus der SharePoint-Liste 'Offene Tickets' die mir
> zugewiesen sind und älter als 7 Tage sind."

Tools: `list_list_items` (filter: assigned + created date)
Wert: Cross-System-Übersicht ohne SharePoint-UI

---

## 4. Architekturentscheidung

### 4.1 Technologie-Stack

- **Runtime:** Node.js 22+
- **Sprache:** TypeScript 5.x (strict mode)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Graph Client:** `@microsoft/microsoft-graph-client`
- **Auth:** `@azure/msal-node` (MSAL v2)
- **Validation:** Zod (Single Source of Truth für Schemas + Types)
- **Test:** Vitest + MSW (Mock Service Worker)
- **E2E-Test:** M365 Developer Tenant + Nightly CI
- **Lint/Format:** Biome
- **Build:** tsup
- **Logging:** pino (structured JSON logs)
- **Transport:** stdio (Claude Desktop) + optionaler HTTP/SSE

**Schema-Architektur (Zod-basiert):**

```
Zod Schema (Single Source of Truth)
  ├── → JSON Schema (für MCP inputSchema)
  ├── → TypeScript Types (z.infer<typeof Schema>)
  └── → Runtime-Validierung (Tool-Input-Parsing)
```

Kein separates OpenAPI nötig – die MCP Tool-Definitionen haben ihr eigenes
JSON-Schema-Format, und TypeScript-Interfaces ergänzen zur Compile-Zeit.

### 4.2 Architektur-Patterns (Cross-Cutting Concerns)

Die folgenden Patterns werden in Phase 1 als Infrastruktur implementiert
und von allen Tool-Modulen genutzt.

#### 4.2.1 Context-Budget-Management

Graph-API-Responses können das LLM-Context-Window sprengen (50 Mails ×
~2KB = 100KB). Jedes Tool implementiert daher:

**Default `$select`:** Nur die Felder die der LLM braucht, nie vollständige
Entitäten. Beispiel Mail: `subject, from, receivedDateTime, bodyPreview,
isRead, importance` – nicht `body, internetMessageHeaders, extensions`.

**Response-Shaping:**
```typescript
interface ToolResponseConfig {
  maxItems: number;          // Default: 25, konfigurierbar
  maxBodyLength: number;     // Default: 500 chars (Preview)
  summaryMode: boolean;      // true = nur Metadaten, false = mit Content
  fields?: string[];         // Override $select
}
```

**Pagination-Kommunikation:** Listen-Tools geben immer zurück:
```
Zeige 25 von 142 Ergebnissen. Nutze `skip: 25` für die nächste Seite.
```
So kann der LLM entscheiden ob er mehr braucht, statt alles auf einmal zu laden.

**Truncation:** Body-Inhalte > `maxBodyLength` werden abgeschnitten mit
`[...gekürzt, verwende read_email für vollständigen Inhalt]`.

#### 4.2.2 Destructive Operations Safety

Schreibende/löschende Tools implementieren ein zweistufiges Safety-Pattern:

**Klassifizierung:**
- **Safe (grün):** Lesen, Listen, Suchen → sofort ausführen
- **Moderate (gelb):** Erstellen, Aktualisieren → ausführen, aber explizit im
  Response bestätigen was passiert ist
- **Destructive (rot):** Senden, Löschen, Verschieben → Confirmation-Pattern

**Confirmation-Pattern für destruktive Ops:**

Jedes rote Tool hat einen optionalen `confirm`-Parameter (default: `false`):

```typescript
// Erster Call: confirm fehlt oder false → Vorschau
send_email({ to: "kunde@firma.de", subject: "Angebot", confirm: false })
// Response: "Bereit zum Senden: An: kunde@firma.de, Betreff: 'Angebot',
//           Body: 3 Absätze. Bestätigen mit confirm: true"

// Zweiter Call: confirm: true → tatsächlich senden
send_email({ to: "kunde@firma.de", subject: "Angebot", confirm: true })
// Response: "E-Mail gesendet an kunde@firma.de um 14:32"
```

**Dry-Run für Batch-Operationen:**
`move_email`, `delete_event` etc. akzeptieren `dry_run: true` → zeigt was
passieren würde, ohne auszuführen.

**Tool-Descriptions** für den LLM müssen das Confirmation-Pattern
dokumentieren, damit der LLM es korrekt nutzt.

#### 4.2.3 Multi-Tenant-Vorbereitung

Phase 1 implementiert nur `/me`, aber die Architektur berücksichtigt von
Anfang an Multi-Tenant/Multi-User:

**Optionaler `user_id`-Parameter** auf allen Tools:
```typescript
const BaseParams = z.object({
  user_id: z.string().optional()
    .describe("User-ID oder UPN für delegierten Zugriff. Default: /me"),
});
```

**Wenn `user_id` gesetzt:**
- Pfad wird von `/me/messages` zu `/users/{user_id}/messages`
- Benötigte Permission ändert sich (Delegated → Application)
- Config prüft ob Application Permissions verfügbar sind

**Shared Mailbox Support** (vorbereitet, nicht Phase 1):
```typescript
shared_mailbox: z.string().optional()
  .describe("Shared Mailbox Adresse für geteilte Postfächer"),
```

**Multi-Tenant Auth** (vorbereitet):
- MSAL-Config akzeptiert `tenant_id` → ermöglicht Wechsel zwischen Tenants
- Token-Cache ist per Tenant isoliert

#### 4.2.4 Token-Sicherheit & Secrets Management

**Token Cache (nach Plattform):**

| Plattform | Strategie | Library |
|---|---|---|
| macOS | Keychain | `keytar` |
| Windows | Credential Manager | `keytar` |
| Linux | Secret Service (GNOME) / libsecret | `keytar` |
| CI/CD | Environment Variables | direkt aus `process.env` |
| Fallback | Verschlüsseltes JSON-File | `@azure/msal-node-extensions` |

**MSAL Cache Plugin:**
`@azure/msal-node-extensions` bietet `FilePersistenceWithDataProtection`
(Windows) und `KeychainPersistence` (macOS) out of the box.

**Secrets in Config:**
- `client_id`, `tenant_id` → `.env` (nicht sensitiv, aber tenant-spezifisch)
- `client_secret` (falls App-Credential) → OS Keychain oder ENV
- Tokens → MSAL Cache (verschlüsselt)
- `.env` in `.gitignore`, `.env.example` ohne Werte

**Logging-Ausschluss:** Token-Werte, Authorization-Header und
Benutzer-Inhalte werden NICHT geloggt (→ Abschnitt 4.2.5).

#### 4.2.5 Observability

Structured Logging mit `pino` (JSON-Format, kompatibel mit ELK/Loki/CloudWatch):

**Log-Level-Architektur:**
```typescript
// Jeder Graph-API-Call wird geloggt:
logger.info({
  tool: "list_emails",
  method: "GET",
  endpoint: "/me/messages",
  status: 200,
  duration_ms: 142,
  items_returned: 25,
  has_next_page: true,
  request_id: "abc-123",          // Graph: client-request-id
  correlation_id: "def-456",      // Graph: x-ms-ags-diagnostic
});

// Fehler mit Kontext:
logger.error({
  tool: "send_email",
  method: "POST",
  endpoint: "/me/sendMail",
  status: 403,
  error_code: "ErrorAccessDenied",
  error_message: "Access is denied.",
  required_scope: "Mail.Send",
  duration_ms: 89,
  request_id: "ghi-789",
});
```

**Was NICHT geloggt wird (PII/Datenschutz):**
- E-Mail-Bodys, Betreffzeilen, Empfänger
- Datei-Inhalte
- Kontakt-Details
- Token-Werte, Authorization-Header
- Jegliche Benutzer-Inhalte

**Request-ID-Korrelation:**
Jeder Graph-Call setzt `client-request-id` Header → ermöglicht
Troubleshooting mit Microsoft Support.

**Metriken (Phase 7, optional):**
- Requests/Minute pro Tool
- Error-Rate pro Tool
- P95/P99 Latenz pro Endpunkt
- Token-Refresh-Events
- Rate-Limit-Hits (429er)

#### 4.2.6 Idempotenz

Schreibende Operationen müssen sicher bei LLM-Retries sein:

**Pattern 1: Client-Side Idempotency Key**
```typescript
const WriteParams = z.object({
  idempotency_key: z.string().optional()
    .describe("Optionaler Idempotenz-Schlüssel. Bei gleichem Key wird die "
            + "Operation nicht wiederholt, sondern das vorherige Ergebnis "
            + "zurückgegeben."),
});
```

**Implementierung:**
- In-Memory-Cache (Map<string, ToolResult>) mit 10-Minuten-TTL
- Key = `${tool_name}:${idempotency_key}`
- Wenn Key existiert → vorheriges Ergebnis zurückgeben
- Wenn Key nicht existiert → Operation ausführen, Ergebnis cachen

**Pattern 2: Duplicate Detection (ohne Key)**
Für `send_email` ohne expliziten Key:
- Hash aus `to + subject + body_first_200_chars + timestamp_minute`
- Warnung wenn identischer Hash innerhalb von 2 Minuten

**Pattern 3: Graph-API `Prefer: IdempotencyKey` Header**
Wo die Graph API es unterstützt (z.B. Event-Erstellung), wird der
native Header genutzt.

#### 4.2.7 Graceful Degradation

**Error-Mapping (Graph → MCP → LLM-verständlich):**

| Graph Status | MCP Error Type | LLM-Nachricht (DE) |
|---|---|---|
| 400 Bad Request | InvalidParams | "Ungültige Parameter: {details}" |
| 401 Unauthorized | AuthError | "Anmeldung abgelaufen. Bitte Token erneuern." |
| 403 Forbidden | PermissionError | "Fehlende Berechtigung: {scope}. Admin-Consent erforderlich." |
| 404 Not Found | NotFound | "Ressource nicht gefunden: {resource_type} mit ID {id}" |
| 409 Conflict | ConflictError | "Konflikt: {details}. Ressource wurde zwischenzeitlich geändert." |
| 429 Too Many | RateLimited | "Rate-Limit erreicht. Automatischer Retry in {n} Sekunden." |
| 500-503 | ServiceError | "Microsoft Graph API temporär nicht verfügbar. Bitte in {n} Sekunden erneut versuchen." |
| ECONNREFUSED | NetworkError | "Keine Verbindung zu Microsoft Graph. Netzwerk prüfen." |
| Token Refresh Fail | AuthError | "Token-Erneuerung fehlgeschlagen. Bitte erneut anmelden mit: [Anleitung]" |

**Retry-Strategie:**
```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,         // 1s
  maxDelay: 32000,         // 32s
  retryableStatuses: [429, 500, 502, 503, 504],
  respectRetryAfter: true, // 429 Retry-After Header hat Vorrang
};
```

**Partial Failure bei Batch:**
Wenn ein Batch-Request teilweise fehlschlägt, werden erfolgreiche und
gescheiterte Operationen getrennt zurückgegeben.

**Service-Degradation:**
Wenn die Graph API wiederholt 5xx zurückgibt, wird ein Circuit-Breaker
aktiviert (5 Failures in 60s → 30s Pause → Half-Open → Retry).

### 4.3 Test-Strategie

Drei Ebenen, klar getrennt:

**Unit-Tests (Vitest + MSW):**
- Jedes Tool: Happy Path, Error Cases, Input-Validierung
- MSW intercepted Graph-API-Calls → deterministische Responses
- Fixtures aus echten API-Responses generiert
- Laufen bei jedem Push (CI, <30s)

**Integration-Tests (Vitest + MSW, komplexere Szenarien):**
- Modul-übergreifend: z.B. "list_emails → download_attachment"
- Pagination über mehrere Seiten
- Batch-Request-Verhalten
- Auth-Token-Refresh-Simulation
- Laufen bei jedem PR

**E2E-Tests (Microsoft 365 Developer Tenant):**
- Dedizierter Test-Tenant (Microsoft 365 Developer Program, kostenlos)
- Seed-Daten: Test-Mails, Kalender-Einträge, OneDrive-Files
- Separater CI-Job: Nightly oder manuell triggered
- Validiert: Auth-Flow, echte Graph-API-Responses, Pagination
- Generiert aktualisierte Fixtures für MSW-Mocks
- Markiert als `@e2e` → nicht bei normalem `npm test`

**Fixture-Sync-Workflow:**
```
E2E-Test gegen echten Tenant
  → Response aufzeichnen (sanitized, keine PII)
  → tests/mocks/fixtures/ aktualisieren
  → MSW-Handler automatisch aktuell halten
```

---

## 5. Datenschutz & Compliance (DSGVO)

### 5.1 Datenfluss-Architektur

```
┌─────────────────────────────────────────────────────────┐
│  Lokaler Rechner des Benutzers                          │
│                                                         │
│  Claude Desktop / Cowork                                │
│      │                                                  │
│      │ stdio (lokal, kein Netzwerk)                     │
│      ▼                                                  │
│  pommer-m365-mcp (lokaler Prozess)                      │
│      │                                                  │
│      │ HTTPS (verschlüsselt)                            │
│      ▼                                                  │
│  Microsoft Graph API (graph.microsoft.com)              │
│      → Daten verbleiben in Microsoft-Infrastruktur      │
│      → Tenant-Daten unterliegen M365-Datenresidenz      │
└─────────────────────────────────────────────────────────┘
           │
           │ MCP Tool-Calls (im Prompt)
           ▼
     Anthropic API
     → Tool-Names + Parameter werden übertragen
     → Response-Inhalte werden übertragen
     → Anthropic Datenverarbeitung gemäß DPA
```

### 5.2 Was wird wohin übertragen?

| Daten | Verbleibt lokal | Geht an Microsoft | Geht an Anthropic |
|---|---|---|---|
| Auth-Tokens | ✅ (OS Keychain) | ✅ (Auth-Header) | ❌ |
| Tool-Parameter | ✅ | ✅ (API-Request) | ✅ (im Prompt) |
| E-Mail-Bodys / Inhalte | ✅ (Transit) | ✅ (Quelle) | ✅ (als Tool-Response) |
| Datei-Inhalte (Base64) | ✅ (Transit) | ✅ (Quelle) | ✅ (als Tool-Response) |
| Kalender-Details | ✅ (Transit) | ✅ (Quelle) | ✅ (als Tool-Response) |
| Log-Dateien | ✅ | ❌ | ❌ |
| Token-Cache | ✅ (verschlüsselt) | ❌ | ❌ |

### 5.3 Implikationen

**Kernaussage:** Der MCP-Server selbst speichert keine Inhalte persistent.
Er ist ein zustandsloser Proxy. ABER: Die Tool-Responses (E-Mail-Inhalte,
Datei-Inhalte, Kalenderdetails) werden als Teil des LLM-Prompts an
Anthropic übertragen.

**Maßnahmen:**
1. **Context-Budget-Management** (4.2.1) minimiert die übertragene Datenmenge
2. **Summary-Mode** als Default: Body-Previews statt vollständige Inhalte
3. **Kein Logging von Inhalten:** Nur Metadaten (Tool-Name, Status, Latenz)
4. **Token-Verschlüsselung:** OS Keychain, keine Klartext-Files
5. **Keine Persistenz:** Kein Cache von E-Mail-Inhalten oder Dateien auf Disk
6. **Konfigurierbare Felder:** `$select` begrenzt welche Graph-Felder abgerufen werden

**Für Kunden-Einsatz relevant:**
- Anthropic DPA (Data Processing Agreement) muss geprüft werden
- Claude Team/Enterprise bieten ggf. bessere Datenverarbeitung-Garantien
- Alternative: Self-hosted LLM für sensible Tenants (nicht im Scope dieses Projekts)
- Kein Admin-Consent für Application Permissions ohne Kunden-Freigabe

### 5.4 Checkliste für Kunden-Deployment

- [ ] Anthropic DPA vorhanden und geprüft
- [ ] Microsoft 365 Tenant-Admin hat App-Registration genehmigt
- [ ] Permissions auf Minimal-Scope beschränkt
- [ ] ReadOnly-Preset als Default aktiviert
- [ ] Log-Verzeichnis definiert und Retention-Policy festgelegt
- [ ] Benutzer über Datenfluss informiert (welche Inhalte an Anthropic gehen)
- [ ] Optional: Sensible Ordner/Mailboxen per Config von Zugriff ausschließen

---

## 6. Onboarding & Setup

### 6.1 Setup-Wizard (`npx pommer-m365-mcp setup`)

Interaktiver CLI-Wizard der durch alle Schritte führt:

```
$ npx pommer-m365-mcp setup

╔══════════════════════════════════════════╗
║  pommer-m365-mcp – Setup Wizard         ║
╚══════════════════════════════════════════╝

Schritt 1/5: Azure App Registration
  → Option A: Automatisch erstellen (Azure CLI erforderlich)
  → Option B: Manuell – Anleitung wird geöffnet

  Tenant-ID: ________________________________________
  Client-ID: ________________________________________

Schritt 2/5: Permissions prüfen
  ✅ Mail.Read
  ✅ Mail.Send
  ✅ Calendars.ReadWrite
  ⚠️ Files.ReadWrite – Admin Consent erforderlich
  → Consent-URL wird im Browser geöffnet

Schritt 3/5: Auth-Test
  → Device Code Flow starten...
  → Browser öffnen: https://microsoft.com/devicelogin
  → Code eingeben: ABCD-1234
  ✅ Authentifizierung erfolgreich als: klaus@pommer-it.de

Schritt 4/5: Tool-Preset wählen
  → [1] Minimal (nur lesen)
  → [2] MVP (Mail + Kalender + OneDrive)
  → [3] Vollständig (alle Tools)
  Auswahl: 2

Schritt 5/5: Claude Desktop konfigurieren
  → claude_desktop_config.json wird aktualisiert
  → Pfad: ~/Library/Application Support/Claude/claude_desktop_config.json
  ✅ Konfiguration geschrieben

═══════════════════════════════════════════
  Setup abgeschlossen! Starte Claude Desktop neu.
  Teste mit: "Liste meine letzten 5 E-Mails"
═══════════════════════════════════════════
```

### 6.2 Setup-Aufwand (geschätzt)

| Schritt | Mit Wizard | Ohne Wizard |
|---|---|---|
| Azure App Registration | 2 Min (auto) / 10 Min (manuell) | 15-30 Min |
| Permission Consent | 1 Min | 5-10 Min |
| Auth-Test | 1 Min | 5 Min |
| Claude Desktop Config | Automatisch | 5-10 Min (JSON editieren) |
| **Gesamt** | **~5 Min** | **~30-55 Min** |

### 6.3 Voraussetzungen

- Node.js 22+
- Microsoft 365 Account (Business oder Developer)
- Azure AD App Registration Berechtigung (oder Tenant-Admin)
- Claude Desktop oder Claude Code installiert

---

## 7. Claude Code Development Setup

### 7.1 MCP-Server für Entwicklung

Claude Code wird mit folgenden MCP-Servern konfiguriert:

**Context7** – Aktuelle Library-Docs direkt im Prompt

```bash
claude mcp add context7 --scope user -- npx -y @upstash/context7-mcp@latest
```

Nutzen:
- Aktuelle `@modelcontextprotocol/sdk`-Docs (statt veraltete Training-Daten)
- `@microsoft/microsoft-graph-client` API-Referenz
- `@azure/msal-node` Auth-Patterns
- Zod, Vitest, Biome Docs

CLAUDE.md-Regel:
```
Nutze immer Context7 MCP für Library-Dokumentation zu:
@modelcontextprotocol/sdk, @microsoft/microsoft-graph-client,
@azure/msal-node, zod, vitest, msw, biome.
Verwende `use context7` oder die Library-ID direkt.
```

**Playwright MCP** – Browser-Automation für Auth-Tests

```bash
claude mcp add playwright --scope project -- npx @playwright/mcp@latest
```

Nutzen:
- OAuth Device-Code-Flow im Browser testen und debuggen
- Microsoft Entra App-Registration über Azure Portal automatisieren
- Graph Explorer öffnen und API-Endpunkte manuell validieren
- Visual Regression der Auth-UI bei Token-Refresh

NICHT für Unit-Tests – die laufen über Vitest + MSW.

### 7.2 Subagent-Definitionen

Drei spezialisierte Subagents für wiederkehrende Entwicklungsaufgaben:

**`.claude/agents/graph-api-researcher.md`**
```yaml
---
name: graph-api-researcher
description: Recherchiert Microsoft Graph API Endpunkte, Permissions und Datenmodelle
tools: Read, Glob, Grep, context7
model: sonnet
---
Du bist ein Microsoft Graph API Experte. Deine Aufgabe:

1. Nutze Context7 MCP um aktuelle Microsoft Graph Docs zu laden
2. Recherchiere für einen gegebenen Funktionsbereich:
   - Relevante API-Endpunkte (v1.0, nicht beta)
   - Benötigte Delegated Permissions (Minimal-Scope)
   - Request/Response-Schemas
   - OData-Query-Parameter ($filter, $select, $expand, $orderby)
   - Pagination-Verhalten (@odata.nextLink)
   - Rate-Limit-Hinweise
   - Bekannte Einschränkungen
3. Dokumentiere das Ergebnis strukturiert als Markdown
4. Gib eine Empfehlung für die Tool-Granularität (ein Tool vs. mehrere)
```

**`.claude/agents/mcp-tool-tester.md`**
```yaml
---
name: mcp-tool-tester
description: Testet einzelne MCP-Tools gegen die echte Graph API
tools: Bash, Read, Write
permissionMode: default
---
Du bist ein MCP-Tool-Tester. Deine Aufgabe:

1. Starte den MCP-Server lokal via `npm run dev`
2. Nutze den MCP Inspector (`npx @modelcontextprotocol/inspector`)
   oder ein direktes JSON-RPC-Call-Skript um Tools aufzurufen
3. Teste jeden Tool-Call gegen die echte Graph API
4. Dokumentiere:
   - Input-Parameter (valide + invalide)
   - Response-Format und Vollständigkeit
   - Error-Cases (401, 403, 404, 429, 500)
   - Pagination bei Listen-Endpunkten
   - Latenz
5. Erstelle einen Test-Report als Markdown
6. Schlage fehlende Edge-Case-Tests für Vitest vor
```

**`.claude/agents/code-reviewer.md`**
```yaml
---
name: code-reviewer
description: Review mit Fokus auf MCP-Patterns, Zod-Schemas, Error-Handling, Datenschutz
tools: Read, Glob, Grep
model: sonnet
memory: project
---
Du bist Code-Reviewer für einen MCP-Server (TypeScript).
Prüfe bei jedem Review:

1. **Zod-Schemas:** Sind Input-Schemas vollständig? Stimmen
   z.infer<> Types mit der tatsächlichen Nutzung überein?
2. **MCP-Patterns:** Korrekte Tool-Registration? Description
   klar genug für LLM-Auswahl? inputSchema als JSON Schema?
3. **Error-Handling:** Werden Graph-API-Fehler (4xx/5xx) in
   benutzerfreundliche MCP-Errors übersetzt? Retry bei 429?
   Graceful Degradation bei 5xx?
4. **Pagination:** Wird @odata.nextLink verfolgt? Max-Items konfigurierbar?
5. **Context-Budget:** Nutzt das Tool $select? Wird die Response
   auf maxItems/maxBodyLength begrenzt?
6. **Destructive Safety:** Haben schreibende Tools confirm-Pattern?
   Ist idempotency_key implementiert?
7. **TypeScript:** Strict Mode? No `any`? Proper null-checks?
8. **Tests:** Hat jedes Tool mindestens einen Happy-Path und
   einen Error-Test? Wird MSW für Graph-Mocking genutzt?
9. **Security/DSGVO:** Werden Tokens geloggt? Sensitive Daten in Errors?
   Werden Inhalte ungewollt persistiert?
10. **Multi-Tenant:** Wird user_id-Parameter korrekt durchgereicht?

Aktualisiere dein Agent-Memory mit gefundenen Patterns und
wiederkehrenden Issues.
```

### 7.3 Skills

Zwei Skills für wiederkehrende Scaffolding-Aufgaben:

**`.claude/skills/mcp-tool-scaffold/SKILL.md`**
```yaml
---
name: mcp-tool-scaffold
description: Scaffold für ein neues MCP-Tool mit Zod-Schema, Handler, Tests
---
# MCP Tool Scaffold

Wenn ein neues MCP-Tool implementiert werden soll, folge diesem Workflow:

## 1. Zod-Schema definieren (src/schemas/<modul>.ts)
- Input-Schema mit allen Parametern
- Extend BaseParams (enthält user_id, idempotency_key)
- Output-Type für die Response
- Beschreibungen an jedem Feld (werden zu JSON Schema descriptions)
- Bei schreibenden Tools: `confirm: z.boolean().default(false)`

## 2. Tool-Handler implementieren (src/tools/<modul>.ts)
- Import des Zod-Schemas
- `.parse()` für Input-Validierung
- Context-Budget: Immer `$select` setzen, Response shapen
- Graph-Client-Aufruf mit Fehlerbehandlung
- Response-Mapping auf MCP ToolResult
- Idempotenz-Check bei schreibenden Tools
- pino-Logger für Request/Response-Metadaten (keine Inhalte!)

## 3. Tool registrieren (src/index.ts)
- server.tool() mit name, description, inputSchema, handler
- inputSchema via zodToJsonSchema() aus dem Zod-Schema generieren
- Tool-Klassifizierung: safe | moderate | destructive

## 4. Tests schreiben (tests/<modul>.test.ts)
- MSW-Handler für den Graph-Endpunkt mocken
- Happy-Path-Test
- Error-Test (403 Forbidden, 404 Not Found)
- Pagination-Test (wenn Listen-Endpunkt)
- Validierungs-Test (ungültige Inputs)
- Idempotenz-Test (doppelter Call mit gleicher Key)
- Context-Budget-Test (Response-Größe prüfen)

## 5. Docs aktualisieren
- Tool-Name + Beschreibung in README.md Tools-Tabelle
- Benötigte Permission in der Permissions-Matrix
- Destructive-Klassifizierung dokumentieren

## Template-Dateien
Siehe ./templates/ für Boilerplate-Code.
```

**`.claude/skills/graph-api-patterns/SKILL.md`**
```yaml
---
name: graph-api-patterns
description: Best Practices für Microsoft Graph API Zugriffe im MCP-Server
---
# Graph API Patterns

## Pagination
Immer `@odata.nextLink` verfolgen. Default-Pattern:

```typescript
async function* paginate<T>(client: Client, url: string): AsyncGenerator<T> {
  let nextUrl: string | undefined = url;
  while (nextUrl) {
    const response = await client.api(nextUrl).get();
    yield* response.value;
    nextUrl = response['@odata.nextLink'];
  }
}
```

## OData Filter
- Strings: `$filter=subject eq 'Test'`
- Dates: `$filter=receivedDateTime ge 2024-01-01T00:00:00Z`
- Contains: `$filter=contains(subject, 'test')`
- Kombiniert: `$filter=isRead eq false and importance eq 'high'`

## Default $select pro Entität (Context-Budget)
- Mail: `id,subject,from,receivedDateTime,bodyPreview,isRead,importance`
- Event: `id,subject,start,end,location,organizer,isAllDay`
- File: `id,name,size,lastModifiedDateTime,webUrl,file,folder`
- Contact: `id,displayName,emailAddresses,businessPhones,companyName`
- Task: `id,title,status,dueDateTime,importance`

## Error Handling
Graph-API HTTP-Codes auf MCP-Errors mappen:
- 400 → InvalidParams: "Ungültige Parameter: {details}"
- 401/403 → AuthError: "Fehlende Berechtigung: {scope}"
- 404 → NotFound: "Ressource nicht gefunden"
- 409 → ConflictError: "Ressource wurde zwischenzeitlich geändert"
- 429 → Retry mit `Retry-After` Header (automatisch)
- 500+ → ServiceError: "Graph API temporär nicht verfügbar"

## Rate Limiting
- Default: 10.000 Requests / 10 Min pro App
- Mail senden: 10.000 / Tag
- Immer `Retry-After` Header beachten
- Exponential Backoff: 1s, 2s, 4s, max 32s

## Batch Requests
- POST /$batch mit max 20 Requests pro Batch
- Jeder Request hat eigene ID
- Responses kommen in gleicher Reihenfolge
- Partial Failures getrennt behandeln

## File Transfer
- Download < 4MB: Direct GET mit Base64-Encoding
- Download > 4MB: Download-URL zurückgeben
- Upload < 4MB: PUT mit Content direkt
- Upload > 4MB: Resumable Upload Session

## Observability
- Jeder Graph-Call: pino.info mit tool, method, endpoint, status, duration_ms
- Fehler: pino.error mit error_code, required_scope
- NIEMALS loggen: Body-Inhalte, Token-Werte, PII
- Immer setzen: client-request-id Header für Korrelation
```

### 7.4 Slash Commands

**`.claude/commands/new-tool.md`**
```yaml
---
description: Scaffold und implementiere ein neues MCP-Tool
---
Implementiere ein neues MCP-Tool für: $ARGUMENTS

1. Nutze @graph-api-researcher um die Graph API Endpunkte zu recherchieren
2. Folge den mcp-tool-scaffold Skill-Anweisungen
3. Erstelle Schema, Handler, Tests, Docs
4. Stelle sicher: Context-Budget ($select), Destructive Safety (confirm),
   Idempotenz (idempotency_key), Observability (pino), Multi-Tenant (user_id)
5. Führe `npm run test` aus und fixe Fehler
6. Führe `npm run lint` aus und fixe Fehler
```

**`.claude/commands/test-tool.md`**
```yaml
---
description: Teste ein MCP-Tool gegen die echte Graph API
---
Teste das MCP-Tool: $ARGUMENTS

1. Nutze @mcp-tool-tester um das Tool zu testen
2. Dokumentiere Ergebnisse
3. Erstelle fehlende Vitest-Cases basierend auf den Findings
```

**`.claude/commands/review.md`**
```yaml
---
description: Code-Review für geänderte Dateien
---
Führe ein Code-Review durch mit @code-reviewer.
Fokus auf die zuletzt geänderten Dateien.
Prüfe besonders: MCP-Patterns, Zod-Schemas, Error-Handling,
Context-Budget, Destructive Safety, Observability, DSGVO.
```

---

## 8. Implementierungsroadmap

### Phase 0: Project Engineering (Sprint 0, ~2 Tage)

**Ziel:** Vollständiges Projekt-Skelett mit Quality Gates + Cross-Cutting Infrastructure

```
Claude Code Setup:
├── MCP-Server installieren (Context7, Playwright)
├── Subagent-Definitionen erstellen
├── Skills + Slash Commands einrichten
├── CLAUDE.md mit Projekt-Konventionen
└── .claude/settings.json (Permissions, Allowed Commands)

Projekt-Scaffold:
├── package.json (Dependencies, Scripts)
├── tsconfig.json (strict, ESM)
├── tsup.config.ts (Build)
├── biome.json (Lint + Format Rules)
├── vitest.config.ts (Test-Config, MSW Setup)
├── .env.example + dotenv Setup
├── .gitignore
└── README.md (Setup-Guide)

GitHub Repository:
├── .github/
│   ├── workflows/
│   │   ├── ci.yml (test + lint + build auf Push/PR)
│   │   ├── e2e.yml (Nightly gegen M365 Dev Tenant)
│   │   ├── release.yml (semantic-release + npm publish)
│   │   └── dependabot.yml (Dependency-Updates)
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   ├── pull_request_template.md
│   └── CODEOWNERS
├── .husky/
│   └── pre-commit (biome check + vitest --run)
└── CHANGELOG.md (auto-generated via semantic-release)

Test-Infrastruktur:
├── tests/
│   ├── setup.ts (MSW Server, Global Mocks)
│   ├── mocks/
│   │   ├── handlers.ts (MSW Request Handlers)
│   │   └── fixtures/ (Graph API Response Fixtures)
│   ├── helpers/
│   │   └── mcp-test-client.ts (MCP Tool Call Helper)
│   └── e2e/
│       ├── setup.ts (M365 Dev Tenant Auth)
│       ├── seed.ts (Test-Daten erstellen)
│       └── fixture-recorder.ts (Responses → MSW Fixtures)
├── vitest.config.ts
└── msw (Graph API Mock Service Worker)

Dokumentation:
├── docs/
│   ├── ARCHITECTURE.md (inkl. Cross-Cutting Patterns)
│   ├── CONTRIBUTING.md
│   ├── PERMISSIONS.md (Graph API Scopes Matrix)
│   ├── TOOLS.md (Tool-Referenz, auto-aktualisiert)
│   ├── DATA-PRIVACY.md (DSGVO-Dokumentation)
│   └── SETUP.md (Onboarding-Anleitung)
└── typedoc.json (API-Doc-Generation)
```

**CI Pipeline (GitHub Actions `ci.yml`):**
```yaml
on: [push, pull_request]
jobs:
  quality:
    steps:
      - biome check --no-errors-on-unmatched
      - vitest run --coverage
      - tsup (build check)
      - typedoc (doc generation check)
```

**E2E Pipeline (`e2e.yml`):**
```yaml
on:
  schedule:
    - cron: '0 3 * * *'    # Nightly 03:00 UTC
  workflow_dispatch:         # Manuell triggerable
jobs:
  e2e:
    env:
      M365_TENANT_ID: ${{ secrets.M365_TENANT_ID }}
      M365_CLIENT_ID: ${{ secrets.M365_CLIENT_ID }}
      M365_CLIENT_SECRET: ${{ secrets.M365_CLIENT_SECRET }}
    steps:
      - vitest run --project e2e
      - Upload updated fixtures as artifact
```

**Release Pipeline (`release.yml`):**
```yaml
on:
  push:
    branches: [main]
jobs:
  release:
    steps:
      - semantic-release (version bump, changelog, npm publish)
```

**Deliverables:**
- Kompilierbares, leeres Projekt mit allen Quality Gates
- CI/CD + E2E-Nightly aktiv auf GitHub
- Erster "Hello World" MCP-Server der auf `list_tools` antwortet
- Alle Subagents, Skills, Commands einsatzbereit
- M365 Developer Tenant registriert und Seed-Daten erstellt

### Phase 1: Foundation + Auth + Cross-Cutting (Sprint 1–2, ~4 Tage)

**Ziel:** Lauffähiger MCP-Server mit Auth, Infrastruktur-Patterns und erstem Tool

```
Cross-Cutting Infrastructure:
├── src/utils/response-shaper.ts (Context-Budget-Management)
│   → $select Defaults, maxItems, maxBodyLength, truncation
├── src/utils/confirmation.ts (Destructive Operations Safety)
│   → confirm-Pattern, dry_run, Tool-Klassifizierung
├── src/utils/idempotency.ts (Idempotenz-Cache)
│   → In-Memory Map mit TTL, Duplicate Detection
├── src/utils/errors.ts (Graceful Degradation)
│   → Graph → MCP Error Mapping, Circuit Breaker
├── src/utils/rate-limit.ts (429 Retry + Exponential Backoff)
├── src/utils/pagination.ts (Async Generator + Kommunikation)
├── src/utils/logger.ts (pino Setup, PII-Filter)
│   → Structured JSON, Request-ID-Korrelation
├── src/schemas/common.ts (BaseParams: user_id, idempotency_key, confirm)
└── src/middleware/ (Graph-Client-Middleware-Chain)
    → Logging → RateLimit → Retry → Error-Mapping

Auth:
├── src/auth/msal-client.ts (Device Code Flow + Token Cache)
│   → Keychain/Credential Manager via msal-node-extensions
├── src/auth/graph-client.ts (Graph Client Factory)
│   → client-request-id Header, Middleware-Chain
└── src/config.ts (Tool-Presets: mvp, full, readonly)

Erstes Tool:
├── src/tools/mail.ts → list_emails (GET /me/messages)
│   → Volle Integration aller Cross-Cutting Patterns
└── Tests: Auth-Mock, list_emails (Happy/Error/Pagination/Budget)

Setup-Wizard (Basis):
└── src/cli/setup.ts (interaktiver Setup-Flow, Phase 7 vollständig)
```

**Azure App Registration Scopes (MVP):**
```
Mail.ReadWrite, Mail.Send
Calendars.ReadWrite
Files.ReadWrite
Contacts.ReadWrite
Tasks.ReadWrite
User.Read
```

### Phase 2: Mail-Modul (Sprint 3–4, ~3 Tage)

```
Tools:
├── list_emails (Folder, Search, Top, Skip, Filter)
│   → $select Default, maxItems: 25, bodyPreview: 500 chars
├── read_email (Body + Metadata)
│   → Vollständiger Body, aber maxBodyLength konfigurierbar
├── send_email (To, CC, BCC, Subject, Body, Importance)
│   → DESTRUCTIVE: confirm-Pattern, Idempotenz
├── reply_email (Reply / ReplyAll)
│   → DESTRUCTIVE: confirm-Pattern
├── forward_email
│   → DESTRUCTIVE: confirm-Pattern
├── move_email
│   → DESTRUCTIVE: confirm-Pattern, dry_run
├── list_mail_folders
├── list_attachments
├── download_attachment (Base64, mit Größen-Warnung >4MB)
└── search_emails (OData $search + $filter)
```

### Phase 3: Kalender-Modul (Sprint 5–6, ~2 Tage)

```
Tools:
├── list_events (Zeitraum, Kalender-Filter)
├── get_event
├── create_event (Attendees, Recurrence, Reminder)
│   → MODERATE: Bestätigung im Response
│   → Idempotenz via Prefer: IdempotencyKey Header
├── update_event
│   → MODERATE: Bestätigung + Vorher/Nachher-Diff
├── delete_event
│   → DESTRUCTIVE: confirm-Pattern
├── get_calendar_view (Tages-/Wochenansicht)
├── check_availability (findMeetingTimes)
└── list_calendars
```

### Phase 4: OneDrive-Modul (Sprint 7–8, ~3 Tage)

```
Tools:
├── list_files (Ordner-Browse, Pfad-basiert)
│   → $select: name, size, lastModified, webUrl
├── search_files (Volltext)
├── get_file_metadata
├── download_file (<4MB Base64, >4MB URL)
│   → Context-Budget: Warnung bei großen Dateien
├── upload_file (Simple <4MB, Resumable >4MB)
│   → MODERATE: Bestätigung mit Dateiname + Größe
├── create_folder
├── move_file / copy_file
│   → MODERATE: Bestätigung mit Quelle + Ziel
├── share_file (Sharing-Link)
│   → DESTRUCTIVE: confirm (ändert Zugriffsberechtigungen)
└── get_recent_files
```

### Phase 5: Kontakte + To Do (Sprint 9–10, ~2 Tage)

```
Kontakte: list, get, create, update, delete
To Do: list_task_lists, list_tasks, create, update, complete
```

### Phase 6: Teams + SharePoint (Sprint 11–13, ~3 Tage)

```
Teams: list_teams, list_channels, list/send messages, list/send chats
  → send_*: DESTRUCTIVE confirm-Pattern
SharePoint: list/search sites, list items, get/create items
```

### Phase 7: Polish & Advanced (Sprint 14–16, ~3 Tage)

```
├── Batch-Request-Support ($batch Endpoint)
│   → Partial Failure Handling
├── Konfigurierbare Tool-Presets (mvp, full, readonly)
├── Setup-Wizard vervollständigen (npx pommer-m365-mcp setup)
│   → Azure App Registration (auto via Azure CLI)
│   → Permission Check + Consent-Flow
│   → Auth-Test
│   → Claude Desktop Config schreiben
├── Error Messages (deutsch + englisch, konfigurierbar)
├── README + Setup-Guide (deutsch)
├── docs/DATA-PRIVACY.md finalisieren
├── Lizenz-Entscheidung treffen
├── npm-Package veröffentlichen
├── Optional: HTTP/SSE Transport
├── Optional: Webhook-Subscriptions
└── Optional: Metriken-Export (Prometheus/StatsD)
```

---

## 9. Projektstruktur (Final)

```
pommer-m365-mcp/
├── .claude/
│   ├── agents/
│   │   ├── graph-api-researcher.md
│   │   ├── mcp-tool-tester.md
│   │   └── code-reviewer.md
│   ├── commands/
│   │   ├── new-tool.md
│   │   ├── test-tool.md
│   │   └── review.md
│   ├── skills/
│   │   ├── mcp-tool-scaffold/
│   │   │   ├── SKILL.md
│   │   │   └── templates/
│   │   │       ├── tool-handler.ts.tmpl
│   │   │       ├── tool-schema.ts.tmpl
│   │   │       └── tool-test.ts.tmpl
│   │   └── graph-api-patterns/
│   │       └── SKILL.md
│   └── settings.json
├── CLAUDE.md
├── src/
│   ├── index.ts
│   ├── cli/
│   │   └── setup.ts
│   ├── auth/
│   │   ├── msal-client.ts
│   │   └── graph-client.ts
│   ├── schemas/
│   │   ├── common.ts         (BaseParams, WriteParams)
│   │   ├── mail.ts
│   │   ├── calendar.ts
│   │   ├── files.ts
│   │   ├── contacts.ts
│   │   ├── todo.ts
│   │   ├── teams.ts
│   │   └── sharepoint.ts
│   ├── tools/
│   │   ├── mail.ts
│   │   ├── calendar.ts
│   │   ├── files.ts
│   │   ├── contacts.ts
│   │   ├── todo.ts
│   │   ├── teams.ts
│   │   └── sharepoint.ts
│   ├── utils/
│   │   ├── response-shaper.ts
│   │   ├── confirmation.ts
│   │   ├── idempotency.ts
│   │   ├── pagination.ts
│   │   ├── batch.ts
│   │   ├── rate-limit.ts
│   │   ├── errors.ts
│   │   └── logger.ts
│   ├── middleware/
│   │   ├── logging.ts
│   │   ├── retry.ts
│   │   └── error-mapping.ts
│   └── config.ts
├── tests/
│   ├── setup.ts
│   ├── mocks/
│   │   ├── handlers/
│   │   │   ├── mail.ts
│   │   │   ├── calendar.ts
│   │   │   └── ...
│   │   └── fixtures/
│   │       ├── mail-list.json
│   │       ├── event.json
│   │       └── ...
│   ├── helpers/
│   │   └── mcp-test-client.ts
│   ├── e2e/
│   │   ├── setup.ts
│   │   ├── seed.ts
│   │   └── fixture-recorder.ts
│   ├── mail.test.ts
│   ├── calendar.test.ts
│   └── ...
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONTRIBUTING.md
│   ├── PERMISSIONS.md
│   ├── TOOLS.md
│   ├── DATA-PRIVACY.md
│   └── SETUP.md
├── scripts/
│   └── register-app.ps1
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── e2e.yml
│   │   ├── release.yml
│   │   └── dependabot.yml
│   ├── ISSUE_TEMPLATE/
│   ├── pull_request_template.md
│   └── CODEOWNERS
├── .husky/
│   └── pre-commit
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── biome.json
├── vitest.config.ts
├── typedoc.json
├── .env.example
├── CHANGELOG.md
├── LICENSE
└── README.md
```

---

## 10. Aufwandsschätzung

| Phase | Aufwand (mit Claude Code + Tooling) | Ohne |
|---|---|---|
| Phase 0: Project Engineering | 1–2 Tage | 3–5 Tage |
| Phase 1: Foundation + Auth + Cross-Cutting | 3–4 Tage | 7–10 Tage |
| Phase 2: Mail | 2–3 Tage | 5–7 Tage |
| Phase 3: Kalender | 1–2 Tage | 3–5 Tage |
| Phase 4: OneDrive | 2–3 Tage | 5–7 Tage |
| Phase 5: Kontakte + To Do | 1–2 Tage | 3–5 Tage |
| Phase 6: Teams + SharePoint | 2–3 Tage | 5–7 Tage |
| Phase 7: Polish + Wizard + Docs | 3–4 Tage | 7–10 Tage |
| **Gesamt MVP (Phase 0–4)** | **~9–14 Tage** | **~23–34 Tage** |
| **Gesamt Vollständig** | **~15–23 Tage** | **~38–56 Tage** |

Mehraufwand gegenüber v2: +2-3 Tage durch Cross-Cutting Infrastructure
(Phase 1) und Setup-Wizard (Phase 7). Amortisiert sich ab dem zweiten
Kunden-Deployment.

---

## 11. Risiken & Mitigationen

| Risiko | Auswirkung | Mitigation |
|---|---|---|
| Graph API Rate-Limits (429) | Tools schlagen fehl | Exponential Backoff + Retry-After + Circuit Breaker |
| Token-Expiry während langer Sessions | Auth-Fehler | Auto-Refresh über MSAL, Graceful Degradation |
| Große Datei-Transfers (>4MB) | Context-Window-Überlauf | Download-URL statt Base64, Größen-Warnung |
| Graph API Breaking Changes | Tools brechen | API-Version v1.0 pinnen, Nightly E2E erkennt Drift |
| MCP SDK Änderungen | Build bricht | SDK-Version pinnen, Context7 für aktuelle Docs |
| Berechtigungs-Eskalation | Sicherheitsrisiko | Minimal-Scope, ReadOnly-Preset als Default, confirm-Pattern |
| MSW Mocks driften von echten Responses | Falsch-positive Tests | Nightly E2E generiert aktualisierte Fixtures |
| Context7 kennt Library nicht | Veraltete Docs | Fallback: Web Search oder Graph API Docs direkt fetchen |
| LLM sendet versehentlich Mail/löscht Termin | Datenverlust | confirm-Pattern, Idempotenz, dry_run |
| Doppelte API-Calls durch LLM-Retries | Duplikate | Idempotency-Key + Duplicate Detection |
| DSGVO-Bedenken bei Kunden | Kein Einsatz | DATA-PRIVACY.md, Konfigurierbare Felder, Summary-Mode |
| Setup zu komplex für Nicht-Techniker | Kein Onboarding | Setup-Wizard (npx pommer-m365-mcp setup) |
| Graph API 5xx bei Microsoft-Ausfall | Service down | Circuit Breaker + verständliche Fehlermeldung |

---

## 12. Claude Code Workflow (Zusammenfassung)

```bash
# 1. MCP-Server für Entwicklung einrichten
claude mcp add context7 --scope user -- npx -y @upstash/context7-mcp@latest
claude mcp add playwright --scope project -- npx @playwright/mcp@latest

# 2. Phase 0: Projekt-Scaffold
claude "/new-tool scaffold the entire project structure"

# 3. Phase 1: Foundation mit allen Cross-Cutting Patterns
claude "/new-tool Foundation: Auth, ResponseShaper, Confirmation,
        Idempotency, ErrorMapping, Logger, RateLimit, list_emails"

# 4. Phase 2+: Pro Modul
claude "/new-tool Mail-Modul: read_email, send_email, reply_email, ..."

# 5. Review (prüft alle 10 Dimensionen)
claude "/review"

# 6. Integration testen
claude "/test-tool list_emails"

# 7. Agent Teams (ab Phase 4, optional)
# Parallel: OneDrive-Agent + Kontakte-Agent + Docs-Agent
```

---

## 13. Nächste Schritte

1. **GitHub Repository** `pommer-m365-mcp` erstellen
2. **Azure AD App Registration** anlegen (manuell oder per Skript)
3. **M365 Developer Tenant** registrieren (für E2E-Tests)
4. **Claude Code** starten mit Phase 0
5. Nach Phase 2 (Mail) erste produktive Nutzung im Consulting-Alltag
6. Iterativ erweitern basierend auf tatsächlichem Bedarf
7. Nach Phase 4 (MVP): Use-Cases UC-01 bis UC-05 als Demo durchspielen
8. Lizenz-Entscheidung vor Phase 7 (npm-Publish)
