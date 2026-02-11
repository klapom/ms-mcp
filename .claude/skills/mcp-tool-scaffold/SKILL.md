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
