# MCP Push-Notification Feasibility Analysis

**Date:** 2026-02-14
**Author:** Solutions Architecture Review
**MCP SDK Version:** 1.12.1

---

## TL;DR

**Teilweise moeglich.** Das MCP-Protokoll unterstuetzt Server-initiated Messages (Notifications, Sampling, Resources), aber Claude Code/Desktop reagiert darauf nur begrenzt. Echte Push-Notifications an die UI sind aktuell nicht moeglich -- der empfohlene Weg ist ein Hybrid aus Webhook-Storage und MCP-Tool-basiertem Polling, ergaenzt durch `notifications/resources/updated` fuer aktive Sessions.

---

## MCP Protocol Capabilities

### Request/Response (Standard)

Das aktuelle MS-MCP nutzt ausschliesslich das Request/Response-Pattern:

1. Claude Code ruft ein MCP-Tool auf (z.B. `list_emails`)
2. MCP Server fuehrt die Graph API Query aus
3. Server antwortet mit dem Ergebnis
4. Claude verarbeitet die Antwort

Der Server ist **passiv** -- er tut nichts, solange kein Tool-Call eingeht. Dieses Pattern laeuft ueber stdio (JSON-RPC 2.0 ueber stdin/stdout).

### Server-Initiated Messages

Das MCP-Protokoll (SDK 1.12.1) unterstuetzt folgende Server-initiierte Nachrichten:

#### 1. Notifications (Server -> Client, fire-and-forget)

| Notification | Zweck | Claude Code Support |
|---|---|---|
| `notifications/resources/updated` | Signalisiert, dass eine Resource sich geaendert hat | Ja -- Client re-fetcht die Resource |
| `notifications/resources/list_changed` | Neue Resources verfuegbar | Ja -- Client re-listet Resources |
| `notifications/tools/list_changed` | Tool-Liste hat sich geaendert | Ja -- Client re-listet Tools |
| `notifications/prompts/list_changed` | Prompt-Liste hat sich geaendert | Ja -- Client re-listet Prompts |
| `logging/message` (via `sendLoggingMessage`) | Log-Nachrichten an Client | Ja -- Client zeigt in Logs |
| `notifications/progress` | Fortschritt eines laufenden Requests | Ja -- Client zeigt Progress |
| `notifications/cancelled` | Request wurde abgebrochen | Ja |

**Wichtig:** Diese Notifications loesen **keine sichtbare UI-Aktion** in Claude Code/Desktop aus. Sie aktualisieren nur interne Caches. Ein `notifications/resources/updated` fuehrt dazu, dass der Client die Resource beim naechsten Zugriff neu laedt -- aber der User sieht keine Benachrichtigung.

#### 2. Sampling (Server -> Client Request)

```typescript
// Server kann den Client bitten, eine LLM-Completion zu erstellen
server.createMessage(params: CreateMessageRequest['params']): Promise<CreateMessageResult>
```

**Capabilities im SDK:**
- `createMessage()` -- Server bittet den Client, eine LLM-Nachricht zu generieren
- Unterstuetzt `messages`, `systemPrompt`, `maxTokens`, `modelPreferences`
- Seit SDK 1.12.1 auch mit Tool-Support (`CreateMessageRequestParamsWithTools`)

**Claude Code/Desktop Verhalten:**
- Sampling erfordert, dass der Client die Capability `sampling` deklariert
- Claude Code unterstuetzt Sampling, aber es wird **vom User bestaetigt** (Human-in-the-Loop)
- Der Server kann **nicht selbstaendig** eine Sampling-Anfrage senden, die automatisch verarbeitet wird
- Sampling ist gedacht fuer "Server braucht LLM-Hilfe waehrend einer Tool-Ausfuehrung", nicht fuer asynchrone Notifications

#### 3. Elicitation (Server -> Client, User Input)

```typescript
server.createElicitation(params): Promise<ElicitationResult>
```

- Server kann den User um strukturierten Input bitten
- Zeigt ein Formular in der Claude UI
- Erfordert Client-Capability `elicitation`
- Blockierend -- wartet auf User-Antwort

**Limitation:** Auch Elicitation funktioniert nur **waehrend einer aktiven Tool-Ausfuehrung**, nicht asynchron.

#### 4. Resources mit Subscriptions

