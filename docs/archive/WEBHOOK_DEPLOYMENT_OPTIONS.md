# Webhook Deployment Architectures

**Date:** 2026-02-14
**Context:** MS-MCP Webhook Receiver -- Deployment Options

---

## Executive Summary

| Kriterium | DGX Spark (Option A) | Azure Cloud (Option B) |
|---|---|---|
| **Best for** | Dev/Testing, Prototyping | Production, Multi-User |
| **Kosten** | ~$15/Monat (Strom + Tunnel) | ~$30-60/Monat |
| **Setup-Zeit** | 2-4 Stunden | 4-8 Stunden |
| **Verfuegbarkeit** | 95% (Heimnetz, Single Point of Failure) | 99.9% (Azure SLA) |
| **Skalierung** | Vertikal (DGX hat 128GB RAM) | Horizontal (Auto-Scale) |
| **Wartung** | Manuell (Updates, Backups, SSL) | Managed Services |
| **Externe Erreichbarkeit** | Cloudflare Tunnel (empfohlen) | Native HTTPS |

**Empfehlung:** DGX Spark fuer Entwicklung und Testing, Azure fuer Production. Start mit DGX, Migration zu Azure wenn stabil.

---

## Option A: DGX Spark (192.168.178.10)

### Architecture Diagram

```
                    INTERNET                          DGX SPARK (192.168.178.10)
                        |                     ┌─────────────────────────────────────┐
                        |                     │  Docker Compose Stack               │
  Microsoft Graph  ─────┼────────────────────>│                                     │
  (Webhook POST)        |  Cloudflare Tunnel  │  ┌─────────────┐  ┌─────────────┐  │
                        |  (cloudflared)       │  │   Caddy      │  │  Webhook    │  │
                        |         ────────────>│  │   Reverse    │─>│  Receiver   │  │
                        |                     │  │   Proxy      │  │  (Node.js)  │  │
                        |                     │  │   :443       │  │  :3000      │  │
                        |                     │  └─────────────┘  └──────┬──────┘  │
                        |                     │                          │          │
                        |                     │                ┌────────┴────────┐ │
                        |                     │                │                 │ │
                        |                     │  ┌─────────────┐  ┌───────────┐  │ │
                        |                     │  │ PostgreSQL   │  │  Redis    │  │ │
                        |                     │  │ :5432        │  │  :6379    │  │ │
                        |                     │  │ (Subs +      │  │  (Idempot.│  │ │
                        |                     │  │  Notifs)     │  │   Cache)  │  │ │
                        |                     │  └─────────────┘  └───────────┘  │ │
                        |                     │                                   │ │
  Claude Code/Desktop   │                     │  ┌─────────────┐                  │ │
  (MCP Server) ─────────┼────────────────────>│  │  MCP Server  │─────────────────┘ │
  (localhost)           |  localhost:5432      │  │  (stdio)     │                    │
                        |                     │  └─────────────┘                    │
                        |                     └─────────────────────────────────────┘
```

### docker-compose.yml

```yaml
version: "3.9"

services:
  webhook-receiver:
    build:
      context: ./webhook
      dockerfile: Dockerfile
    container_name: ms-mcp-webhook
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://msmcp:${POSTGRES_PASSWORD}@postgres:5432/msmcp_webhooks
      - REDIS_URL=redis://redis:6379
      - WEBHOOK_CLIENT_STATE=${WEBHOOK_CLIENT_STATE}
      - LOG_LEVEL=info
      - PORT=3000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 512M
        reservations:
          cpus: "0.5"
          memory: 128M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    networks:
      - msmcp

  postgres:
    image: postgres:16-alpine
    container_name: ms-mcp-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_DB=msmcp_webhooks
      - POSTGRES_USER=msmcp
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./webhook/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    ports:
      - "127.0.0.1:5432:5432"
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 256M
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U msmcp -d msmcp_webhooks"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - msmcp

  redis:
    image: redis:7-alpine
    container_name: ms-mcp-redis
    restart: unless-stopped
    command: redis-server --maxmemory 64mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    ports:
      - "127.0.0.1:6379:6379"
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 128M
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - msmcp

  caddy:
    image: caddy:2-alpine
    container_name: ms-mcp-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./webhook/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - webhook-receiver
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 64M
    networks:
      - msmcp

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: ms-mcp-cloudflared
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - caddy
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 64M
    networks:
      - msmcp

volumes:
  pgdata:
  redisdata:
  caddy_data:
  caddy_config:

networks:
  msmcp:
    driver: bridge
```

### PostgreSQL Schema (init.sql)

