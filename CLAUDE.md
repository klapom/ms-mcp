# MS-MCP – Office 365 MCP Server

## Allgemein
Annahmen MÜSSEN IMMER verifiziert sein. Handle nur wenn du dir sicher bist

## Projekt
Office 365 MCP-Server für Claude Desktop / Cowork.
Eigenentwicklung von Pommer IT-Consulting GmbH.
Direkter Zugriff auf Microsoft Graph API mit domänenspezifischen Tools.

## Tech Stack
- Runtime: Node.js 22+, TypeScript 5.x (strict mode), ESM
- MCP SDK: @modelcontextprotocol/sdk
- Graph Client: @microsoft/microsoft-graph-client
- Auth: @azure/msal-node
- Validation: Zod (Single Source of Truth → JSON Schema + Types + Runtime)
- Test: Vitest + MSW (Mock Service Worker)
- Lint/Format: Biome
- Build: tsup
- Logging: pino (structured JSON)
- Package Manager: pnpm

## Konventionen

### Code-Stil
- Biome für Linting + Formatting (kein Prettier, kein ESLint)
- Strict TypeScript: kein `any`, keine Non-Null-Assertions
- Alle Imports mit expliziten Dateierweiterungen (.js für ESM)
- Zod-Schemas als Single Source of Truth für Input-Validierung

### MCP-Tool-Pattern
Jedes Tool folgt diesem Pattern:
1. Zod-Schema in `src/schemas/<modul>.ts` (extends BaseParams)
2. Handler in `src/tools/<modul>.ts`
3. Registration in `src/index.ts` via `server.tool()`
4. Tests in `tests/<modul>.test.ts` mit MSW-Mocks

### Cross-Cutting Concerns (MÜSSEN bei jedem Tool beachtet werden)
- **Context-Budget:** Immer `$select` setzen, Response mit maxItems/maxBodyLength begrenzen
- **Destructive Safety:** Schreibende Tools brauchen `confirm`-Parameter
- **Idempotenz:** Schreibende Tools brauchen `idempotency_key`-Parameter
- **Observability:** Jeder Graph-Call via pino loggen (KEINE Inhalte/PII/Tokens!)
- **Error-Mapping:** Graph HTTP-Status → benutzerfreundliche MCP-Errors
- **Multi-Tenant:** Optionaler `user_id`-Parameter auf allen Tools

### Commit-Messages
Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`
Sprache: Englisch

### Testen
- Unit-Tests: Vitest + MSW, bei jedem Push
- E2E-Tests: M365 Developer Tenant, Nightly
- Jedes Tool braucht: Happy Path, Error Cases, Pagination, Validation

### Befehle
```bash
pnpm dev             # Dev-Server mit Hot-Reload
pnpm build           # Production Build
pnpm test            # Unit-Tests
pnpm test:e2e        # E2E-Tests gegen M365 Tenant
pnpm lint            # Biome Check
pnpm lint:fix        # Biome Auto-Fix
pnpm typecheck       # TypeScript Prüfung
```

### Library-Docs
Nutze immer Context7 MCP für Library-Dokumentation zu:
@modelcontextprotocol/sdk, @microsoft/microsoft-graph-client,
@azure/msal-node, zod, vitest, msw, biome.

### Datenschutz (DSGVO)
- NIEMALS E-Mail-Bodys, Betreffzeilen, Empfänger, Datei-Inhalte loggen
- NIEMALS Token-Werte oder Authorization-Header loggen
- Nur Metadaten loggen: Tool-Name, HTTP-Status, Latenz, Request-ID
- Keine persistente Speicherung von Benutzer-Inhalten
