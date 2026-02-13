# Sprint 9.3 — Performance & Real-time

**Phase:** 9 (Complete Microsoft 365 Coverage)
**Goal:** Optimize API performance with caching and enable real-time updates via webhooks (documentation)
**Status:** PLANNED
**Test-Delta:** ~1,225 → ~1,240 (+15 tests)

---

## Features to Implement

### F-9.3.1: Response Caching Layer (Infrastructure)

**Implementation Scope:** In-memory LRU cache with TTL per resource type
**Classification:** performance optimization (infrastructure, no new tools)
**Permission:** Uses existing permissions

**Functionality:**
- Cache GET requests to reduce redundant Graph API calls
- Automatic invalidation on write operations (POST/PATCH/DELETE)
- TTL configuration per resource type (1 hour for user profile, 30 minutes for mail folders, etc.)
- LRU eviction when cache exceeds size limit
- Cache miss/hit metrics for observability

**Implementation Details:**
- Use `lru-cache` npm package for robust LRU implementation
- Cache key format: `${method}:${url}:${userId}`
- Bypass cache for read-only tools with `skip_cache=true` parameter (if needed)
- Middleware integration in Graph client pipeline (before request, after response)
- Invalidation rules:
  - DELETE /resource → Invalidate /resources (list) and /resource/{id} (get)
  - POST /resources → Invalidate /resources (list) only
  - PATCH /resource/{id} → Invalidate /resource/{id} only

**Schema:** None (infrastructure only, no new tool)

**Key Implementation Details:**
- Create `src/utils/cache.ts` with CacheManager class (get, set, invalidate, clear)
- Create `src/middleware/caching-middleware.ts` as Graph client middleware
- Cache TTL config in `src/config/cache-config.ts`:
  - User profile: 1 hour
  - Calendars list: 1 hour
  - Todo lists: 30 minutes
  - Mail folders: 30 minutes
  - Notebooks: 1 hour
  - Presence: 5 minutes (frequently changes)
  - All other GET: 10 minutes (default)
- Max cache size: 500 entries (~50 MB estimated)
- Metrics: Cache hits/misses logged for observability

---

### F-9.3.2: Webhooks / Change Notifications (Documentation Only)

**Implementation Scope:** Documentation and reference implementation patterns
**Classification:** infrastructure (not implemented in Sprint 9.3, requires public endpoint)
**Permission:** Requires all read permissions (Mail.Read, Calendars.Read, etc.)

**Functionality:**
- Subscribe to change notifications for mail, calendar, files, contacts
- Receive real-time updates when resources are created/updated/deleted
- Webhook endpoint must be publicly accessible HTTPS
- Validation and renewal of subscriptions (expire every 3 days)

**NOT Implementing in Phase 9 (Deferred):**
- Webhook endpoint (requires Express server or public infrastructure)
- Subscription management tools (create_subscription, delete_subscription)
- Event persistence/queuing
- SDK helpers for notification processing

**Documentation Scope:**
- Create `docs/WEBHOOKS.md` with:
  - How to set up webhook endpoint (ngrok for dev, public server for prod)
  - Subscription creation via Graph API (manual or CLI)
  - Validation flow (X-MS-Graph-ClientState header)
  - Notification payload examples
  - Change types (created, updated, deleted)
  - Subscription renewal logic (3-day expiration)
  - Best practices for production (secure validation, queue processing)

**Schema:** None (documentation only)

**Key Implementation Details:**
- Graph API subscription endpoints:
  ```
  POST /subscriptions
  {
    "changeType": "created,updated,deleted",
    "notificationUrl": "https://yourdomain.com/webhook",
    "resource": "/me/mailFolders('Inbox')/messages",
    "expirationDateTime": "2026-02-20T00:00:00Z",
    "clientState": "secret-value"
  }
  ```
- Validation: Graph sends GET request with `validationToken` query param
  - Response must echo: `?validationToken={token}`
- Notification payload includes:
  - `value`: Array of notifications
  - `value[].changeType`: created/updated/deleted
  - `value[].resource`: Subscribed resource path
  - `value[].clientState`: Your secret value (validates sender)
