# MCP Server-Initiated Notifications - Technical Analysis

> Analysiert am 2026-02-14 | MCP SDK v1.26.0 | Claude Code als Client

## 1. Supported Server-to-Client Messages

### Alle verfuegbaren Server-Methoden (aus SDK v1.26.0 `Server` class)

| Methode | Signatur | Zweck |
|---------|----------|-------|
| `sendLoggingMessage()` | `(params: {level, data, logger})` | Log-Nachrichten an Client |
| `sendResourceUpdated()` | `(params: {uri})` | Informiert Client dass eine Resource sich geaendert hat |
| `sendResourceListChanged()` | `()` | Informiert Client dass die Resource-Liste sich geaendert hat |
| `sendToolListChanged()` | `()` | Informiert Client dass die Tool-Liste sich geaendert hat |
| `sendPromptListChanged()` | `()` | Informiert Client dass die Prompt-Liste sich geaendert hat |
| `createMessage()` | `(params: {messages, maxTokens, ...})` | Sampling: Server bittet Client um LLM-Aufruf |
| `elicitInput()` | `(params: {message, requestedSchema})` | User-Input via Formular anfordern |

### Detailanalyse

---

### `sendResourceUpdated(uri)` - Resource Update Notification

**MCP Spec:** `notifications/resources/updated`
**Wann gesendet:** Server informiert Client, dass der Inhalt einer bestimmten Resource sich geaendert hat.
**Client-Verhalten (Spec):** Client sollte die Resource neu lesen (`resources/read`).

**Claude Code Realitaet:** NICHT UNTERSTUETZT.
Claude Code unterstuetzt aktuell keine Resource Subscriptions. Die Notification wuerde gesendet, aber Claude Code wuerde sie ignorieren. Quelle: Claude Code Docs und Web-Recherche bestaetigen, dass "resource subscriptions, sampling, and other more advanced or draft capabilities" nicht implementiert sind.

**Fazit:** Technisch sendbar, aber Claude Code reagiert nicht darauf.

---

### `sendResourceListChanged()` - Resource List Changed

**MCP Spec:** `notifications/resources/list_changed`
**Wann gesendet:** Server hat neue Resources hinzugefuegt oder entfernt.
**Client-Verhalten (Spec):** Client ruft `resources/list` erneut auf.

**Claude Code Realitaet:** UNTERSTUETZT.
Claude Code unterstuetzt `list_changed` Notifications fuer Tools, Prompts und Resources. Wenn der Server `sendResourceListChanged()` sendet, aktualisiert Claude Code die Resource-Liste automatisch.

**Nutzbar fuer Notifications:** Eingeschraenkt. Man koennte dynamisch Resources hinzufuegen/entfernen um neue Notifications zu signalisieren. Claude Code wuerde die neue Resource in der `@`-Mention-Liste sehen. ABER: Der User muss aktiv `@` tippen und die Resource auswaehlen -- es gibt kein automatisches Popup oder proaktives Verhalten.

---

### `sendToolListChanged()` - Tool List Changed

**MCP Spec:** `notifications/tools/list_changed`
**Client-Verhalten:** Claude Code aktualisiert Tool-Liste automatisch.

**Nutzbar fuer Notifications:** Theoretisch koennte man dynamisch ein Tool `check_new_notifications` einblenden wenn es neue Nachrichten gibt. Claude wuerde das Tool in seiner Tool-Liste sehen. Aber Claude ruft Tools nicht selbststaendig auf.

---

### `sendLoggingMessage()` - Log Messages

**MCP Spec:** `notifications/message`
**Wann gesendet:** Jederzeit, Server-initiiert.
**Params:** `{level: "debug"|"info"|"notice"|"warning"|"error"|"critical"|"alert"|"emergency", data: any, logger?: string}`

**Claude Code Realitaet:** UNTERSTUETZT (als Log-Output).
Log-Messages erscheinen in Claude Code's internem Log, aber NICHT als sichtbare Nachricht im Conversation-UI. Sie sind fuer Debugging gedacht, nicht fuer User-Notifications.

**Fazit:** Nicht nutzbar fuer proaktive User-Benachrichtigungen.

---

### `createMessage()` - Sampling

**MCP Spec:** `sampling/createMessage`
**Zweck:** Server bittet den Client, einen LLM-Aufruf durchzufuehren.
**Params:** `{messages: [{role, content}], maxTokens, ...}`

