# Webhook Infrastructure Architecture

**Date:** 2026-02-14
**Context:** MS-MCP Office 365 MCP Server -- Webhook Receiver Infrastructure Evaluation

---

## Executive Summary

The recommended architecture is an **Azure Functions-based serverless webhook receiver** with Azure Table Storage for subscription persistence and Azure Queue Storage for notification buffering. This choice aligns with the existing Azure AD authentication infrastructure, minimizes operational overhead, and costs approximately $5-15/month for a pilot deployment of 10 users. The MCP server integrates via polling-based tools that query the notification store. Total implementation: ~6-8 weeks across 3 phases.

**Alternative considered:** AWS Lambda + DynamoDB (viable but adds a second cloud provider); self-hosted Express container (higher ops overhead, not justified at this scale).

---

## Architecture Diagram

```
                                    AZURE CLOUD
                    ┌──────────────────────────────────────────────────────┐
                    │                                                      │
  Microsoft         │  ┌─────────────────┐     ┌──────────────────────┐   │
  Graph API ───────────> Azure Functions  │────>│ Azure Queue Storage  │   │
  (Webhook POST)    │  │ (Webhook        │     │ (Notification Buffer)│   │
                    │  │  Receiver)       │     └──────────┬───────────┘   │
                    │  └────────┬────────┘                │               │
                    │           │                          │               │
                    │           v                          v               │
                    │  ┌─────────────────┐     ┌──────────────────────┐   │
                    │  │ Azure Table     │     │ Azure Functions      │   │
                    │  │ Storage         │     │ (Queue Processor)    │   │
                    │  │ (Subscriptions) │     └──────────┬───────────┘   │
                    │  └─────────────────┘                │               │
                    │                                      │               │
                    │                          ┌──────────v───────────┐   │
                    │                          │ Azure Table Storage  │   │
                    │                          │ (Notifications)      │   │
                    │                          └──────────┬───────────┘   │
                    │                                      │               │
                    └──────────────────────────────────────┼───────────────┘
                                                           │
                                                           │ HTTPS
                                                           │ (API query)
                                                           │
┌──────────────────────────────────────────────────────────┼──────────────┐
│ LOCAL MACHINE                                            │              │
│                                                          │              │
│  Claude Desktop ←──stdio──→ MS-MCP Server ───────────────┘              │
│                              │                                          │
│                              ├── list_notifications (MCP tool)          │
│                              ├── get_notification (MCP tool)            │
│                              └── manage_subscription (MCP tool)         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Webhook Receiver (Azure Functions)

- **Platform:** Azure Functions (Node.js 22, TypeScript)
- **Trigger:** HTTP Trigger (POST /api/webhook)
- **Rationale:**
  - Same Azure ecosystem as existing Azure AD auth -- single cloud provider
  - Serverless = zero cost when idle, auto-scales on burst
  - Built-in HTTPS via `*.azurewebsites.net` domain (no certificate management)
  - Native integration with Azure Queue Storage (output binding)
- **Responsibilities:**
  1. Handle Graph validation handshake (respond with `validationToken`)
  2. Verify `clientState` header against stored secret
  3. Validate `subscriptionId` exists in subscription table
  4. Enqueue notification payload to Azure Queue Storage
  5. Respond 202 within 3 seconds (Graph timeout)
- **Configuration:**
  ```
  WEBHOOK_CLIENT_STATE=<random-hex-32>
  AZURE_STORAGE_CONNECTION_STRING=<connection-string>
  NOTIFICATION_QUEUE_NAME=graph-notifications
  ```

### 2. Queue Processor (Azure Functions)

- **Trigger:** Azure Queue Storage trigger
- **Responsibilities:**
  1. Dequeue notification from `graph-notifications` queue
  2. Deduplicate using composite key: `subscriptionId:resourceId:etag`
  3. Optionally fetch full resource data from Graph API (enrichment)
  4. Store processed notification in Azure Table Storage
  5. Dead-letter failed notifications after 5 retries (built-in)
- **Concurrency:** 16 messages per batch (default), auto-scaled

### 3. Storage Layer

#### Subscriptions Table (Azure Table Storage)

| Column | Type | Description |
|--------|------|-------------|
| PartitionKey | string | `userId` (Azure AD object ID) |
| RowKey | string | `subscriptionId` (Graph subscription ID) |
| resource | string | Graph resource path (e.g., `/me/mailFolders('Inbox')/messages`) |
| changeType | string | `created,updated,deleted` |
| expirationDateTime | datetime | Subscription expiry (max 3 days) |
| clientState | string | Per-subscription secret |
| notificationUrl | string | Webhook endpoint URL |
| createdAt | datetime | Creation timestamp |
| status | string | `active`, `expired`, `deleted` |

#### Notifications Table (Azure Table Storage)

| Column | Type | Description |
|--------|------|-------------|
| PartitionKey | string | `userId:YYYY-MM-DD` (partition by user + day) |
| RowKey | string | `timestamp:subscriptionId:resourceId` (sorted by time) |
| subscriptionId | string | Source subscription |
| changeType | string | `created`, `updated`, `deleted` |
| resource | string | Graph resource path |
| resourceId | string | Changed resource ID |
| resourceType | string | `message`, `event`, `driveItem`, etc. |
| processedAt | datetime | When notification was processed |
| enrichedData | string | Optional: JSON with fetched resource summary |
| deduplicationKey | string | `subscriptionId:resourceId:etag` |

#### Idempotency Cache (Azure Table Storage)

| Column | Type | Description |
|--------|------|-------------|
| PartitionKey | string | `dedup` |
| RowKey | string | `subscriptionId:resourceId:etag` |
| processedAt | datetime | When first processed |
| TTL | number | 24 hours (auto-cleanup via Azure Table TTL or daily purge) |

- **Why Azure Table Storage over CosmosDB/PostgreSQL:**
  - Extremely low cost ($0.045/GB/month storage, $0.00036/10K transactions)
  - Serverless -- no provisioned capacity
  - Sufficient for key-value + range query patterns
  - PartitionKey/RowKey design enables efficient user-scoped queries
  - Upgrade path to CosmosDB Table API if needed later

### 4. Subscription Renewal (Azure Functions Timer)

- **Trigger:** Timer trigger, runs every 12 hours
- **Logic:**
  1. Query subscriptions table for `expirationDateTime < now + 24h`
  2. PATCH each subscription via Graph API to extend by 3 days
  3. Update `expirationDateTime` in table
  4. Log expired/failed renewals
  5. Optionally recreate expired subscriptions
- **Auth:** Uses application credentials (client_credentials flow) with `Mail.Read`, `Calendars.Read`, etc. -- requires admin consent

### 5. MCP Integration Tools

Three new MCP tools in the MS-MCP server:

#### `list_notifications`
- **Parameters:** `resource_type?`, `change_type?`, `since?` (ISO datetime), `max_items?`
- **Action:** HTTPS GET to Azure Functions API endpoint that queries Notifications table
- **Auth:** Shared API key or Azure AD token
- **Response:** Formatted list of recent notifications

#### `get_notification`
- **Parameters:** `notification_id`
- **Action:** Fetch full notification details + optionally fetch current resource state from Graph
- **Response:** Notification metadata + resource summary

#### `manage_subscriptions`
- **Parameters:** `action` (list/create/delete), `resource?`, `change_type?`, `subscription_id?`
- **Action:** CRUD operations on subscriptions via Azure Functions API
- **Response:** Subscription details/confirmation

### 6. Security Architecture

```
MCP Server ──(HTTPS + API Key)──> Azure Functions API
                                       │
                                       ├── Verify API Key (header)
                                       ├── Verify user identity (optional: Azure AD token)
                                       └── Query scoped to user's PartitionKey

