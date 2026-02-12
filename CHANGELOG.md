# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [Unreleased]

### Hinzugefügt
- UC-01 Hardening: Review Findings behoben, Dokumentation erstellt
- Integration-Test für UC-01 Workflow

---

## [0.3.0] -- 2026-02-11

### Hinzugefügt
- **read_email** Tool -- E-Mail lesen mit HTML-zu-Text-Konvertierung (html-to-text)
- **list_mail_folders** Tool -- Mail-Ordner auflisten mit Counts und Subfolders
- **search_emails** Tool -- Volltextsuche via KQL (Keyword Query Language)
- Sprint-Dokumentation (docs/sprints/SPRINT_2_1.md, 2_2.md, 2_3.md)
- html-to-text Dependency für E-Mail-Body-Konvertierung
- 50 neue Tests (219 total)

### Geändert
- Review Debt aus Phase 1 abgebaut (JSDoc, Error-Tests, DI-Factory)
- `DEFAULT_SELECT` um mailDetail und mailFolder erweitert

---

## [0.2.0] -- 2026-02-11

### Hinzugefügt
- GraphClientDeps DI Interface (statt direkter MsalClient-Abhängigkeit)
- clearClientCache() für Test-Isolation
- isRecordObject Type Guard (src/utils/type-guards.ts)
- LimitsConfig Type Export
- 82 weitere Tests (164 total)

### Geändert
- parseRetryAfterMs gibt `number | undefined` zurück
- ShapeOptions: maxItems und maxBodyLength sind jetzt Pflichtfelder
- isGraphErrorBody lehnt nicht-Objekt error-Felder ab
- Retry-Middleware: Doppeltes Header-Lesen behoben

---

## [0.1.0] -- 2026-02-10

### Hinzugefügt
- **list_emails** Tool -- E-Mails auflisten mit Filter, Suche, Pagination
- MSAL Device Code Flow (3-stufig: silent, cache, device code)
- Error-Hierarchie: 8 typisierte Fehlerklassen mit deutschen Meldungen
- Middleware-Chain: Logging, Retry, ErrorMapping, Auth, HTTP
- Cross-Cutting Utils: response-shaper, confirmation, idempotency, rate-limit, pagination
- Graph-Client mit Middleware und Caching
- @vitest/coverage-v8 mit Coverage-Thresholds (60/50/60/60)
- husky + lint-staged Pre-Commit Hooks
- 82 Tests (3 Testdateien)

---

## [0.0.1] -- 2026-02-09

### Hinzugefügt
- Phase 0: Projekt-Scaffold mit allen Infrastruktur-Patterns
- TypeScript strict mode, Biome, Vitest + MSW Setup
- MCP SDK Integration mit stdio Transport
- Zod-basierte Schemas (BaseParams, WriteParams, ListParams)
- Pino Logger mit PII-Redaktion
- Docs: ARCHITECTURE.md, SETUP.md (Stub), DATA-PRIVACY.md (Stub)
- CI/CD: lint, typecheck, test Scripts