**Kann der Server dies UNGEFRAGT aufrufen?**
JA -- technisch ist `createMessage()` eine Methode auf dem Server-Objekt die jederzeit aufgerufen werden kann. Es ist ein Request vom Server zum Client (reverse direction). Der Server kann dies aus jedem Kontext aufrufen: Timer, Event-Handler, Background-Task.

**Claude Code Realitaet:** NICHT UNTERSTUETZT.
Claude Code implementiert keinen `sampling/createMessage` Handler. Der Request wuerde mit einem Fehler zurueckkommen (capability not supported / method not found).

**Fazit:** Die maechtigste Option, aber Claude Code unterstuetzt es nicht.

---

### `elicitInput()` - User Input Elicitation

**MCP Spec:** `elicitation/create`
**Zweck:** Server zeigt dem User ein Formular.

**Claude Code Realitaet:** Moeglicherweise unterstuetzt (neuere Spec-Erweiterung). Selbst wenn unterstuetzt, nur innerhalb eines laufenden Tool-Calls nutzbar, nicht proaktiv.

---

## 2. Sampling Feature - Reality Check

**Frage:** Kann der Server `sampling/createMessage` unaufgefordert aufrufen?

**Antwort:** JA, technisch. Die SDK-API erlaubt es:

```typescript
// Ausserhalb eines Request-Handlers, z.B. in einem setInterval:
const result = await server.server.createMessage({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: "Du hast 3 neue E-Mails erhalten. Moechtest du sie sehen?"
      }
    }
  ],
  maxTokens: 200
});
```

**ABER:** Der Client muss die `sampling` Capability anbieten. Claude Code tut dies aktuell NICHT.

**Evidenz:**
- SDK Server class: `createMessage()` ist eine oeffentliche Methode (Zeile 140-150 in `server/index.d.ts`)
- Die Methode prueft intern `getClientCapabilities().sampling` -- wenn der Client dies nicht anbietet, schlaegt der Call fehl
- Claude Code Docs und Community bestaetigen: Sampling ist nicht implementiert

**Zukunftsaussicht:** Sampling ist ein zentrales MCP-Feature. Es ist wahrscheinlich, dass Claude Code es in einer zukuenftigen Version unterstuetzen wird. Wenn das passiert, wird die Notification-Architektur sofort nutzbar.

---

## 3. Resources + Subscriptions Pattern

```typescript
// Theoretische Implementierung
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer(
  { name: "ms-mcp", version: "1.0.0" },
  { capabilities: { resources: { subscribe: true, listChanged: true } } }
);

// 1. Resource definieren
server.resource(
  "new-notifications",
  "notification://inbox/new",
  { description: "Unread notifications", mimeType: "application/json" },
  async () => ({
    contents: [{
      uri: "notification://inbox/new",
      mimeType: "application/json",
      text: JSON.stringify(await getUnreadNotifications())
    }]
  })
);

// 2. Background-Polling, sendet Update-Notification
setInterval(async () => {
  const hasNew = await checkForNewNotifications();
  if (hasNew) {
    // Server sendet notifications/resources/updated
    await server.server.sendResourceUpdated({ uri: "notification://inbox/new" });
  }
}, 30000);
```

**Funktioniert das?**

NEIN -- nicht mit Claude Code als Client. Claude Code unterstuetzt `resources/subscribe` nicht. Selbst wenn der Server `sendResourceUpdated` sendet, reagiert Claude Code nicht darauf.

Was FUNKTIONIERT: `sendResourceListChanged()`. Wenn man dynamisch eine neue Resource hinzufuegt (z.B. `notification://inbox/2024-02-14T10:30`), wuerde Claude Code die Resource-Liste aktualisieren. Der User sieht sie dann in der `@`-Mention-Autocomplete. Das ist aber kein proaktives Verhalten.

---

## 4. Zusammenfassung: Was funktioniert TATSAECHLICH mit Claude Code?

| Feature | MCP Spec | SDK Support | Claude Code Support |
|---------|----------|-------------|---------------------|
| `sendResourceUpdated` | Ja | Ja | **NEIN** |
| `sendResourceListChanged` | Ja | Ja | **JA** |
| `sendToolListChanged` | Ja | Ja | **JA** |
| `sendPromptListChanged` | Ja | Ja | **JA** |
| `sendLoggingMessage` | Ja | Ja | **JA** (nur Logs) |
| `createMessage` (Sampling) | Ja | Ja | **NEIN** |
| `elicitInput` | Ja | Ja | **Unklar** |

