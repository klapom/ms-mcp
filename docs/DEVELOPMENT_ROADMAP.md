# MS-MCP Development Roadmap -- Production + Webhooks

**Date:** 2026-02-14
**Version:** 0.0.1 -> 1.0.0
**Duration:** 12 Wochen (6 Sprints a 2 Wochen)
**Effort:** ~200-250 Entwicklerstunden

---

## Vision

MS-MCP wird von einem funktionalen lokalen CLI-Tool zu einem production-ready MCP-Server mit Webhook-Integration erweitert. Nach 12 Wochen kann Claude Code/Desktop in Echtzeit auf Microsoft 365 Events reagieren (neue Emails, Kalendereinladungen, Teams-Nachrichten), der Server ist sicher, resilient und ueberwacht, und die Infrastruktur laeuft sowohl lokal (DGX Spark) als auch in Azure.

---

## Milestones

| Milestone | Ziel | Woche |
|---|---|---|
| **M1** | Production-Ready MCP Server (P0+P1 resolved, CI/CD) | 4 |
| **M2** | Webhook Infrastructure MVP (DGX Spark, Notifications abrufbar) | 6 |
| **M3** | Claude Integration (MCP Tools fuer Notifications, Azure Option) | 8 |
| **M4** | Production Launch v1.0.0 (alle Issues resolved, Observability, E2E) | 12 |

---

## Sprint Breakdown

### Sprint 1 (Week 1-2): Critical Fixes + Webhook Foundation

**Goals:**
- Alle P0 Issues beheben
- CI/CD Pipeline aufsetzen
- Docker Compose Stack fuer Webhook Receiver
- MCP Push-Notification Evaluation abgeschlossen

**Tasks:**

#### Production Readiness (P0)

- [ ] **[1h]** Token cache file permissions (0600)
  - `src/auth/token-cache.ts`: `writeFile()` mit `{ mode: 0o600 }` + `mkdir` mit `{ mode: 0o700 }`
  - Tests fuer Permission-Pruefung
- [ ] **[4h]** GitHub Actions CI/CD Pipeline
  - `.github/workflows/ci.yml`: lint, typecheck, test auf PR
  - Build-Check (pnpm build)
  - `pnpm audit` als blocking check
  - Node.js 22, pnpm setup
- [ ] **[1h]** Config upper bounds
  - `MAX_ITEMS`: max 100, `MAX_BODY_LENGTH`: max 10000
  - Zod Schema anpassen in `src/config.ts`
- [ ] **[1h]** Startup log line
  - Version, Tool-Count, Log-Level, Cache-Size, Tool-Preset

#### Webhook Infrastructure

- [ ] **[8h]** Webhook Receiver Application
  - Express/Fastify Server (Node.js)
  - `POST /webhook` -- Graph Validation + Notification Handling
  - `GET /health` -- Healthcheck
  - `GET /api/notifications` -- Query Notifications (fuer MCP Tools)
  - `POST /api/subscriptions` -- Subscription Management
  - Structured Logging (pino)
  - Dockerfile
- [ ] **[4h]** PostgreSQL Schema + Migrations
  - `subscriptions` table
  - `notifications` table
  - node-pg-migrate Setup
- [ ] **[4h]** Docker Compose Stack (DGX Spark)
  - webhook-receiver, postgres, redis, caddy, cloudflared
  - `.env.example` mit allen Variablen
  - Volume Mounts, Health Checks, Resource Limits
- [ ] **[2h]** Redis Idempotency Cache
  - Notification Dedup via `subscription_id:resource_id:etag`
  - TTL: 24h

**Deliverables:**
- CI/CD Pipeline aktiv (GitHub Actions)
- Token Cache secure (0600)
- Config Bounds validiert
- Docker Stack lauffaehig auf DGX Spark
- Webhook empfaengt Test-Notifications

**Success Metrics:**
- `pnpm lint && pnpm typecheck && pnpm test` grueen in CI
- `curl http://localhost:3000/health` -> 200 OK
- Docker Compose `up -d` ohne Fehler

**Risks & Mitigations:**
- Cloudflare Tunnel Setup kann fehlschlagen -> ngrok als Fallback
- PostgreSQL Migrations-Tool Auswahl -> node-pg-migrate ist bewaehrt

---

### Sprint 2 (Week 3-4): P1 Issues + Subscription Management

**Goals:**
- P1 Production Issues beheben
- Subscription CRUD + Auto-Renewal
- DGX Spark extern erreichbar

**Tasks:**

#### Production Readiness (P1)