```sql
-- Subscriptions table
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    graph_subscription_id VARCHAR(255) UNIQUE,
    resource VARCHAR(500) NOT NULL,
    change_types VARCHAR(100) NOT NULL,
    notification_url VARCHAR(500) NOT NULL,
    client_state VARCHAR(255) NOT NULL,
    expiration_datetime TIMESTAMPTZ NOT NULL,
    user_id VARCHAR(255),
    tenant_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES subscriptions(id),
    graph_subscription_id VARCHAR(255) NOT NULL,
    change_type VARCHAR(20) NOT NULL,
    resource VARCHAR(500) NOT NULL,
    resource_data JSONB,
    tenant_id VARCHAR(255),
    client_state VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_is_read ON notifications(is_read) WHERE NOT is_read;
CREATE INDEX idx_notifications_resource ON notifications(resource);
CREATE INDEX idx_subscriptions_expiration ON subscriptions(expiration_datetime);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

### External Access Strategy

**Empfehlung: Cloudflare Tunnel (Zero Trust)**

| Methode | Setup | Kosten | Sicherheit | Stabilitaet |
|---|---|---|---|---|
| **Cloudflare Tunnel** | Einfach | Kostenlos | Hoch (kein Port offen) | Sehr gut |
| ngrok | Sehr einfach | $8/Monat (feste Domain) | Mittel | Gut |
| DynDNS + Port Forward | Mittel | $3-5/Monat | Niedrig (Port offen) | Fragil |
| Tailscale Funnel | Einfach | Kostenlos | Hoch | Gut |

Cloudflare Tunnel ist die beste Wahl:
- Kein eingehender Port auf der Firewall noetig
- Cloudflare WAF schuetzt vor Angriffen
- Stabile HTTPS-Domain (z.B. `webhook.pommer-it.de`)
- Kostenlos im Free-Tier

### Setup Steps

1. **Docker + Docker Compose installieren** (falls nicht vorhanden)
2. **Repository klonen** und `.env` konfigurieren
3. **Cloudflare Tunnel erstellen:**
   ```bash
   # Auf cloudflare.com: Zero Trust > Networks > Tunnels > Create
   # Token kopieren und in .env eintragen
   ```
4. **Stack starten:**
   ```bash
   cd /home/admin/projects/ms-mcp/webhook
   docker compose up -d
   ```
5. **Health Check verifizieren:**
   ```bash
   curl https://webhook.pommer-it.de/health
   ```
6. **Erste Subscription erstellen** (via MCP-Tool oder curl)

### Pros & Cons

**Vorteile:**
- Keine laufenden Cloud-Kosten
- Volle Kontrolle ueber Daten (DSGVO)
- DGX Spark hat massive Resourcen (128GB RAM, Grace CPU)
- Schnelle Iteration (lokaler Zugriff)
- PostgreSQL direkt von MCP Server erreichbar (localhost)

**Nachteile:**
- Single Point of Failure (Strom, Internet, Hardware)
- Kein SLA -- Heimnetz-Verfuegbarkeit ~95%
- Manuelle Updates und Backups noetig
- Cloudflare Tunnel-Abhaengigkeit fuer externen Zugriff
- Kein Auto-Scaling

### Cost Analysis

| Posten | Kosten/Monat |
|---|---|
| Hardware | $0 (vorhanden) |
| Strom (idle ~30W fuer Stack) | ~$8 |
| Cloudflare Tunnel | $0 (Free Tier) |
| Domain (falls noetig) | ~$1 |
| **Total** | **~$9/Monat** |

---

## Option B: Azure Cloud

### Architecture Diagram

```
                    AZURE CLOUD
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Microsoft Graph                                                 │
│  (Webhook POST)                                                  │
│       │                                                          │
│       v                                                          │
│  ┌─────────────────────────┐     ┌───────────────────────┐      │
│  │  Azure Container Apps    │────>│ Azure Database for    │      │
│  │  (Webhook Receiver)      │     │ PostgreSQL (Flex)     │      │
│  │  - Auto-Scale 0-5        │     │ Burstable B1ms        │      │
│  │  - Custom Domain + SSL   │     └───────────────────────┘      │
│  │  - Managed Identity      │                                    │
│  └────────┬────────────────┘     ┌───────────────────────┐      │
│           │                      │ Azure Cache for Redis  │      │
│           └─────────────────────>│ Basic C0               │      │
│                                  └───────────────────────┘      │
│                                                                  │
│  ┌─────────────────────────┐     ┌───────────────────────┐      │
│  │  Azure Key Vault         │     │ Application Insights  │      │
│  │  (Secrets)               │     │ (Monitoring)          │      │
│  └─────────────────────────┘     └───────────────────────┘      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
        ^
        │ HTTPS (tool queries DB directly or via API)
        │
  Claude Code/Desktop (MCP Server)
```

### Bicep Template (Kernstruktur)

```bicep
param location string = resourceGroup().location
param environmentName string = 'ms-mcp-webhook'

