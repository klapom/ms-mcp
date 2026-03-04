# Technical Decision Records

**Date:** 2026-02-14
**Context:** MS-MCP Production + Webhook Infrastructure

---

## TDR-001: MCP Notification Pattern

**Status:** Decided

**Decision:** Hybrid -- Tool-basiertes Polling (MVP) + MCP Resource Subscription + Log Messages (Production)

**Context:**
Das MCP-Protokoll (SDK 1.12.1) unterstuetzt Server-initiated Notifications (`notifications/resources/updated`, `sendLoggingMessage`), aber keine User-facing Push-Alerts in Claude Code/Desktop. Sampling (`createMessage`) ist fuer LLM-Hilfe waehrend Tool-Execution gedacht, nicht fuer asynchrone Benachrichtigungen.

**Rationale:**
- **Polling via Tools** funktioniert garantiert mit jedem MCP-Client und ist das einzige Pattern, das dem User aktiv Daten praesentiert.
- **Resource Subscriptions** halten Daten frisch fuer den naechsten Zugriff, aber erzeugen keinen sichtbaren Alert.
- **Log Messages** bieten einen Low-Effort Weg fuer passive Hinweise im Log-Panel.
- **Sampling als Push** waere ein Missbrauch des Protokolls und ist unzuverlaessig.

**Consequences:**
- User muss aktiv fragen ("Gibt es neue Notifications?") oder einen Prompt mit periodischer Pruefung nutzen
- Latenz: 5-60s je nach User-Verhalten (bei Polling), ~30s bei Resource Subscription Background-Poll
- Einfache Implementierung, keine experimentellen Features
- Zukunftssicher: wenn MCP echte Push-Notifications bekommt, ist die Notification-DB bereits vorhanden

**Alternatives Considered:**
- Sampling-basierter Push: Abgelehnt (Protokoll-Missbrauch, unzuverlaessig)
- SSE/WebSocket Transport: Nicht verfuegbar in Claude Code (stdio only)
- Externe Notification (Email/SMS bei Events): Out of Scope

---

## TDR-002: Deployment Platform

**Status:** Decided

**Decision:** DGX Spark fuer Entwicklung/Testing, Azure Container Apps fuer Production (Hybrid)

**Context:**
Der Webhook Receiver benoetigt eine oeffentlich erreichbare HTTPS-URL fuer Microsoft Graph Change Notifications. Zwei Optionen: DGX Spark (192.168.178.10) im Heimnetz mit Cloudflare Tunnel, oder Azure Cloud mit nativer HTTPS-Ingress.

**Rationale:**
- **DGX Spark (Dev):** Keine Cloud-Kosten waehrend Entwicklung, schnelle Iteration, volle Datenkontrolle, PostgreSQL direkt vom MCP-Server erreichbar (localhost). DGX hat ueberdimensionierte Resourcen (128GB RAM) fuer diesen Use Case.
- **Azure (Prod):** 99.9% SLA, Auto-Scaling, Managed Services (kein Patching), nativer HTTPS, gleicher Cloud-Provider wie Azure AD (kurze Latenz zu Graph API).
- **Hybrid:** Gleicher Docker-Container laeuft auf beiden Plattformen. Nur Infrastruktur (DB, Redis, Ingress) unterscheidet sich via Environment-Variablen.

**Consequences:**
- Development: ~$9/Monat (Strom)
- Production: ~$35-45/Monat (Azure)
- Zwei Environments zu pflegen (aber gleicher Container)
- DGX als Fallback bei Azure-Problemen
- Cloudflare Tunnel fuer DGX muss eingerichtet und ueberwacht werden

**Alternatives Considered:**
- Nur DGX Spark: Abgelehnt fuer Production (kein SLA, Single Point of Failure)
- Nur Azure: Moeglich, aber hoehere Kosten waehrend Entwicklung
- AWS: Abgelehnt (zweiter Cloud-Provider, Azure AD Proximity-Vorteil)
- Hetzner/DigitalOcean: Guenstiger als Azure, aber kein Proximity-Vorteil

---

## TDR-003: Database fuer Notifications

**Status:** Decided

**Decision:** PostgreSQL

**Context:**
Die Notification-DB speichert Graph Webhook Subscriptions und eingehende Change Notifications. Optionen: PostgreSQL, SQLite, MongoDB.

**Rationale:**
- **PostgreSQL** ist der Standard fuer relationale Daten mit gutem JSON-Support (JSONB fuer `resourceData`).
- Subscriptions und Notifications haben eine klare relationale Beziehung (FK).
- JSONB erlaubt flexible Notification-Payloads ohne Schema-Migration.
- Hervorragender Index-Support fuer Zeitbereichs-Queries (`created_at`).
- Verfuegbar als Managed Service in Azure (Flexible Server) und als Docker Container.
- Bewaehrte Backup/Restore-Mechanismen.