- [ ] **[2h]** Client Cache LRU Eviction
  - `src/auth/graph-client.ts`: `clientCache` Map -> LRU mit max 10 Entries
  - Nutze `lru-cache` (bereits Dependency)
  - Tests
- [ ] **[4h]** Total Timeout per Tool Invocation
  - `AbortController` mit 120s Timeout
  - Integration in Graph Client Middleware Chain
  - Graceful Error Message ("Tool execution timed out after 120s")
  - Tests
- [ ] **[3h]** Circuit Breaker
  - Neues Middleware: `CircuitBreakerMiddleware`
  - 5 consecutive failures in 60s -> open for 30s
  - Half-open: 1 request through, success -> close
  - Tests
- [ ] **[1h]** Periodic Cache Metrics Logging
  - `setInterval` alle 5 Minuten: cache hit rate, size, entries
  - Via pino structured logging
- [ ] **[2h]** Graceful Shutdown
  - `SIGTERM`/`SIGINT` Handler in `src/index.ts`
  - Flush pino logs
  - Close Graph clients (clear cache)
  - Exit cleanly
- [ ] **[2h]** CHANGELOG.md erstellen
  - Retrospektive aller Releases seit 0.0.1
  - Conventional Changelog Format
  - Version bump zu 0.1.0

#### Webhook Infrastructure

- [ ] **[6h]** Subscription Management API
  - `POST /api/subscriptions` -- Erstellt Graph Subscription + DB Eintrag
  - `GET /api/subscriptions` -- Listet aktive Subscriptions
  - `DELETE /api/subscriptions/:id` -- Loescht Subscription (Graph + DB)
  - `PATCH /api/subscriptions/:id/renew` -- Verlaengert um 3 Tage
  - Input Validation (Zod)
- [ ] **[4h]** Auto-Renewal Cron
  - Node-cron: alle 6 Stunden
  - Finde Subscriptions mit Ablauf < 24h
  - Renewal via Graph API
  - Error Handling + Logging
  - DB Status-Update bei Fehlschlag
- [ ] **[4h]** DGX Spark External Access
  - Cloudflare Tunnel konfigurieren
  - DNS: `webhook.pommer-it.de` -> Tunnel
  - SSL via Cloudflare (kein Caddy SSL noetig)
  - Test: Graph Subscription mit externer URL erstellen
- [ ] **[2h]** Monitoring Setup (DGX)
  - Portainer fuer Container Management (optional)
  - docker compose logs --follow
  - Basic Alerting (Container restart detection)

**Deliverables:**
- P1 Issues resolved (LRU, Timeout, Circuit Breaker, Shutdown)
- CHANGELOG.md vorhanden, Version 0.1.0
- Webhook extern erreichbar via Cloudflare Tunnel
- Subscription CRUD funktioniert
- Auto-Renewal laeuft

**Success Metrics:**
- Circuit Breaker triggert bei simuliertem Graph-Ausfall
- Tool Timeout greift nach 120s
- `curl https://webhook.pommer-it.de/health` -> 200 OK
- Subscription renewal log alle 6h

**Risks & Mitigations:**
- Circuit Breaker Middleware-Integration komplex -> isoliertes Middleware, gut testbar mit MSW
- Cloudflare Tunnel Latenz -> Monitoring, Fallback ngrok

---

### Sprint 3 (Week 5-6): MCP Notification Tools + P2 Issues

**Goals:**
- MCP Tools fuer Notification-Zugriff
- Azure Deployment als Option
- P2 Issues beginnen

**Tasks:**

#### MCP Notification Tools (3 neue Tools)

- [ ] **[6h]** `list_notifications` Tool
  - Zod Schema: `resource_type` (mail/calendar/teams/drive), `change_type`, `since`, `is_read`, `max_items`
  - Query Webhook-DB (PostgreSQL, direkt oder via API)
  - Pagination (offset/limit)
  - Response Shaping (Zeitstempel, Resource-Typ, Change-Typ, Resource-ID)
  - Tests (MSW Mocks fuer DB-API)
- [ ] **[4h]** `get_notification_details` Tool
  - Zod Schema: `notification_id`
  - Fetch Notification Metadata aus DB
  - Fetch Full Resource via Graph API (z.B. `read_email` intern)
  - Combine: Notification-Kontext + Resource-Daten
  - Tests
- [ ] **[6h]** `manage_subscriptions` Tool
  - Zod Schema: `action` (list/create/delete), `resource`, `change_types`
  - `action=list`: Aktive Subscriptions aus DB
  - `action=create`: Graph API Subscription + DB, `confirm` Pattern
  - `action=delete`: Graph API + DB, `confirm` Pattern
  - Tests

