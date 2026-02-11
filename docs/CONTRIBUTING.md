# Contributing

## Setup

1. Node.js 22+ installieren
2. `pnpm install`
3. `.env` aus `.env.example` erstellen und konfigurieren
4. `pnpm run dev` – MCP-Server starten

## Entwicklung

- `pnpm run test` – Tests ausführen
- `pnpm run lint` – Code prüfen
- `pnpm run typecheck` – TypeScript prüfen

## Neues Tool erstellen

Nutze den Slash Command `/new-tool <tool-name>` in Claude Code.

Manuell:
1. Zod-Schema in `src/schemas/<modul>.ts`
2. Handler in `src/tools/<modul>.ts`
3. Registration in `src/index.ts`
4. Tests in `tests/<modul>.test.ts`
5. Docs in `docs/TOOLS.md` und `docs/PERMISSIONS.md`

## Commit-Konventionen

Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`