```typescript
// Server deklariert eine Resource
server.resource("notifications", "notifications://recent", async () => {
  return { contents: [{ uri: "notifications://recent", text: JSON.stringify(notifications) }] };
});

// Server signalisiert Update
server.server.sendResourceUpdated({ uri: "notifications://recent" });
```

- Client kann Resources subscriben
- Server kann `notifications/resources/updated` senden
- Client re-fetcht die Resource automatisch
- **Aber:** Kein sichtbarer UI-Indikator fuer den User

### Claude Code/Desktop Integration

**Aktueller Stand (Feb 2026):**

1. **Claude Code (CLI):** Zeigt MCP-Notifications **nicht** in der UI an. Keine Popup/Banner/Badge-Funktion. Tool-Ergebnisse werden nur bei explizitem Aufruf angezeigt.

2. **Claude Desktop:** Aehnliche Limitationen. MCP-Server laufen als Subprozesse. Es gibt kein Event-System, das asynchrone Server-Nachrichten in sichtbare User-Notifications uebersetzt.

3. **Grundproblem:** MCP ist ein **synchrones Tool-Protokoll**. Der Server antwortet auf Anfragen. Server-initiierte Nachrichten existieren, aber nur fuer Metadata-Updates (Resource/Tool/Prompt-Listen), nicht fuer User-facing Alerts.

---

## Recommended Architecture

### Option 1: Polling via MCP Tools (Einfach, funktioniert sicher)

```
Graph API --webhook--> Webhook Receiver --> PostgreSQL/Queue
                                                |
Claude Code --tool call--> MCP Server --query--> DB
         <--result------                   <----
```

**Ablauf:**
1. Externer Webhook Receiver empfaengt Graph Change Notifications
2. Notifications werden in DB/Queue gespeichert
3. User fragt Claude: "Gibt es neue Emails?"
4. Claude ruft `list_notifications` MCP-Tool auf
5. Tool queried die Notification-DB
6. Claude praesentiert Ergebnis

**Vorteile:**
- Funktioniert garantiert mit jeder MCP-Client-Implementierung
- Keine Abhaengigkeit von experimentellen Features
- User hat volle Kontrolle ueber Timing

**Nachteile:**
- Nicht real-time (User muss aktiv fragen)
- Latenz abhaengig von User-Verhalten

### Option 2: Resource Subscription + Polling Hybrid

```
Graph API --webhook--> Webhook Receiver --> DB
                                            |
MCP Server <--- background poll (30s) ------+
     |
     +-- notifications/resources/updated --> Claude Code
     |                                         |
     +<--- resources/read <--------------------+
     +---> notification data ----------------->+
```

**Ablauf:**
1. MCP Server pollt intern die Notification-DB (alle 30s)
2. Bei neuen Notifications: `sendResourceUpdated({ uri: "notifications://recent" })`
3. Claude Code re-fetcht die Resource automatisch
4. **Aber:** User sieht immer noch keinen Alert -- die Daten sind nur "frisch" wenn Claude sie braucht

**Vorteile:**
- Daten sind immer aktuell wenn abgefragt
- Nutzt MCP-Protokoll-Features korrekt

**Nachteile:**
- Kein sichtbarer User-Alert
- Background-Polling im MCP-Server erhoet Komplexitaet
- Resource-Subscriptions sind in Claude Code nicht prominent

### Option 3: Sampling-Trigger (Experimentell, fragwuerdig)

```
Graph API --webhook--> Webhook Receiver --> DB
                                            |
MCP Server <--- background poll (30s) ------+
     |
     +-- createMessage("Du hast 3 neue Emails") --> Claude Code
                                                      |
                                                      v
                                                 [Zeigt Nachricht?]
```

**Ablauf:**
1. MCP Server erkennt neue Notifications
2. Server ruft `createMessage()` auf mit Kontext zu den Notifications
3. Claude Code zeigt die generierte Nachricht (theoretisch)

**Probleme:**
- Sampling ist fuer "Server braucht LLM-Hilfe", nicht fuer Push-Notifications
- Erfordert Human-in-the-Loop Bestaeigung in Claude Code
- Unklar ob Sampling ausserhalb einer aktiven Tool-Execution funktioniert
- Koennte von Claude Code blockiert/ignoriert werden
- **Missbrauch des Protokolls** -- nicht intended use case