Graph API ──(HTTPS + clientState)──> Azure Functions Webhook
                                       │
                                       ├── Verify clientState header
                                       ├── Verify subscriptionId exists
                                       └── Enqueue (no direct DB write in hot path)
```

- **MCP-to-Webhook Server auth:** API key in `X-API-Key` header (MVP) or Azure AD service-to-service token (production)
- **Graph-to-Webhook auth:** `clientState` secret per subscription, verified on every notification
- **Data isolation:** PartitionKey = userId ensures users only see their own notifications
- **Network:** Azure Functions behind HTTPS; no public access to storage accounts

---

## Cost Analysis

| Scenario | Users | Subscriptions | Notifications/Day | Azure Functions | Table Storage | Queue Storage | **Total/Month** |
|----------|-------|---------------|-------------------|-----------------|---------------|---------------|-----------------|
| **Dev** | 1 | 5 | 100 | $0 (free tier) | $0.01 | $0.01 | **~$0** |
| **Pilot** | 10 | 50 | 2,000 | $0 (free tier: 1M exec/mo) | $0.05 | $0.02 | **~$1** |
| **Production** | 100 | 500 | 50,000 | $2-5 | $0.50 | $0.20 | **~$5-10** |
| **Scale** | 1,000 | 5,000 | 500,000 | $15-30 | $5 | $2 | **~$25-40** |

**Notes:**
- Azure Functions free tier: 1 million executions + 400,000 GB-seconds/month
- Azure Table Storage: $0.045/GB/month + $0.00036/10K transactions
- Queue Storage: $0.045/GB/month + $0.004/10K operations
- No fixed infrastructure cost -- true pay-per-use
- Notification data retention: 30 days default (configurable, older data auto-purged)

---

## Implementation Phases

### Phase 1: MVP (2-3 Wochen)

**Goal:** Working webhook receiver for local development, single user.

- [ ] **Azure Functions project scaffolding** (TypeScript, ESM, same toolchain as MS-MCP)
  - HTTP trigger: `/api/webhook` (validation + notification handling)
  - Timer trigger: subscription renewal (every 12h)
- [ ] **SQLite storage** (local dev, no Azure dependency)
  - Subscriptions table
  - Notifications table
  - Idempotency cache (dedup by subscription:resource:etag)
- [ ] **ngrok tunnel** for local development
- [ ] **Manual subscription management** via curl/scripts
- [ ] **Basic MCP tools** in MS-MCP
  - `list_notifications` (query local SQLite)
  - `manage_subscriptions` (create/list/delete)
- [ ] **Tests:** Vitest + MSW for webhook handler, subscription renewal logic
- [ ] **Docs:** Setup guide, local dev instructions

**Deliverables:**
- Working end-to-end: Graph notification -> ngrok -> local Functions -> SQLite -> MCP tool
- Manual subscription lifecycle (create, renew, delete)

### Phase 2: Production Deployment (4-6 Wochen)

**Goal:** Cloud-deployed, multi-user capable, monitored.

- [ ] **Azure deployment**
  - Azure Functions deployment via Azure CLI / Terraform
  - Azure Table Storage for subscriptions + notifications
  - Azure Queue Storage for notification buffering
  - Custom domain + managed SSL certificate (optional)
- [ ] **Application credentials auth** (client_credentials flow for subscription management)
  - Separate Azure AD app registration for webhook server
  - Admin-consented permissions for subscribed resources
- [ ] **Auto-renewal logic** with error handling and alerting
- [ ] **API key authentication** for MCP-to-webhook-server communication
- [ ] **Notification enrichment** (optional: fetch resource summary on notification)
- [ ] **Monitoring & alerting**
  - Azure Application Insights integration
  - Alerts: subscription renewal failures, high error rate, queue depth
- [ ] **MCP tool refinements**
  - `get_notification` with resource enrichment
  - Filter by resource type, change type, date range
  - Pagination for large notification lists
- [ ] **Data retention policy** (purge notifications older than 30 days)

**Deliverables:**
- Cloud-deployed webhook infrastructure
- Multi-user notification storage with data isolation
- Automated subscription lifecycle management
- Monitoring dashboards and alerts

### Phase 3: Scale & Advanced Features (8-12 Wochen)

- [ ] **Terraform IaC** for full infrastructure provisioning
  - Azure Functions, Storage, Application Insights, Key Vault
  - Environment separation (dev, staging, prod)
- [ ] **CI/CD pipeline** for webhook server (GitHub Actions)
  - Build, test, deploy to Azure Functions
  - Separate from MS-MCP pipeline
- [ ] **Multi-tenant support**
  - Per-tenant webhook URLs or shared endpoint with tenant routing
  - Tenant-scoped subscription management
  - Admin portal for tenant onboarding
- [ ] **Rich notifications** (encrypted notifications with certificate)
  - Receive full resource data in notification payload
  - Eliminate need for separate Graph API call
  - Requires certificate management (Azure Key Vault)
- [ ] **Event-driven MCP integration** (advanced)
  - Long-polling or SSE from webhook server to MCP
  - MCP resource subscriptions (if SDK supports)
  - Push notifications to Claude Desktop
- [ ] **SLA/SLO monitoring**
  - Notification delivery latency (target: <30s from Graph event)
  - Subscription renewal success rate (target: >99.9%)
  - Webhook endpoint availability (target: >99.9%)
- [ ] **Disaster recovery**
  - Azure Functions geo-redundancy
  - Table Storage GRS (geo-redundant storage)
  - Subscription recreation logic after full outage
- [ ] **Load testing**
  - Simulate 10K notifications/minute burst
  - Validate auto-scaling behavior
  - Measure end-to-end latency under load

---

## Alternative Architectures Considered

### Option B: AWS Lambda + API Gateway + DynamoDB

| Aspect | Azure Functions (Chosen) | AWS Lambda |
|--------|--------------------------|------------|
| Ecosystem fit | Same as existing Azure AD | Second cloud provider |
| Cost | Comparable | Comparable |
| Developer experience | TypeScript first-class | TypeScript first-class |
| Storage | Table Storage (cheap) | DynamoDB (cheap) |
| Queue | Azure Queue (native) | SQS (native) |
| Auth integration | Azure AD native | Requires federation |
| **Verdict** | **Chosen** -- single cloud | Viable fallback |

### Option C: Self-hosted Express + PostgreSQL

| Aspect | Azure Functions (Chosen) | Self-hosted |
|--------|--------------------------|-------------|
| Infrastructure cost | ~$0-10/month | ~$20-50/month (VPS/container) |
| Ops overhead | Zero (serverless) | High (patching, monitoring, scaling) |
| Scaling | Automatic | Manual (PM2, Docker, k8s) |
| HTTPS | Built-in | Requires cert management |
| **Verdict** | **Chosen** -- lower ops | Overbuilt for this scale |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Graph webhook delivery delays (>3 min) | Medium | Low | Accept; use polling as fallback |
| Subscription renewal failure | Low | High | Alert on failure; auto-recreate expired subscriptions |
| Azure Functions cold start latency | Medium | Low | Use consumption plan; 3s Graph timeout is generous |
| Notification data loss | Low | Medium | Queue + dead-letter + Table Storage durability |
| Cost overrun at scale | Low | Medium | Azure spending alerts; per-user subscription limits |
| MCP SDK limitations for push notifications | High | Medium | Start with polling; evaluate SSE/long-poll later |

---

## Decision Log

| Decision | Chosen | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Cloud provider | Azure | AWS, GCP | Same ecosystem as Azure AD auth |
| Compute | Azure Functions (serverless) | Container Apps, AKS | Lowest ops overhead, pay-per-use |
| Storage | Azure Table Storage | CosmosDB, PostgreSQL | Cheapest, sufficient for key-value + range queries |
| Queue | Azure Queue Storage | Service Bus | Simpler, cheaper, sufficient for this workload |
| MCP integration | Polling (HTTPS GET) | WebSocket, SSE | MCP SDK supports request-response; no push primitive |
| IaC | Terraform (Phase 3) | Bicep, ARM, CDK | Team familiarity, multi-cloud portability |
| Notification enrichment | Optional/lazy | Always enrich | Reduces Graph API calls; user fetches full data on demand |
