# Setup Guide

## Voraussetzungen

- **Node.js 22+** -- `node --version` prüfen
- **pnpm** -- `npm install -g pnpm` falls nicht vorhanden
- **Microsoft 365 Account** -- Business oder [Developer Program](https://developer.microsoft.com/en-us/microsoft-365/dev-program) (kostenlos, 90 Tage)
- **Claude Desktop** oder **Claude Code**
- **Azure-Berechtigung** -- App Registration erstellen können (Global Admin oder Application Administrator Rolle)

## Schritt 1: Azure App Registration

1. Öffne das [Azure Portal](https://portal.azure.com) --> **Microsoft Entra ID** --> **App-Registrierungen** --> **Neue Registrierung**
2. Name: `pommer-m365-mcp` (oder beliebig)
3. Unterstützte Kontotypen: **Nur Konten in diesem Organisationsverzeichnis** (Single Tenant)
4. Umleitungs-URI: **Leer lassen** (Device Code Flow braucht keine Redirect URI)
5. Klick auf **Registrieren**
6. Notiere die **Anwendungs-ID (Client-ID)** und die **Verzeichnis-ID (Tenant-ID)** von der Übersichtsseite

### API-Berechtigungen konfigurieren

1. Im App-Menü: **API-Berechtigungen** --> **Berechtigung hinzufügen**
2. **Microsoft Graph** --> **Delegierte Berechtigungen**
3. Folgende Berechtigungen hinzufügen:
   - `User.Read` -- Eigenes Profil lesen
   - `Mail.ReadWrite` -- E-Mails lesen und verwalten
   - `Mail.Send` -- E-Mails senden (für Phase 2.2)
4. Klick auf **Administratorzustimmung für [Tenant] erteilen** (grüner Button)
5. Bestätigen -- alle Berechtigungen sollten grüne Häkchen zeigen

### Öffentlichen Client-Flow aktivieren

1. Im App-Menü: **Authentifizierung**
2. Ganz unten: **Erweiterte Einstellungen** --> **Öffentliche Clientflows zulassen** --> **Ja**
3. **Speichern**

> **Warum Device Code Flow?** Der MCP-Server läuft als lokaler Prozess ohne Browser. Device Code Flow ermöglicht die Authentifizierung über einen separaten Browser-Tab, während der Server im Hintergrund wartet.

## Schritt 2: Repository klonen und bauen

```bash
git clone https://github.com/klapom/ms-mcp.git
cd ms-mcp
pnpm install
pnpm build
```

Prüfe, dass der Build erfolgreich ist:

```bash
ls dist/index.js
```

## Schritt 3: Umgebungsvariablen konfigurieren

Erstelle eine `.env` Datei im Projektroot:

```bash
# Azure App Registration
AZURE_TENANT_ID=deine-tenant-id-hier
AZURE_CLIENT_ID=deine-client-id-hier

# Optional: Logging (default: info)
LOG_LEVEL=info

# Optional: Limits anpassen
# MAX_ITEMS=25         # Max Ergebnisse pro Abfrage (list_emails, search_emails)
# MAX_BODY_LENGTH=500  # Max Body-Länge für list_emails (read_email nutzt eigenen Default: 5000)
```

> **Hinweis:** Die Datei `.env` ist in `.gitignore` und wird nicht committed.

## Schritt 4: Authentifizierung (einmalig)

Authentifiziere dich **einmalig** im Terminal via CLI. Dies ist notwendig, weil der MCP-Server als Subprocess von Claude Code/Desktop läuft und dort keine interaktive Anmeldung möglich ist.

```bash
pnpm auth login
```

Der Befehl startet den Device Code Flow:

1. Im Terminal erscheint ein Link und ein Code
2. Öffne den Link im Browser
3. Gib den Code ein
4. Melde dich mit deinem Microsoft 365 Konto an
5. Bestätige die Berechtigungen

Nach erfolgreicher Anmeldung zeigt das CLI den angemeldeten Benutzer an. Der Token wird persistent gespeichert (Standard: `~/.ms-mcp/token-cache.json`).

### Weitere Auth-Befehle

```bash
pnpm auth status   # Auth-Status prüfen (wer ist eingeloggt?)
pnpm auth logout   # Token löschen und abmelden
```

> **Wichtig:** Die Authentifizierung ist einmalig. Der Refresh-Token wird automatisch erneuert. Nur bei explizitem Logout oder Token-Ablauf (90 Tage Inaktivität) ist eine erneute Anmeldung nötig.

> **Fail-Fast:** Der MCP-Server prüft beim Start, ob ein gültiger Token vorhanden ist. Falls nicht, beendet er sich sofort mit einer klaren Fehlermeldung und Anleitung zum `auth login`.

> **Cache-Pfad ändern:** Setze die Umgebungsvariable `TOKEN_CACHE_PATH` auf einen alternativen Pfad (absolut oder mit `~/` Prefix).

## Schritt 5: Claude Desktop konfigurieren

### Variante A: Claude Desktop

Öffne die Claude Desktop Konfiguration:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Füge den MCP-Server hinzu:

```json
{
  "mcpServers": {
    "m365": {
      "command": "node",
      "args": ["/absoluter/pfad/zu/ms-mcp/dist/index.js"],
      "env": {
        "AZURE_TENANT_ID": "deine-tenant-id",
        "AZURE_CLIENT_ID": "deine-client-id"
      }
    }
  }
}
```

> **Wichtig:** Verwende den **absoluten Pfad** zu `dist/index.js`. Relative Pfade funktionieren nicht zuverlässig.

Starte Claude Desktop neu. Der Server sollte in der Tool-Liste erscheinen (Hammer-Symbol unten links).

### Variante B: Claude Code

In Claude Code kannst du den Server über die MCP-Konfiguration einbinden. Alternativ starte den Server direkt:

```bash
cd /pfad/zu/ms-mcp
AZURE_TENANT_ID=xxx AZURE_CLIENT_ID=yyy pnpm dev
```

## Schritt 6: UC-01 ausprobieren -- Inbox Triage

Nachdem der Server verbunden ist, probiere diesen Prompt in Claude:

> Fasse meine ungelesenen E-Mails zusammen. Kategorisiere nach: dringend, informativ, delegierbar.

Claude wird:
1. `list_emails` aufrufen mit Filter `isRead eq false`
2. Für jede relevante Mail `read_email` aufrufen
3. Eine strukturierte Zusammenfassung erstellen

### Weitere Beispiel-Prompts

```
"Zeige mir alle E-Mails von max.mustermann@example.com der letzten Woche"

"Suche nach E-Mails zum Thema 'Angebot' mit Anhang"

"Welche Mail-Ordner habe ich und wie viele ungelesene Mails sind darin?"

"Lies die neueste E-Mail von der IT-Abteilung und fasse sie zusammen"
```

## Fehlerbehebung

### "AZURE_TENANT_ID is required"

`.env` Datei nicht gefunden oder Variablen nicht gesetzt. Prüfe den Pfad und die Variablennamen. Falls du die env-Variablen in der `claude_desktop_config.json` konfigurierst, stelle sicher, dass sie im `env`-Block stehen.

### "Access token has expired"

Token abgelaufen. In der Regel reicht ein Server-Neustart -- der persistente Cache enthält den Refresh-Token, der automatisch ein neues Access-Token holt. Falls das nicht hilft: `pnpm auth logout` und dann `pnpm auth login`.

### "ErrorAccessDenied" / "Insufficient privileges"

API-Berechtigungen in Azure nicht erteilt oder Admin-Consent fehlt. Prüfe Schritt 1 -- insbesondere den Punkt "Administratorzustimmung erteilen".

### "ECONNREFUSED"

Netzwerkproblem. Prüfe Internetverbindung und Firewall-Einstellungen. Der Server benötigt Zugang zu `graph.microsoft.com` und `login.microsoftonline.com`.

### Claude Desktop zeigt keine Tools

Pfad in `claude_desktop_config.json` prüfen. Muss absoluter Pfad zu `dist/index.js` sein. Nach Änderung Claude Desktop komplett neu starten (nicht nur das Fenster schließen).

### "AADSTS700016: Application not found"

Die Client-ID stimmt nicht mit der App Registration überein. Prüfe `AZURE_CLIENT_ID` und vergleiche mit der Übersichtsseite im Azure Portal.

### "AADSTS7000218: Request body must contain client_assertion or client_secret"

Der öffentliche Client-Flow ist nicht aktiviert. Prüfe Schritt 1 unter "Öffentlichen Client-Flow aktivieren".

## Konfigurationsreferenz

| Variable | Pflicht | Default | Beschreibung |
|---|---|---|---|
| `AZURE_TENANT_ID` | Ja | -- | Azure AD Tenant-ID |
| `AZURE_CLIENT_ID` | Ja | -- | App Registration Client-ID |
| `AZURE_CLIENT_SECRET` | Nein | -- | Für Client Credentials Flow (CI/CD) |
| `TOKEN_CACHE_PATH` | Nein | `~/.ms-mcp/token-cache.json` | Pfad zur persistenten Token-Cache-Datei |
| `LOG_LEVEL` | Nein | `info` | trace, debug, info, warn, error, fatal |
| `TOOL_PRESET` | Nein | `mvp` | readonly, mvp, full |
| `MAX_ITEMS` | Nein | `25` | Max Ergebnisse pro Abfrage |
| `MAX_BODY_LENGTH` | Nein | `500` | Max Body-Länge in list_emails (read_email: 5000) |

## Verfügbare Tools

| Tool | Beschreibung |
|---|---|
| `list_emails` | E-Mails auflisten mit Filter, Suche, Pagination |
| `read_email` | Einzelne E-Mail lesen (HTML-zu-Text, Metadaten) |
| `list_mail_folders` | Mail-Ordner auflisten (Counts, Subfolders) |
| `search_emails` | Volltextsuche via KQL |
