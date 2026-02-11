# Architektur

## Überblick

pommer-m365-mcp ist ein lokaler MCP-Server der Microsoft Graph API über
domänenspezifische Tools für Claude Desktop / Cowork zugänglich macht.

## Datenfluss

```
Claude Desktop/Cowork ←→ stdio ←→ pommer-m365-mcp ←→ HTTPS ←→ Microsoft Graph API
```

## Schichten

1. **MCP Layer** (`src/index.ts`): Tool-Registration, Transport (stdio/HTTP)
2. **Tool Layer** (`src/tools/`): Domänenspezifische Handlers
3. **Schema Layer** (`src/schemas/`): Zod-basierte Input-Validierung
4. **Middleware Layer** (`src/middleware/`): Logging, Retry, Error-Mapping
5. **Auth Layer** (`src/auth/`): MSAL-basierte Authentifizierung
6. **Utils Layer** (`src/utils/`): Cross-Cutting Concerns

## Cross-Cutting Patterns

Siehe Project_Description.md Abschnitt 4.2 für Details zu:
- Context-Budget-Management (4.2.1)
- Destructive Operations Safety (4.2.2)
- Multi-Tenant-Vorbereitung (4.2.3)
- Token-Sicherheit (4.2.4)
- Observability (4.2.5)
- Idempotenz (4.2.6)
- Graceful Degradation (4.2.7)