**Consequences:**
- Zusaetzlicher Container im Docker Stack
- ~256MB RAM fuer PostgreSQL Container
- Migrations-Tool noetig (node-pg-migrate)
- Direkt erreichbar vom MCP-Server auf DGX (localhost:5432)

**Alternatives Considered:**
- **SQLite:** Einfacher (kein Server), aber keine Concurrent Writes (Webhook Receiver + MCP Server), kein Managed Service in Azure. Abgelehnt.
- **MongoDB:** Overkill fuer diesen Use Case, kein relationaler FK-Support, hoehere Memory-Anforderungen. Abgelehnt.
- **Azure Table Storage:** Guenstig, aber kein SQL, limitierte Query-Optionen, Azure-Lock-in. Abgelehnt fuer Hybrid-Setup.
- **Redis only:** Kein persistenter Storage, nicht geeignet fuer Notification-History. Abgelehnt als Primary Store (OK als Cache).

---

## TDR-004: Webhook Receiver Framework

**Status:** Decided

**Decision:** Fastify

**Context:**
Der Webhook Receiver ist ein separater HTTP-Server (nicht Teil des MCP stdio Servers). Er empfaengt Graph Change Notifications, speichert sie in PostgreSQL und stellt eine API fuer MCP-Tools bereit.

**Rationale:**
- **Fastify** bietet bessere Performance als Express (2-3x Request/s), eingebaute Schema-Validation (JSON Schema, kompatibel mit Zod via zod-to-json-schema), strukturiertes Logging via pino (bereits im Projekt), und TypeScript-first Design.
- Konsistent mit dem bestehenden Tech Stack (pino, Zod, TypeScript).
- Leichtgewichtig: ~20 Dependencies (vs. Express mit express-validator, helmet, cors etc.).
- Plugin-System fuer saubere Modularisierung.

**Consequences:**
- Neue Dependency: `fastify`, `@fastify/cors`, `@fastify/helmet`
- Fastify-spezifisches Wissen noetig (Plugin-System, Decorators)
- Bessere Performance bei Notification-Bursts

**Alternatives Considered:**
- **Express:** Bewaehrter Standard, aber aelteres Design, Performance-Nachteile, kein eingebautes Schema-Validation. Knapp abgelehnt -- Express waere auch OK.
- **Azure Functions:** Serverless, kein Server-Management, aber Azure-Lock-in, Cold-Start-Probleme, schwierigere lokale Entwicklung. Abgelehnt fuer Hybrid-Setup.
- **Hono:** Modern und schnell, aber weniger Ecosystem/Middleware als Fastify. Nicht evaluiert im Detail.

---

## TDR-005: Container Orchestration

**Status:** Decided

**Decision:** Docker Compose (kein Kubernetes)

**Context:**
Der Webhook Stack besteht aus 4-5 Containern (Receiver, PostgreSQL, Redis, Reverse Proxy, ggf. Cloudflared). Orchestration-Optionen: Docker Compose, Kubernetes, Docker Swarm.

**Rationale:**
- **Docker Compose** ist ausreichend fuer einen Single-Node Deployment (DGX Spark) und lokale Entwicklung.
- Maximale Einfachheit: eine `docker-compose.yml` Datei, `docker compose up -d`.
- Kein Cluster-Management noetig (kein etcd, kein API Server, kein Control Plane).
- Azure Container Apps abstrahiert Kubernetes bereits -- kein eigenes K8s Cluster noetig.
- Health Checks, Restart Policies, Resource Limits sind in Compose verfuegbar.
- Rollout: `docker compose pull && docker compose up -d` (einfaches Update).

**Consequences:**
- Kein Horizontal Scaling auf DGX (nur vertikal)
- Kein Service Mesh, kein Ingress Controller (Caddy uebernimmt)
- Einfaches Monitoring (docker stats, Portainer optional)
- Bei Wachstum: Migration zu Kubernetes waere noetig (unwahrscheinlich fuer Single-User/Small-Team)

**Alternatives Considered:**
- **Kubernetes (k3s auf DGX):** Massiver Overkill fuer 4-5 Container auf einem Node. Hoeherer Lernaufwand, mehr Maintenance. Abgelehnt.
- **Docker Swarm:** Deprecated-aehnlicher Status, kaum Community-Support. Abgelehnt.
- **Podman Compose:** Kompatibel, aber weniger verbreitet, potenzielle Kompatibilitaetsprobleme. Nicht noetig.

---

## Decision Summary

| TDR | Decision | Confidence |
|---|---|---|
| TDR-001 | Hybrid Polling + Resource + Logging | Hoch -- einziger robuster Weg mit aktuellem MCP |
| TDR-002 | DGX (Dev) + Azure (Prod) | Hoch -- best of both worlds |
| TDR-003 | PostgreSQL | Hoch -- Standard-Wahl, Hybrid-faehig |
| TDR-004 | Fastify | Mittel -- Express waere auch OK, Fastify hat Performance-Vorteil |
| TDR-005 | Docker Compose | Hoch -- K8s waere Overkill |