**Kernproblem:** Claude Code ist ein CLI-Tool. Es hat keinen persistenten Event-Loop der auf Server-Notifications wartet und darauf reagiert. Claude Code fuehrt Tool-Calls aus wenn der User eine Frage stellt, nicht proaktiv.

---

# Implementierungsoptionen - Praktischer Vergleich

## Option 1: Passive Tool Polling (Baseline)

**Wie es funktioniert:**
1. User: "Check my notifications every time I ask something"
2. Claude ruft `list_emails` mit `is_read: false` auf
3. Bei neuen Mails: Claude zeigt sie an

**Variante mit MCP Prompt:**
```typescript
server.prompt(
  "check-notifications",
  "Check for new emails and calendar events",
  async () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: "Pruefe meine Inbox auf neue E-Mails (ungelesen) und kommende Termine (naechste 2h). Fasse kurz zusammen."
      }
    }]
  })
);
```
Der User tippt `/check-notifications` oder `@check-notifications` in Claude Code.

**Pros:**
- Funktioniert 100% mit aktuellem Claude Code
- Kein zusaetzlicher Code noetig (Tools existieren bereits)
- Kein Background-Service noetig

**Cons:**
- User muss aktiv fragen
- Nicht proaktiv

**Implementation Effort:** 1-2h (nur Prompt definieren)

---

## Option 2: Dynamic Resource Signal (Workaround)

**Wie es funktioniert:**
1. Background-Service pollt Graph API auf neue Emails (Delta Query oder Polling)
2. Bei neuen Mails: Server fuegt dynamisch eine Resource hinzu
3. `sendResourceListChanged()` wird gesendet
4. Claude Code aktualisiert seine Resource-Liste
5. User sieht neue Resource in `@`-Autocomplete: `@new-mail-from-ulla (3 unread)`

**Implementierung:**
```typescript
// Background-Check alle 60s
let notificationResource: RegisteredResource | null = null;

setInterval(async () => {
  const unreadCount = await getUnreadCount();

  if (unreadCount > 0 && !notificationResource) {
    // Dynamisch Resource erstellen
    notificationResource = server.resource(
      `inbox-alert-${unreadCount}-unread`,
      `notification://inbox/unread`,
      {
        description: `${unreadCount} ungelesene E-Mails`,
        mimeType: "application/json"
      },
      async () => ({
        contents: [{
          uri: "notification://inbox/unread",
          mimeType: "application/json",
          text: JSON.stringify(await getUnreadSummary())
        }]
      })
    );
    // Claude Code aktualisiert Resource-Liste
    server.sendResourceListChanged();
  } else if (unreadCount === 0 && notificationResource) {
    notificationResource.remove();
    notificationResource = null;
    server.sendResourceListChanged();
  }
}, 60000);
```

**Pros:**
- Nutzt funktionierendes MCP-Feature (`listChanged`)
- User sieht visuellen Hinweis in Autocomplete

**Cons:**
- User muss immer noch aktiv `@` tippen
- Kein echtes Push -- eher ein "Badge"
- Fragile Architektur (Resource-Churning)
- Claude Code zeigt keinen Badge/Counter fuer neue Resources

**Implementation Effort:** 8-12h
**Empfehlung:** Nicht empfohlen. Zu viel Aufwand fuer zu wenig Mehrwert gegenueber Option 1.

---

## Option 3: Sampling-Ready Architecture (Zukunftssicher)

**Wie es funktioniert (wenn Claude Code Sampling unterstuetzt):**
1. Background-Service pollt Graph API
2. Bei neuen Events: `server.server.createMessage()` aufrufen
3. Claude integriert die Nachricht in den Conversation-Flow
4. User sieht: "Du hast 3 neue E-Mails. Soll ich sie zusammenfassen?"

**Implementierung (vorbereitet, aktivierbar wenn Sampling kommt):**
```typescript
async function pushNotification(server: Server, summary: string) {
  const clientCaps = server.getClientCapabilities();
  if (clientCaps?.sampling) {
    // Sampling verfuegbar -- proaktiv pushen
    await server.createMessage({
      messages: [{
        role: "user",
        content: { type: "text", text: summary }
      }],
      maxTokens: 500
    });
  } else {
    // Fallback: nur loggen (fuer zukuenftige Clients)
    await server.sendLoggingMessage({
      level: "info",
      data: summary,
      logger: "notification-service"
    });
  }
}
```

**Pros:**
- Zukunftssicher
- Wenn Sampling kommt: sofort einsatzbereit
- Sauberer Fallback

**Cons:**
- Funktioniert HEUTE nicht proaktiv mit Claude Code
- Sampling-Timeline unbekannt

**Implementation Effort:** 4-6h (inkl. Fallback-Logic)

---

## Option 4: External Notification + Tool (Pragmatisch)

**Wie es funktioniert:**
1. Background-Service laeuft separat (nicht im MCP-Server)
2. Pollt Graph API alle 60s auf neue Mails/Events
3. Bei neuen Events: Schreibt in eine lokale Datei / SQLite DB
4. MCP-Tool `get_pending_notifications` liest diese Datei
5. User fragt Claude, Claude ruft das Tool auf

**Variante mit Desktop-Notification:**
1. Background-Service sendet zusaetzlich `notify-send` (Linux) / Terminal Bell
2. User sieht Desktop-Notification: "3 neue E-Mails"
3. User wechselt zu Claude Code und fragt: "Was sind die neuen Mails?"

```bash
# Linux Desktop Notification
notify-send "MS-MCP" "3 neue E-Mails von Ulla Vogel, Max Mustermann"

