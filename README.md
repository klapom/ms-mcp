# pommer-m365-mcp

Office 365 MCP-Server für Claude Desktop -- Direkter Zugriff auf Microsoft 365 via natürliche Sprache.

## Was ist das?

Ein MCP-Server (Model Context Protocol), der die Microsoft Graph API über domänenspezifische Tools für Claude zugänglich macht. Kein Browser-Wechsel, kein Copy&Paste -- E-Mails lesen, suchen, Ordner browsen direkt im Chat. Der Server läuft lokal als Prozess und wird von Claude Desktop oder Claude Code gestartet.

## Features

### Verfügbar (Phase 2.1)

- **list_emails** -- E-Mails auflisten mit Filter, Suche und Pagination
- **read_email** -- E-Mail lesen mit HTML-zu-Text-Konvertierung
- **list_mail_folders** -- Mail-Ordner auflisten mit Unread-Counts
- **search_emails** -- Volltextsuche via KQL (Keyword Query Language)

### Geplant

- send_email, reply_email, forward_email (Phase 2.2)
- move_email, Anhänge (Phase 2.3)
- Kalender CRUD (Phase 3)
- OneDrive browse/download/upload (Phase 4)

## Anwendungsbeispiele

### Inbox Triage (UC-01)

> "Fasse meine ungelesenen E-Mails der letzten 24 Stunden zusammen. Kategorisiere nach: dringend, informativ, delegierbar."

Claude nutzt `list_emails` mit Filter `isRead eq false` und `read_email` um jede Mail zu lesen und eine strukturierte Zusammenfassung zu erstellen.

### Schnelle Suche

> "Suche alle E-Mails von mueller@heidenhain.de zum Thema Angebot"

Claude nutzt `search_emails` mit KQL: `from:mueller@heidenhain.de subject:Angebot`

### Ordner-Übersicht

> "Welche Mail-Ordner habe ich und wie viele ungelesene Mails sind darin?"

Claude nutzt `list_mail_folders` mit `include_children=true` und zeigt eine tabellarische Übersicht.

Weitere Use Cases: [docs/USE-CASES.md](docs/USE-CASES.md)

## Schnellstart

Detaillierte Schritt-für-Schritt-Anleitung: **[docs/SETUP.md](docs/SETUP.md)**

```bash
git clone https://github.com/klapom/ms-mcp.git
cd ms-mcp
pnpm install
pnpm build
```

## Technologie

| Komponente | Technologie |
|---|---|
| Runtime | Node.js 22+, TypeScript 5.x (strict) |
| MCP SDK | @modelcontextprotocol/sdk |
| Graph Client | @microsoft/microsoft-graph-client |
| Auth | MSAL Device Code Flow |
| Validation | Zod (Single Source of Truth) |
| Tests | Vitest + MSW (219 Tests) |

## Datenschutz

- **Zustandsloser Proxy** -- keine persistente Datenspeicherung
- **DSGVO-konform:** Kein Logging von E-Mail-Inhalten, Betreffzeilen, Empfängern
- **Nur Metadaten:** Tool-Name, HTTP-Status, Latenz, Request-ID
- **Token-Sicherheit:** Auth-Token im Arbeitsspeicher (OS Keychain geplant)
- **Context-Budget:** `$select` und `maxBodyLength` minimieren übertragene Daten

Siehe [docs/DATA-PRIVACY.md](docs/DATA-PRIVACY.md) für Details.

## Lizenz

UNLICENSED -- Pommer IT-Consulting GmbH
