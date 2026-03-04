# DGX Spark Development Workflow

> Fuer MS-MCP Notification-Service Entwicklung auf DGX Spark (192.168.178.10)

## One-Time Setup

### 1. Prerequisites pruefen

```bash
# Auf DGX Spark (via VS Code Remote SSH)
node --version      # >= 22.x
pnpm --version      # >= 9.x
docker --version    # Docker fuer optionale Infrastruktur
```

### 2. VS Code Remote SSH

```jsonc
// ~/.ssh/config (lokal)
Host dgx
  HostName 192.168.178.10
  User admin
  ForwardAgent yes
```

VS Code: `Remote-SSH: Connect to Host...` -> `dgx`

### 3. Projekt ist bereits eingerichtet

```bash
cd /home/admin/projects/ms-mcp
pnpm install   # Falls noetig
pnpm build     # Verify build works
pnpm test      # Verify tests pass
```

### 4. VS Code Workspace Settings

```jsonc
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.exclude": {
    "node_modules": true,
    "dist": true
  }
}
```

### 5. VS Code Tasks

```jsonc
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Dev Server",
      "type": "shell",
      "command": "pnpm dev",
      "isBackground": true,
      "problemMatcher": []
    },
    {
      "label": "Build",
      "type": "shell",
      "command": "pnpm build",
      "group": "build"
    },
    {
      "label": "Test",
      "type": "shell",
      "command": "pnpm test",
      "group": "test"
    },
    {
      "label": "Typecheck",
      "type": "shell",
      "command": "pnpm typecheck"
    }
  ]
}
```

### 6. VS Code Launch Config (Debugger)

```jsonc
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug MCP Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "env": {
        "LOG_LEVEL": "debug"
      }
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["test", "--", "--reporter=verbose"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    }
  ]
}
```

---

## Daily Development Workflow

### Morning Startup

```bash
# Terminal 1: MCP Dev Server (Hot Reload)
cd /home/admin/projects/ms-mcp
pnpm dev

# Terminal 2: Watch Tests
pnpm test -- --watch

# Terminal 3: Claude Code
claude
```

### Development Cycle

1. Code aendern in VS Code
2. `pnpm dev` rebuildet automatisch (Hot Reload via tsup/tsx)
3. Tests laufen im Watch-Mode automatisch
4. In Claude Code: `/mcp` um MCP-Server neu zu verbinden (nach Schema-Aenderungen)
5. Testen: Direkt in Claude Code Fragen stellen

### Quality Gates vor Commit

```bash
pnpm typecheck    # TypeScript strict
pnpm lint         # Biome
pnpm test         # Vitest
pnpm build        # Production Build
```

---

## Notification-Service Entwicklung

### Ohne Docker (einfachster Ansatz)

Der Notification-Service laeuft als Teil des MCP-Servers. Kein Docker noetig.

```bash
# 1. Auth sicherstellen
pnpm auth status
# Falls noetig:
pnpm auth login

# 2. Dev Server starten
pnpm dev

# 3. In Claude Code testen
# "Check my inbox for new emails"
# "What are my upcoming events?"
```

### Mit Graph API Delta Queries testen

```bash
# Delta Query manuell testen (erfordert Auth Token)
# In einem Test-Script:
node --import tsx/esm -e "
  import { getGraphClient } from './src/auth/graph-client.js';
  // ... Delta Query ausfuehren
"
```

### E2E Test gegen M365 Tenant

```bash
# Mit lizenziertem User (nicht Admin!)
rm ~/.ms-mcp/token-cache.json
pnpm auth login
# -> Login als ulla.vogel@pommerconsulting.de

# Dann E2E Tests
pnpm test:e2e
```

---

## Debugging

### MCP Server Debugging

```bash
# Verbose Logging
LOG_LEVEL=debug pnpm dev

# MCP Inspector (wenn verfuegbar)
npx @modelcontextprotocol/inspector stdio -- node dist/index.js
```

### Claude Code MCP Status

```bash
# In Claude Code:
/mcp           # Zeigt alle verbundenen MCP Server
# Reconnect nach Aenderungen:
/mcp           # Dann Server auswaehlen und reconnecten
```

### Haeufige Probleme

| Problem | Loesung |
|---------|---------|
| "MailboxNotEnabledForRESTAPI" | Admin-Account hat keine Exchange-Lizenz. Mit `ulla.vogel@` einloggen |
| MCP Server antwortet nicht | `pnpm build` ausfuehren, `/mcp` reconnect in Claude Code |
| Token abgelaufen | `pnpm auth login` erneut ausfuehren |
| Device Code Flow haengt | Muss in separatem Terminal laufen (stderr), nicht via Claude Code |

---

## Optionale Infrastruktur (spaeter)

### Wenn Webhook-Receiver gebraucht wird

```yaml
# docker-compose.yml (nur fuer echte Graph Webhooks)
version: "3.8"
services:
  webhook-receiver:
    build: ./webhook-receiver
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=sqlite:///data/webhooks.db
    volumes:
      - webhook-data:/data

  tunnel:
    image: cloudflare/cloudflared
    command: tunnel --no-autoupdate --url http://webhook-receiver:3000
    depends_on:
      - webhook-receiver

volumes:
  webhook-data:
```

```bash
# Starten
docker-compose up -d

# Logs
docker-compose logs -f webhook-receiver

# Tunnel-URL ablesen
docker-compose logs tunnel | grep "https://"
```

### Wann Webhooks statt Polling?

- **Polling (jetzt):** Einfach, kein Tunnel noetig, funktioniert hinter NAT
- **Webhooks (spaeter):** Echtzeit, weniger API-Calls, braucht oeffentliche URL

Fuer die initiale Implementierung ist Polling via Delta Query die bessere Wahl. Webhooks koennen spaeter als Optimierung hinzugefuegt werden.