# Terminal Bell (funktioniert in VS Code Terminal)
echo -e '\a'

# tmux Notification
tmux display-message "3 neue E-Mails"
```

**Pros:**
- Echte proaktive Benachrichtigung (Desktop-Level)
- MCP-Server bleibt sauber und stateless
- Background-Service kann unabhaengig laufen
- Funktioniert HEUTE

**Cons:**
- Zwei separate Prozesse
- Desktop-Notification ist nicht in Claude integriert
- User muss manuell zu Claude wechseln

**Implementation Effort:** 6-10h

---

## Empfohlener Ansatz fuer MS-MCP

### Entscheidung: Option 1 (sofort) + Option 3 (vorbereitet) + Option 4 (optional)

### Architektur

```
                    +------------------+
                    | Microsoft Graph  |
                    |      API         |
                    +--------+---------+
                             |
                    Delta Query / Polling
                             |
              +--------------v--------------+
              |    Background Poller        |
              |  (runs inside MCP server)   |
              |                             |
              |  - Checks every 60s         |
              |  - Stores state in memory   |
              |  - Tries sampling first     |
              |  - Falls back to logging    |
              +-------------+---------------+
                            |
                 +----------v----------+
                 |    MCP Server       |
                 |                     |
                 | Tools:              |
                 |  - list_emails      |
                 |  - get_notifications|  <-- NEW: reads cached state
                 |                     |
                 | Prompts:            |
                 |  - check-inbox      |  <-- NEW: convenience prompt
                 |                     |
                 | Resources:          |
                 |  - notification://  |  <-- NEW: notification state
                 +----------+----------+
                            |
                     stdio (JSON-RPC)
                            |
                 +----------v----------+
                 |    Claude Code      |
                 |                     |
                 | User: "Neue Mails?" |
                 | -> calls tool       |
                 | -> shows results    |
                 +---------------------+
```

### Implementierungsplan

1. **Phase 1 (sofort, 2h):** `check-inbox` Prompt + `get_pending_notifications` Tool
2. **Phase 2 (4h):** Background Delta-Query Poller im MCP-Server
3. **Phase 3 (2h):** Sampling-Ready Wrapper mit Capability-Check
4. **Phase 4 (optional, 4h):** Desktop-Notification via `notify-send`

### Wann Sampling kommt

Die MCP-Spec definiert Sampling seit v1.0. Claude Desktop und Claude Code muessen es nur aktivieren. Erwartet: 2025-2026. Wenn es kommt, wird Phase 3 automatisch aktiv -- der Capability-Check erkennt es und beginnt proaktiv zu pushen.

---

## Quellen

- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp)
- MCP TypeScript SDK v1.26.0 (`@modelcontextprotocol/sdk`)
- Server class: `node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.d.ts`
- McpServer class: `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts`
