# Operations Runbook — MS-MCP Server

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Starting the Server](#starting-the-server)
- [Authentication](#authentication)
- [Common Issues & Troubleshooting](#common-issues--troubleshooting)
- [Log Locations & Analysis](#log-locations--analysis)
- [Cache Management](#cache-management)
- [Memory Management](#memory-management)
- [Circuit Breaker](#circuit-breaker)
- [Rate Limiting](#rate-limiting)
- [Emergency Procedures](#emergency-procedures)

---

## Architecture Overview

MS-MCP is an MCP (Model Context Protocol) server that bridges Claude Desktop/Cowork to Microsoft Graph API. It runs as a subprocess communicating via stdio (JSON-RPC).

**Middleware chain (Graph API requests):**
```
Logging -> RequestCoalescing -> Caching -> CircuitBreaker -> Retry -> ErrorMapping -> Auth -> HTTP
```

---

## Starting the Server

```bash
# Development (hot-reload)
pnpm dev

# Production
pnpm build && node dist/index.js
```

**Required environment variables:**
- `AZURE_TENANT_ID` — Azure AD tenant ID
- `AZURE_CLIENT_ID` — Azure AD application client ID

**Optional environment variables:**
- `LOG_LEVEL` — Logging level (trace/debug/info/warn/error/fatal), default: `info`
- `TOKEN_CACHE_PATH` — Token cache file path, default: `~/.ms-mcp/token-cache.json`
- `MAX_ITEMS` — Max items per list response, default: `25`
- `MAX_BODY_LENGTH` — Max body length in responses, default: `500`

---

## Authentication

The server uses MSAL Device Code Flow with persistent token cache.

### Login
```bash
pnpm auth login
```

### Check Status
```bash
pnpm auth status
```

### Logout
```bash
pnpm auth logout
```

### Switch Accounts
```bash
rm ~/.ms-mcp/token-cache.json
pnpm auth login
```

**Important:** After logout or account switch, reconnect the MCP server in Claude Code via `/mcp`.

---

## Common Issues & Troubleshooting

### Authentication Failures

**Symptom:** Server exits with "Not authenticated" message.
**Fix:**
1. Run `pnpm auth login`
2. Complete Device Code Flow in browser
3. Restart MCP server

**Symptom:** `MailboxNotEnabledForRESTAPI` error.
**Cause:** The authenticated account has no Exchange license.
**Fix:** Switch to a licensed user account (e.g., not the admin account).

### Graph API Errors

**Symptom:** 403 Forbidden / `Authorization_RequestDenied`
**Cause:** Missing API permissions or admin consent.
**Fix:** Check required permissions in Azure AD app registration. Grant admin consent.

**Symptom:** 429 Too Many Requests
**Cause:** Graph API rate limit exceeded.
**Fix:** The retry middleware handles this automatically with Retry-After header. If persistent, reduce request frequency.

**Symptom:** 503 Service Unavailable / Circuit breaker OPEN
**Cause:** Graph API endpoint is experiencing issues; circuit breaker tripped after 5 failures in 30s.
**Fix:** Wait 60s for circuit breaker cooldown. Check Microsoft 365 Service Health.

### Server Hangs

**Symptom:** Tool invocation never completes.
**Cause:** Possible network issue or Graph API hang.
**Fix:** Tool timeout (120s) will automatically abort. If server is unresponsive, send SIGTERM.

### Out of Memory (OOM)

**Symptom:** Server crashes with heap allocation errors.
**Fix:**
1. Check health metrics logs for memory warnings (80%) or alerts (90%)
2. Increase Node.js heap: `node --max-old-space-size=4096 dist/index.js`
3. Review cache size configuration (MAX_CACHE_SIZE in cache-config)

---

## Log Locations & Analysis

Logs are written to **stderr** in structured JSON format (pino).

### Log Fields (safe, no PII)
- `module` — Source module (server, graph-http, graph-retry, etc.)
- `event` — Event type (graph_request, graph_response, graph_retry)
- `request_id` — Unique request ID for correlation
- `status` — HTTP status code
- `duration_ms` — Request latency
- `method` — HTTP method
- `endpoint` — API endpoint path (no query params)

### Filtering Logs
```bash
# Errors only
node dist/index.js 2>&1 | jq 'select(.level >= 50)'

# Graph requests only
node dist/index.js 2>&1 | jq 'select(.event == "graph_response")'

# Slow requests (>5s)
node dist/index.js 2>&1 | jq 'select(.duration_ms > 5000)'
```

**GDPR:** Logs NEVER contain email bodies, subjects, recipients, file contents, or tokens.

---

## Cache Management

The response cache uses LRU eviction with per-resource TTL.

### Cache Metrics
Cache metrics are logged every 5 minutes:
- `cache.size` — Current entries
- `cache.hitRate` — Hit rate percentage
- `cache.hits` / `cache.misses` — Absolute counts

### Cache Invalidation
Write operations (POST/PATCH/DELETE) automatically invalidate related cache entries.

### Clearing Cache
Restart the server to clear the in-memory cache. There is no persistent response cache.

---

## Memory Management

Memory is monitored every 5 minutes with threshold-based alerting:
- **< 80% heap:** Normal (info log)
- **80-90% heap:** Warning (warn log)
- **> 90% heap:** Alert (error log, OOM risk)

### Manual Memory Check
Review the periodic "Memory status" log entries.

---

## Circuit Breaker

The circuit breaker prevents cascading failures when Graph API endpoints are down.

- **CLOSED:** Normal operation
- **OPEN:** Requests blocked (5 failures in 30s triggers this)
- **HALF_OPEN:** Testing with single request (after 60s cooldown)

On success in HALF_OPEN state, circuit resets to CLOSED.

---

## Rate Limiting

Per-user rate limiting: 1000 requests per 15 minutes.

When exceeded, the tool returns a rate limit error with Retry-After information.

---

## Emergency Procedures

### Graceful Shutdown
```bash
# Send SIGTERM (preferred)
kill -TERM <pid>

# Send SIGINT (Ctrl+C)
kill -INT <pid>
```

The server handles both signals: closes MCP connection, flushes logs, exits cleanly.

### Force Restart
```bash
kill -9 <pid>
# Then restart
pnpm build && node dist/index.js
```

### Clear All State
```bash
rm ~/.ms-mcp/token-cache.json   # Clear auth token
# Restart server (clears response cache)
```

### Check Microsoft 365 Service Health
Visit: https://admin.microsoft.com/Adminportal/Home#/servicehealth

### Escalation
1. Check this runbook
2. Check logs for error patterns
3. Check Microsoft 365 service health
4. Contact Pommer IT-Consulting GmbH
