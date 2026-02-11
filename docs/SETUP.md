# Setup Guide

## Voraussetzungen

- Node.js 22+
- pnpm
- Microsoft 365 Account (Business oder Developer)
- Azure AD App Registration Berechtigung
- Claude Desktop oder Claude Code

## Schnellstart

```bash
# 1. Repository klonen
git clone https://github.com/pommer-it/pommer-m365-mcp.git
cd pommer-m365-mcp

# 2. Dependencies installieren
pnpm install

# 3. Konfiguration
cp .env.example .env
# .env editieren: AZURE_TENANT_ID und AZURE_CLIENT_ID eintragen

# 4. Setup Wizard (optional)
pnpm run setup

# 5. Claude Desktop konfigurieren
# In claude_desktop_config.json:
{
  "mcpServers": {
    "m365": {
      "command": "node",
      "args": ["/pfad/zu/pommer-m365-mcp/dist/index.js"]
    }
  }
}
```

## Azure App Registration

Siehe Project_Description.md Abschnitt 6 für detaillierte Anleitung.