#### Azure Deployment (Optional, parallel)

- [ ] **[6h]** Azure Container Apps Setup
  - Bicep Template (Container App, PostgreSQL Flex, Redis)
  - GitHub Actions: Build + Push Docker Image zu GHCR
  - Deploy to Azure Container Apps
  - Application Insights Integration
- [ ] **[2h]** Azure Key Vault Integration
  - Secrets: DB Connection, Redis, Webhook Client State
  - Managed Identity fuer Container App

#### Production Readiness (P2)

- [ ] **[4h]** Cache JSON statt Response Objects
  - `CachingMiddleware` refactoren: `response.json()` cachen statt `response.clone()`
  - Reduziert Memory Footprint signifikant
  - Tests anpassen
- [ ] **[2h]** Graceful Shutdown erweitern
  - In-flight Requests tracken
  - Warten bis alle abgeschlossen (max 10s)
  - Dann Force-Exit
- [ ] **[2h]** `AZURE_CLIENT_SECRET` Warning
  - Bei Device Code Flow + gesetztem `AZURE_CLIENT_SECRET`: Warnung loggen
  - "AZURE_CLIENT_SECRET is set but not used with Device Code Flow"

**Deliverables:**
- 3 neue MCP Tools (list_notifications, get_notification_details, manage_subscriptions)
- Azure Deployment Option verfuegbar (Bicep + CI/CD)
- Cache Memory Footprint reduziert
- 111 Tools total

**Success Metrics:**
- Claude Code: "Zeige neue Notifications" -> funktioniert
- `manage_subscriptions action=create` erstellt Graph Subscription
- Azure Container App deployt und erreichbar
- Cache Memory < 50% des bisherigen Verbrauchs

**Risks & Mitigations:**
- DB-Zugriff aus MCP-Server: direkt via pg-Client oder via HTTP API? -> HTTP API empfohlen (Entkopplung)
- Azure Bicep Lernkurve -> vorhandene Templates als Basis

---

### Sprint 4 (Week 7-8): Claude Integration + Rate Limiting

**Goals:**
- MCP Resource + Logging fuer passive Notifications
- Rate Limiting
- Restliche P2 Issues

**Tasks:**

#### Claude Integration (Hybrid Pattern)

- [ ] **[6h]** MCP Resource `notifications://recent`
  - Resource Registration in `src/index.ts`
  - Background Polling (30s Intervall) der Notification-DB
  - `sendResourceUpdated()` bei neuen Notifications
  - Resource liefert letzte 10 ungelesene Notifications
- [ ] **[3h]** Log-basierte Notifications
  - `sendLoggingMessage` fuer kritische Events
  - Konfigurierbar: welche Events loggen (VIP-Emails, Kalender-Konflikte)
  - Log Level: "warning" fuer Aufmerksamkeit
- [ ] **[2h]** Notification Summary Prompt
  - MCP Prompt `notification-summary`
  - Template: "Fasse die letzten X Notifications zusammen und empfiehl Aktionen"

#### Production Readiness (P2 continued)

- [ ] **[4h]** Rate Limiting
  - Per-User Request Counter (in-memory, sliding window)
  - Default: 100 requests/Minute
  - 429 Response mit `Retry-After` Header
  - Konfigurierbar via ENV
  - Tests
- [ ] **[4h]** Request Coalescing
  - Concurrent identische GET Requests -> Single Graph API Call
  - Promise-basiertes Coalescing (Map von inflight Requests)
  - Response Broadcast an alle Waiter
  - Tests
- [ ] **[3h]** Full Middleware Chain Integration Test
  - Ein Test der die komplette Chain durchlaeuft
  - Logging -> Caching -> CircuitBreaker -> Retry -> ErrorMapping -> Auth -> HTTP
  - MSW Mock, pruefe dass alle Middleware korrekt interagieren
- [ ] **[2h]** Coverage Threshold in CI
  - `vitest.config.ts`: Coverage Threshold 80%
  - CI blockiert bei Unterschreitung

#### Documentation

- [ ] **[3h]** Operations Runbook
  - Auth Troubleshooting (Token abgelaufen, Account wechseln)
  - Common Graph API Errors (403, 429, 503)
  - Webhook Troubleshooting (Subscription expired, Validation failed)
  - Container Management (Restart, Logs, DB Access)

**Deliverables:**
- MCP Resource fuer passive Notification-Updates
- Log-basierte kritische Notifications
- Rate Limiting aktiv
- Request Coalescing implementiert
- Operations Runbook vorhanden