- Subscription renewal: Must refresh before 3-day expiration
- Rate limits: ~500 subscriptions per user per app

---

## Test Plan

### Caching Layer (~15 tests)

#### Cache Hits/Misses
- [ ] First GET: Cache miss → call Graph API
- [ ] Second GET (same URL): Cache hit → no Graph API call
- [ ] Cache key includes user_id: Different users don't share cache
- [ ] Cache key includes URL: Different endpoints cached separately

#### TTL Expiration
- [ ] User profile: Expires after 1 hour
- [ ] Mail folders: Expires after 30 minutes
- [ ] Todo lists: Expires after 30 minutes
- [ ] Presence: Expires after 5 minutes
- [ ] Default: Expires after 10 minutes

#### Invalidation on Write
- [ ] POST /messages (send): Invalidate mail folders list cache
- [ ] PATCH /me/events/{id}: Invalidate event detail cache
- [ ] DELETE /me/drive/items/{id}: Invalidate file cache
- [ ] Multiple invalidations: Cascading deletes clean related caches

#### LRU Eviction
- [ ] Cache size limit: 500 entries enforced
- [ ] Oldest entries evicted first (LRU)
- [ ] Recently accessed entries kept (refresh on hit)

#### Metrics
- [ ] Hit rate tracked: Log cache hits/misses
- [ ] Cache size monitored: Track number of entries

### Webhooks Documentation (~0 tests, verification only)

- [ ] WEBHOOKS.md created with all sections
- [ ] Example curl commands for subscription management
- [ ] Validation flow example working
- [ ] Notification payload schema documented
- [ ] Renewal logic pseudocode included
- [ ] Security best practices documented
- [ ] ngrok setup for local testing documented

---

## New Files to Create

| File | Purpose | Estimated LOC |
|---|---|---|
| `src/utils/cache.ts` | LRU cache wrapper with TTL and invalidation | ~200 |
| `src/middleware/caching-middleware.ts` | Graph client middleware for transparent caching | ~150 |
| `src/config/cache-config.ts` | TTL configuration per resource type | ~50 |
| `tests/cache.test.ts` | Cache functionality tests (~15 tests) | ~200 |
| `tests/middleware/caching-middleware.test.ts` | Middleware integration tests | ~150 |
| `docs/WEBHOOKS.md` | Webhook setup guide, examples, best practices | ~300 |

---

## Modified Files

| File | Changes |
|---|---|
| `src/auth/graph-client.ts` | Add caching middleware to request pipeline |
| `src/index.ts` | Initialize cache layer on server startup |
| `package.json` | Add `lru-cache` dependency |

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `createLogger()` | `src/utils/logger.js` | Cache metrics logging |
| `McpToolError` | `src/utils/errors.js` | Cache error handling |

---

## Acceptance Criteria

- [ ] Response caching layer implemented and integrated
- [ ] Cache invalidation rules working correctly
- [ ] TTL per resource type enforced
- [ ] LRU eviction functioning
- [ ] 15 new tests passing (cache hit/miss, TTL, invalidation, eviction)
- [ ] WEBHOOKS.md documentation complete with examples
- [ ] No performance regression in existing tools
- [ ] Cache metrics observable via logs
- [ ] Max cache size limits enforced (500 entries)

---

## Known Limitations & Future Work

1. **Shared Cache:** Single process only. Multi-process deployments (clusters) need distributed cache (Redis).
2. **Cache Bypass:** No user-facing option to skip cache. All GET requests cached automatically.
3. **Partial Invalidation:** Invalidation uses URL matching; complex $select queries may not invalidate correctly.
4. **Webhook Infrastructure:** Requires public HTTPS endpoint. MCP server itself not suitable for webhook receiver.
5. **Subscription Persistence:** No built-in subscription storage. Subscriptions lost on server restart.
6. **Expiration Precision:** TTL rounded to nearest second. Fine-grained millisecond precision not available.
7. **Cross-Tenant Caching:** Cache key includes user_id, but different tenants on same deployment may share cache.