### Option 4: Log-basierter Workaround

```
MCP Server --> sendLoggingMessage({ level: "warning", data: "3 neue Emails" })
                    |
                    v
            Claude Code stderr/log panel
```

- `sendLoggingMessage` kann jederzeit gesendet werden
- Erscheint in Claude Code Logs (wenn log level passt)
- Nicht prominent, aber sichtbar bei `LOG_LEVEL=info`
- Einfachster Weg fuer "passive Benachrichtigungen"

---

## Decision Matrix

| Approach | Complexity | Latency | UX | Reliability | Recommendation |
|---|---|---|---|---|---|
| **Polling (Tools)** | Low | 5-60s (user-initiated) | OK -- User fragt aktiv | 100% | MVP |
| **Resource Subscription** | Medium | ~30s (background) | OK -- Daten frisch bei Zugriff | 95% | Enhancement |
| **Sampling Trigger** | High | <5s | Fragwuerdig -- Human-in-the-Loop | 50% | Nicht empfohlen |
| **Log Messages** | Low | <5s | Schwach -- nur in Logs sichtbar | 90% | Nice-to-have |
| **Hybrid (Poll + Resource + Log)** | Medium | <30s | Gut -- kombiniert Vorteile | 95% | Production |

---

## Empfehlung

### MVP (Sprint 1-2): Tool-basiertes Polling

Implementiere drei MCP-Tools:
- `list_notifications` -- Notifications aus DB abfragen (mit Filtern)
- `get_notification_details` -- Volle Resource-Daten zu einer Notification
- `manage_subscriptions` -- Graph Subscriptions erstellen/loeschen

Der User oder ein Claude-Prompt fragt regelmaessig: "Pruefe auf neue Notifications."

### Production (Sprint 3-4): Hybrid mit Resource + Logging

Ergaenze um:
- MCP Resource `notifications://recent` mit Background-Polling
- `sendLoggingMessage` bei kritischen Events (neue Email von VIP, Kalender-Konflikt)
- Resource-Subscription damit Claude bei Zugriff immer aktuelle Daten hat

### Zukunft: MCP Protocol Evolution

Das MCP-Protokoll ist aktiv in Entwicklung. Moegliche zukuenftige Features:
- **Server-initiated Tool Calls** -- Server koennte Claude bitten, ein Tool auszufuehren
- **UI Notifications** -- Dedizierte Notification-Primitive im Protokoll
- **Event Streams** -- SSE/WebSocket-basierte Server-Push
- **Background Tasks** -- Langlebige Server-Tasks mit Progress-Updates

Bis dahin ist Polling + Resource Subscriptions der robusteste Ansatz.

---

## Technische Details

### MCP SDK Server Capabilities (relevant)

```typescript
// Aus @modelcontextprotocol/sdk 1.12.1
class Server {
  // Sampling: Server bittet Client um LLM-Completion
  createMessage(params: CreateMessageRequest['params']): Promise<CreateMessageResult>;

  // Elicitation: Server fragt User nach Input
  createElicitation(params): Promise<ElicitationResult>;

  // Notifications: Server informiert Client ueber Aenderungen
  sendLoggingMessage(params: LoggingMessageNotification['params']): Promise<void>;
  sendResourceUpdated(params: ResourceUpdatedNotification['params']): Promise<void>;
}
```

### Aktueller MCP Server (index.ts)

Der Server nutzt ausschliesslich `StdioServerTransport` -- alle Kommunikation laeuft ueber stdin/stdout. Es gibt keinen HTTP-Endpunkt und keinen Background-Thread. Fuer Polling muesste ein `setInterval` im Server-Prozess laufen, was die Architektur veraendert.

### Offene Fragen

1. **Kann `createMessage()` ausserhalb einer Tool-Execution aufgerufen werden?** -- Technisch ja (der Server hat den Transport), aber Claude Code koennte es ignorieren.
2. **Wie reagiert Claude Desktop auf unaufgeforderte `sendLoggingMessage`?** -- Wird im Log-Panel angezeigt, aber kein UI-Alert.
3. **Gibt es eine MCP-Roadmap fuer Push-Notifications?** -- Stand Feb 2026 nicht oeffentlich bekannt.