**Success Metrics:**
- `notifications://recent` Resource wird automatisch aktualisiert
- Rate Limit: 101. Request in 1 Minute -> 429
- Request Coalescing: 10 parallele identical GETs -> 1 Graph API Call
- Coverage >= 80%

**Risks & Mitigations:**
- Background Polling im stdio MCP-Server: `setInterval` ist OK, aber muss bei Shutdown aufgeraeumt werden
- Rate Limiting Granularitaet: per-user vs. global -> Start mit global, spaeter per-user

---

### Sprint 5 (Week 9-10): P3 Issues + Observability

**Goals:**
- Alle verbleibenden P3 Issues
- Observability Stack (OpenTelemetry + Metrics)
- Performance Optimierungen

**Tasks:**

#### Production Readiness (P3)

- [ ] **[2h]** `pnpm audit` in pre-push Hook
  - Husky pre-push: `pnpm audit --audit-level=high`
  - Blockiert Push bei High/Critical Vulnerabilities
- [ ] **[2h]** Memory Usage Monitoring
  - `process.memoryUsage()` alle 5 Minuten loggen
  - Warning bei > 80% Heap, Error bei > 90%
  - Konfigurierbare Thresholds
- [ ] **[2h]** Per-Tool Invocation Metrics
  - Counter pro Tool: invocations, successes, failures
  - Latency Histogram (p50, p95, p99)
  - Abrufbar via `get_server_metrics` Tool (optional)
- [ ] **[2h]** OS-native Token Storage Evaluation
  - `@azure/msal-node-extensions` testen
  - macOS Keychain, Linux libsecret, Windows DPAPI
  - Dokumentation der Ergebnisse
- [ ] **[2h]** NODE_ENV Awareness
  - `development`: verbose logging, keine Rate Limits
  - `production`: info logging, Rate Limits aktiv, strikte Timeouts
  - Dokumentation

#### Observability

- [ ] **[6h]** OpenTelemetry Integration
  - `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node`
  - Span per Tool Invocation
  - Span per Graph API Call
  - Trace Context Propagation
  - Export zu OTLP (Jaeger/Grafana Tempo)
- [ ] **[4h]** Prometheus Metrics Endpoint
  - Webhook Receiver: `GET /metrics`
  - Tool Invocation Counts, Error Rates, Cache Hit Ratio
  - Latency Histograms
  - `prom-client` Library
- [ ] **[4h]** Grafana Dashboard
  - Docker Compose: Grafana + Prometheus Services
  - Dashboard: Webhook Throughput, Notification Lag, Tool Performance
  - Alerts: Error Rate > 5%, Latency > 2s, Subscription Expiry

#### Advanced Features

- [ ] **[4h]** Nightly E2E Test Automation
  - GitHub Actions Scheduled Workflow (cron: 0 2 * * *)
  - Gegen M365 Developer Tenant
  - Report via GitHub Actions Summary
  - Slack/Email Alert bei Failure

**Deliverables:**
- Alle P3 Issues resolved
- OpenTelemetry Tracing aktiv
- Prometheus + Grafana Dashboard
- Nightly E2E Tests automatisiert
- Memory Monitoring aktiv

**Success Metrics:**
- Traces sichtbar in Jaeger/Tempo
- Grafana Dashboard zeigt live Metrics
- Nightly E2E: 100% Pass Rate ueber 5 aufeinanderfolgende Laeufe
- Zero offene P0/P1/P2/P3 Issues

**Risks & Mitigations:**
- OpenTelemetry Overhead in stdio MCP-Server -> Sampling Rate konfigurierbar
- Grafana Docker Compose auf DGX: Memory -> limitieren auf 256MB

---

### Sprint 6 (Week 11-12): Testing, Documentation & Launch

**Goals:**
- Umfassende E2E Test Suite
- Load Testing
- Production Launch v1.0.0
- Post-Launch Monitoring

**Tasks:**

#### Testing

- [ ] **[8h]** Comprehensive E2E Test Suite
  - Alle 111+ Tools gegen echte Graph API
  - Webhook Flow: Subscription erstellen -> Event triggern -> Notification pruefen
  - Automatisierte Ausfuehrung mit Report
- [ ] **[4h]** Load Testing
  - k6 Scripts fuer Webhook Receiver
  - Szenarien: 10, 100, 1000 concurrent Notifications
  - Bottleneck-Analyse (DB, Redis, Node.js)
  - Tuning Empfehlungen
- [ ] **[3h]** Chaos Testing
  - Graph API Ausfall simulieren -> Circuit Breaker greift
  - DB Connection Loss -> Graceful Degradation
  - Redis Ausfall -> Fallback auf in-memory