---

## Implementation Notes

### Cache Manager Interface

```typescript
class CacheManager {
  constructor(maxSize = 500);
  get(key: string): CacheEntry | undefined;
  set(key: string, value: unknown, ttlMs: number): void;
  invalidate(pattern: string): void; // Pattern: e.g., "GET:/me/mailFolders/*"
  clear(): void;
  getMetrics(): { hits: number; misses: number; size: number };
}
```

### Caching Middleware Pattern

```typescript
export const cachingMiddleware = (cache: CacheManager): Middleware => {
  return async (context, next) => {
    const cacheKey = `${context.request.method}:${context.request.url}:${context.userId}`;

    // Check cache for GET requests
    if (context.request.method === "GET") {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.info("cache_hit", { url: context.request.url });
        return cached.value;
      }
    }

    // Execute request
    const response = await next();

    // Cache response for GET requests
    if (context.request.method === "GET") {
      const ttl = getTtlForResource(context.request.url);
      cache.set(cacheKey, response, ttl);
    }

    // Invalidate related caches on write
    if (["POST", "PATCH", "DELETE"].includes(context.request.method)) {
      invalidateRelatedCaches(cache, context.request);
    }

    return response;
  };
};
```

### TTL Configuration

```typescript
const CACHE_TTL_MS = {
  userProfile: 60 * 60 * 1000, // 1 hour
  calendars: 60 * 60 * 1000, // 1 hour
  todoLists: 30 * 60 * 1000, // 30 minutes
  mailFolders: 30 * 60 * 1000, // 30 minutes
  notebooks: 60 * 60 * 1000, // 1 hour
  presence: 5 * 60 * 1000, // 5 minutes
  default: 10 * 60 * 1000, // 10 minutes
};

function getTtlForResource(url: string): number {
  if (url.includes("/me/profile")) return CACHE_TTL_MS.userProfile;
  if (url.includes("/me/calendar")) return CACHE_TTL_MS.calendars;
  if (url.includes("/me/todo/lists")) return CACHE_TTL_MS.todoLists;
  if (url.includes("/me/mailFolders")) return CACHE_TTL_MS.mailFolders;
  if (url.includes("/me/onenote/notebooks")) return CACHE_TTL_MS.notebooks;
  if (url.includes("/me/presence")) return CACHE_TTL_MS.presence;
  return CACHE_TTL_MS.default;
}
```

### Webhook Subscription Example (from docs)

```bash
# Create subscription (subscribe to inbox changes)
curl -X POST https://graph.microsoft.com/v1.0/subscriptions \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "changeType": "created,updated,deleted",
    "notificationUrl": "https://yourdomain.com/webhook",
    "resource": "/me/mailFolders('"'"'Inbox'"'"')/messages",
    "expirationDateTime": "2026-02-20T00:00:00Z",
    "clientState": "my-secret-state"
  }'

# Response includes subscription ID and expirationDateTime
# Must renew before expiration (3 days default)
```

### Webhook Validation Flow (pseudocode)

```typescript
app.post("/webhook", async (req, res) => {
  // Initial validation request from Graph
  if (req.query.validationToken) {
    res.send(req.query.validationToken);
    return;
  }

  // Verify client state matches
  const clientState = req.headers["x-ms-graph-clientstate"];
  if (clientState !== "my-secret-state") {
    res.status(401).send("Unauthorized");
    return;
  }

  // Process notifications
  const notifications = req.body.value;
  for (const notif of notifications) {
    await handleChangeNotification(notif);
  }

  res.status(202).send("Accepted");
});
```

---

## Post-Sprint Notes

Sprint 9.3 introduces performance optimizations (caching) and lays groundwork for real-time capabilities (webhooks documentation). Caching is transparent to existing tools—all GET requests automatically benefit. The 15-minute TTL per resource type balances freshness with API rate limit relief. Webhooks are documented but not fully implemented due to infrastructure requirements (public HTTPS endpoint); future implementation will integrate webhook receiver into MCP server or provide standalone endpoint template. Together, these features prepare the platform for production deployment patterns.