// Container Apps Environment
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${environmentName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'azure-monitor'
    }
  }
}

// Webhook Receiver Container App
resource webhookApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${environmentName}-webhook'
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        customDomains: [
          {
            name: 'webhook.pommer-it.de'
            certificateId: '...'
          }
        ]
      }
      secrets: [
        { name: 'db-connection', value: '...' }
        { name: 'redis-connection', value: '...' }
        { name: 'webhook-client-state', value: '...' }
      ]
    }
    template: {
      containers: [
        {
          name: 'webhook-receiver'
          image: 'ghcr.io/pommer-it/ms-mcp-webhook:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'DATABASE_URL', secretRef: 'db-connection' }
            { name: 'REDIS_URL', secretRef: 'redis-connection' }
            { name: 'WEBHOOK_CLIENT_STATE', secretRef: 'webhook-client-state' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 5
        rules: [
          {
            name: 'http-scaling'
            http: { metadata: { concurrentRequests: '50' } }
          }
        ]
      }
    }
  }
}

// PostgreSQL Flexible Server
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: '${environmentName}-pg'
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
  }
}

// Redis Cache
resource redis 'Microsoft.Cache/redis@2023-08-01' = {
  name: '${environmentName}-redis'
  location: location
  properties: {
    sku: {
      name: 'Basic'
      family: 'C'
      capacity: 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
  }
}
```

### Pricing Tier Empfehlungen

| Service | Tier | Kosten/Monat |
|---|---|---|
| Container Apps | Consumption (scale to 0) | ~$5-15 |
| PostgreSQL Flexible | Burstable B1ms | ~$13 |
| Redis Cache | Basic C0 (250MB) | ~$16 |
| Application Insights | Free tier (5GB/Monat) | $0 |
| Key Vault | Standard | ~$0.50 |
| Custom Domain + SSL | Managed Certificate | $0 |
| **Total** | | **~$35-45/Monat** |

### Scaling Rules

- **Min Replicas: 0** -- Scale to Zero wenn kein Traffic (spart Kosten)
- **Max Replicas: 5** -- Fuer Bursts (z.B. Massenmail-Eingang)
- **Trigger:** 50 concurrent HTTP requests pro Replica
- **Cool-down:** 300s (5 Minuten)

### Backup Strategy

- PostgreSQL: Automatische Backups (7 Tage Retention)
- Redis: Nicht persistent (Cache only -- kein Backup noetig)
- Container Images: GitHub Container Registry mit Versioning

### Pros & Cons

**Vorteile:**
- 99.9% SLA (Azure)
- Auto-Scaling inkl. Scale-to-Zero
- Managed Services (kein Patching/Updates)
- Native HTTPS mit Managed Certificates
- Monitoring via Application Insights
- Gleicher Cloud-Provider wie Azure AD (kurze Latenz)

**Nachteile:**
- Laufende Kosten (~$35-45/Monat)
- Daten in Azure Cloud (DSGVO-konform, aber extern)
- Vendor Lock-in (Bicep, Azure-spezifische Features)
- Komplexeres Setup (IAM, Networking, Key Vault)
- Cold-Start bei Scale-to-Zero (~2-5s)

### Cost Analysis

| Posten | Kosten/Monat |
|---|---|
| Container Apps (Consumption) | $5-15 |
| PostgreSQL Flex B1ms | $13 |
| Redis Basic C0 | $16 |
| Application Insights | $0 |
| Key Vault | $0.50 |
| **Total** | **~$35-45/Monat** |

---

## Recommendation

### Phasenweise Einführung

| Phase | Plattform | Zeitraum | Zweck |
|---|---|---|---|
| **Phase 1** | DGX Spark | Woche 1-4 | Entwicklung, Prototyping, E2E-Tests |
| **Phase 2** | DGX Spark + Azure | Woche 5-8 | Azure Setup, paralleler Betrieb |
| **Phase 3** | Azure (Primary) | Woche 9+ | Production, DGX als Fallback |

### Begruendung

1. **DGX Spark zuerst:** Schnellste Iteration, keine Cloud-Kosten waehrend Entwicklung, PostgreSQL direkt vom MCP-Server erreichbar (localhost).

2. **Azure fuer Production:** Graph API Webhooks benoetigen eine stabile, oeffentlich erreichbare HTTPS-URL. Cloudflare Tunnel funktioniert, aber Azure bietet bessere SLAs und weniger Komplexitaet im Betrieb.

3. **Hybrid moeglich:** Gleicher Docker-Container laeuft auf beiden Plattformen. Nur die Infrastruktur (DB, Redis, Ingress) unterscheidet sich. Environment-Variable-basierte Config macht Migration trivial.