#### Documentation

- [ ] **[4h]** User Guide
  - Getting Started (Installation, Auth, erste Schritte)
  - Tool-Uebersicht nach Kategorie
  - Webhook Setup Guide
  - Troubleshooting FAQ
- [ ] **[3h]** API Reference
  - TypeDoc generieren und publizieren
  - Tool Parameter Dokumentation aus Zod Schemas
  - GitHub Pages Hosting
- [ ] **[2h]** README Update
  - Production-ready Badge
  - Feature-Uebersicht
  - Quick Start
  - Architecture Diagram

#### Production Launch

- [ ] **[3h]** Version 1.0.0 Release
  - Semantic Versioning: 0.1.0 -> 1.0.0
  - Git Tag + GitHub Release
  - Release Notes (aus CHANGELOG.md)
  - npm publish (optional, falls oeffentlich)
- [ ] **[2h]** Production Monitoring
  - Grafana Alerts konfigurieren
  - Error Rate > 5% -> Alert
  - Subscription Expiry < 12h ohne Renewal -> Alert
  - Container Restart -> Alert
- [ ] **[2h]** Post-Launch Checklist
  - Alle E2E Tests gruen
  - Load Test bestanden (p95 < 500ms bei 100 concurrent)
  - Grafana Dashboard live
  - Operations Runbook aktuell
  - CHANGELOG.md komplett
  - Security Scan clean

**Deliverables:**
- Version 1.0.0 released
- Umfassende Test Suite (Unit + E2E + Load + Chaos)
- Komplette Dokumentation
- Production Monitoring aktiv

**Success Metrics:**
- All E2E Tests gruen
- Load Test: p95 < 500ms bei 100 concurrent Requests
- Zero Critical/High Vulnerabilities
- Documentation Coverage: alle 111+ Tools dokumentiert
- Post-Launch: Zero Critical Bugs in erster Woche

**Risks & Mitigations:**
- E2E gegen echte API: Throttling -> Retry + Rate Limiting in Tests
- npm publish: License-Frage klaeren (aktuell UNLICENSED)

---

## Summary

| Phase | Duration | Focus | Key Deliverables |
|---|---|---|---|
| **Sprint 1-2** | Woche 1-4 | Critical Fixes + Webhook MVP | CI/CD, Secure Cache, Docker Stack, Subscription Management, P0+P1 resolved |
| **Sprint 3-4** | Woche 5-8 | Tools + Integration | 3 MCP Notification Tools, Azure Option, Rate Limiting, Resource Subscription |
| **Sprint 5-6** | Woche 9-12 | Polish + Launch | Observability, E2E, Load Tests, v1.0.0, Dokumentation |

## Total Effort

| Kategorie | Stunden |
|---|---|
| Production Readiness (P0-P3) | ~50h |
| Webhook Infrastructure | ~50h |
| MCP Notification Tools | ~30h |
| Azure Deployment | ~15h |
| Observability (OTel, Grafana) | ~20h |
| Testing (E2E, Load, Chaos) | ~20h |
| Documentation | ~15h |
| **Total** | **~200h** |

Bei 40h/Woche Full-Time: **5 Wochen**
Bei 20h/Woche Part-Time: **10 Wochen**
Bei 15h/Woche (realistisch mit Reviews etc.): **~13 Wochen**

## Budget (Infrastruktur)

| Posten | Monatlich |
|---|---|
| DGX Spark (Dev) | ~$9 (Strom) |
| Azure (Prod, optional) | ~$35-45 |
| GitHub Actions (CI) | $0 (Free Tier fuer Private Repos bis 2000 Min/Monat) |
| Cloudflare (Tunnel + DNS) | $0 |
| **Total (nur DGX)** | **~$9/Monat** |
| **Total (DGX + Azure)** | **~$45-55/Monat** |

## Risk Register

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| MCP Protokoll aendert sich | Hoch | Niedrig | SDK pinnen, Breaking Changes monitoren |
| Graph API Throttling in E2E | Mittel | Mittel | Retry-Logic, Rate Limiting in Tests |
| Cloudflare Tunnel instabil | Mittel | Niedrig | ngrok Fallback, Azure als Alternative |
| Azure Kosten eskalieren | Niedrig | Niedrig | Budget Alerts, Scale-to-Zero |
| Claude Code aendert MCP Handling | Hoch | Niedrig | Defensive Coding, Feature Detection |
| DGX Spark Hardwareausfall | Hoch | Sehr niedrig | Azure als Failover, DB Backups |
