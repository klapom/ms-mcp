# Sprint 8.2 — Batch Operations

**Phase:** 8 (Advanced Features)
**Goal:** Implement 5 batch operation tools using Graph $batch endpoint
**Status:** PLANNED
**Test-Delta:** ~905 → ~955 (+50 tests)

---

## Features to Implement

### F-8.2.1: `batch_move_emails` (Destructive)

**Graph API:** POST /$batch
**Classification:** destructive
**Permission:** Mail.ReadWrite

**Functionality:**
- Move multiple emails to a folder in a single API call
- Up to 20 emails per batch (Graph API limit)
- Returns success/failure per email with individual error handling
- Atomic per email (not atomic across batch)
- Destructive safety: confirm + idempotency + preview

**Schema:** `src/schemas/batch-operations.ts` → `BatchMoveEmailsParams` (extends WriteParams)
```typescript
BatchMoveEmailsParams = WriteParams.extend({
  message_ids: z.array(z.string().min(1)).min(1).max(20)
    .describe("Array of email IDs to move (max 20)"),
  destination_folder_id: z.string().min(1).describe("Target folder ID"),
})
```

**Key Implementation Details:**
- POST /$batch with requests array (max 20 items)
- Each request: PATCH /me/messages/{id} with body { parentFolderId: destinationId }
- Response: responses[] array with id, status, body per request
- Preview: "Move 15 emails to folder 'Archive'"
- Idempotency: cache key includes all message_ids (sorted) + destination
- Error handling: partial success (some emails moved, some failed)
- Format: "✓ 18 moved, ✗ 2 failed: [error details]"

---

### F-8.2.2: `batch_delete_emails` (Destructive)

**Graph API:** POST /$batch
**Classification:** destructive
**Permission:** Mail.ReadWrite

**Functionality:**
- Delete multiple emails in a single API call
- Up to 20 emails per batch
- Permanent deletion (no recovery)
- Returns success/failure per email
- Destructive safety: confirm + idempotency + preview with count

**Schema:** `src/schemas/batch-operations.ts` → `BatchDeleteEmailsParams` (extends WriteParams)
```typescript
BatchDeleteEmailsParams = WriteParams.extend({
  message_ids: z.array(z.string().min(1)).min(1).max(20)
    .describe("Array of email IDs to delete (max 20)"),
})
```

**Key Implementation Details:**
- POST /$batch with requests array
- Each request: DELETE /me/messages/{id}
- Response: 204 No Content per successful deletion
- Preview: "⚠️ Permanently delete 12 emails" with warning
- Idempotency: cache key includes all message_ids (sorted)
- Format: "✓ 10 deleted, ✗ 2 failed (not found)"

---

### F-8.2.3: `batch_flag_emails` (Destructive)

**Graph API:** POST /$batch
**Classification:** destructive
**Permission:** Mail.ReadWrite

**Functionality:**
- Flag/unflag multiple emails in a single API call
- Up to 20 emails per batch
- Support flagged/complete/notFlagged statuses
- Optional due date for all emails
- Destructive safety: confirm + idempotency + preview

**Schema:** `src/schemas/batch-operations.ts` → `BatchFlagEmailsParams` (extends WriteParams)
```typescript
BatchFlagEmailsParams = WriteParams.extend({
  message_ids: z.array(z.string().min(1)).min(1).max(20)
    .describe("Array of email IDs to flag (max 20)"),
  flag_status: z.enum(["flagged", "complete", "notFlagged"])
    .describe("Flag status to apply to all emails"),
  due_date: z.string().optional().describe("Due date (ISO 8601, applied to all)"),
})
```

**Key Implementation Details:**
- POST /$batch with requests array
- Each request: PATCH /me/messages/{id} with body { flag: { flagStatus, dueDateTime } }
- Preview: "Set flag status to 'flagged' for 8 emails"
- Idempotency: cache key includes message_ids + flag_status + due_date
- Format: "✓ 8 flagged, ✗ 0 failed"

---

### F-8.2.4: `batch_delete_events` (Destructive)

**Graph API:** POST /$batch
**Classification:** destructive
**Permission:** Calendars.ReadWrite

**Functionality:**
- Delete multiple calendar events in a single API call
- Up to 20 events per batch
- Support sendCancellationNotifications for meeting invites
- Returns success/failure per event
- Destructive safety: confirm + idempotency + preview

**Schema:** `src/schemas/batch-operations.ts` → `BatchDeleteEventsParams` (extends WriteParams)
```typescript
BatchDeleteEventsParams = WriteParams.extend({
  event_ids: z.array(z.string().min(1)).min(1).max(20)
    .describe("Array of event IDs to delete (max 20)"),
  send_cancellation_notifications: z.boolean().default(true)
    .describe("Send meeting cancellation emails"),
})
```

**Key Implementation Details:**
- POST /$batch with requests array
- Each request: DELETE /me/events/{id}
- Preview: "Delete 5 events (cancellation emails: yes)"
- Idempotency: cache key includes event_ids + send_cancellation_notifications
- Format: "✓ 4 deleted, ✗ 1 failed (not found)"

---

### F-8.2.5: `batch_move_files` (Destructive)

**Graph API:** POST /$batch
**Classification:** destructive
**Permission:** Files.ReadWrite

**Functionality:**
- Move multiple OneDrive files/folders to a new location
- Up to 20 items per batch
- Atomic per file (not across batch)
- Returns success/failure per item
- Destructive safety: confirm + idempotency + preview

**Schema:** `src/schemas/batch-operations.ts` → `BatchMoveFilesParams` (extends WriteParams)
```typescript
BatchMoveFilesParams = WriteParams.extend({
  file_ids: z.array(z.string().min(1)).min(1).max(20)
    .describe("Array of file/folder IDs to move (max 20)"),
  destination_folder_id: z.string().min(1).describe("Target folder ID"),
})
```

**Key Implementation Details:**
- POST /$batch with requests array
- Each request: PATCH /me/drive/items/{id} with body { parentReference: { id: destinationId } }
- Preview: "Move 12 files to folder 'Documents/Archive'"
- Idempotency: cache key includes file_ids (sorted) + destination_folder_id
- Format: "✓ 10 moved, ✗ 2 failed (conflict)"

---

## New Files to Create

| File | Purpose | Estimated LOC |
|---|---|---|
| `src/schemas/batch-operations.ts` | 5 Zod schemas for batch tools | ~100 |
| `src/utils/batch.ts` | Graph $batch utility: buildBatchRequest, executeBatch | ~150 |
| `src/tools/batch-mail.ts` | batch_move_emails, batch_delete_emails, batch_flag_emails | ~250 |
| `src/tools/batch-calendar.ts` | batch_delete_events handler | ~120 |
| `src/tools/batch-files.ts` | batch_move_files handler | ~120 |
| `tests/batch-mail.test.ts` | ~18 tests (3 tools) | ~270 |
| `tests/batch-calendar.test.ts` | ~10 tests | ~150 |
| `tests/batch-files.test.ts` | ~10 tests | ~150 |
| `tests/batch.test.ts` | Unit tests for batch utility | ~12 tests (~180 LOC) |
| `tests/mocks/handlers/batch.ts` | MSW handler for POST /$batch | ~200 |

---

## Modified Files

| File | Changes |
|---|---|
| `src/index.ts` | Register 5 new batch tools |
| `tests/mocks/handlers/index.ts` | Spread batchHandlers |

---

## Graph $batch Utility

Create `src/utils/batch.ts`:

```typescript
export interface BatchRequest {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface BatchResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface BatchResult {
  responses: BatchResponse[];
}

export function buildBatchRequest(requests: BatchRequest[]): {
  requests: BatchRequest[];
} {
  if (requests.length > 20) {
    throw new Error("Graph API $batch supports max 20 requests");
  }

  return { requests };
}

export async function executeBatch(
  graphClient: Client,
  requests: BatchRequest[]
): Promise<BatchResult> {
  const batchBody = buildBatchRequest(requests);
  const result = await graphClient.api("/$batch").post(batchBody);
  return result as BatchResult;
}

export interface BatchSummary {
  successCount: number;
  failureCount: number;
  failures: Array<{ id: string; status: number; error?: string }>;
}

export function summarizeBatchResult(result: BatchResult): BatchSummary {
  const failures: Array<{ id: string; status: number; error?: string }> = [];
  let successCount = 0;

  for (const response of result.responses) {
    if (response.status >= 200 && response.status < 300) {
      successCount++;
    } else {
      failures.push({
        id: response.id,
        status: response.status,
        error: typeof response.body === "object" && response.body !== null
          ? (response.body as { error?: { message?: string } }).error?.message
          : undefined
      });
    }
  }

  return {
    successCount,
    failureCount: failures.length,
    failures
  };
}
```

---

## MSW Handlers

### POST /$batch
- Accept `{ requests: BatchRequest[] }` body
- Validate: max 20 requests
- Process each request:
  - Extract method + url + body
  - Simulate individual Graph API call
  - Return response with id, status, body
- Return `{ responses: BatchResponse[] }`
- Simulate partial failures (some requests succeed, some fail)

**Example batch request:**
```json
{
  "requests": [
    {
      "id": "1",
      "method": "PATCH",
      "url": "/me/messages/msg1",
      "body": { "parentFolderId": "folder-archive" }
    },
    {
      "id": "2",
      "method": "DELETE",
      "url": "/me/messages/msg2"
    }
  ]
}
```

**Example batch response:**
```json
{
  "responses": [
    {
      "id": "1",
      "status": 200,
      "body": { "id": "msg1", "parentFolderId": "folder-archive" }
    },
    {
      "id": "2",
      "status": 404,
      "body": { "error": { "code": "ErrorItemNotFound", "message": "Item not found" } }
    }
  ]
}
```

---

## Tests Summary

**Total:** ~50 new tests across 4 test files

### batch-mail.test.ts (~18 tests)

**batch_move_emails:**
1. Schema: message_ids array required (min 1, max 20)
2. Schema: destination_folder_id required
3. Preview: confirm=false shows summary
4. API: move 5 emails successfully
5. Partial success: 3 succeeded, 2 failed (not found)
6. Idempotency: duplicate key returns cached result
7. Format: "✓ X moved, ✗ Y failed"
8. Error: >20 emails rejected

**batch_delete_emails:**
9. Schema: message_ids array required
10. Preview: shows warning + count
11. API: delete 10 emails successfully
12. Partial success: 8 succeeded, 2 failed
13. Idempotency: cached after first execution
14. Format: "✓ X deleted, ✗ Y failed"

**batch_flag_emails:**
15. Schema: flag_status required
16. Preview: shows flag status + count
17. API: flag 15 emails successfully
18. Partial success with failures

### batch-calendar.test.ts (~10 tests)
1. Schema: event_ids required (max 20)
2. Schema: send_cancellation_notifications default true
3. Preview: shows count + notification status
4. API: delete 8 events successfully
5. Partial success: 6 succeeded, 2 failed
6. Cancellation emails sent
7. Cancellation emails suppressed (false)
8. Idempotency: cached result
9. Format: "✓ X deleted, ✗ Y failed"
10. Error: event not found

### batch-files.test.ts (~10 tests)
1. Schema: file_ids required (max 20)
2. Schema: destination_folder_id required
3. Preview: shows count + destination
4. API: move 12 files successfully
5. Partial success: 10 succeeded, 2 failed (conflict)
6. Idempotency: cached result
7. Format: "✓ X moved, ✗ Y failed"
8. Error: destination folder not found
9. Error: circular reference (folder into itself)
10. Error: permission denied

### batch.test.ts (~12 tests)
1. buildBatchRequest: creates valid structure
2. buildBatchRequest: rejects >20 requests
3. executeBatch: makes POST /$batch call
4. executeBatch: returns responses array
5. summarizeBatchResult: counts successes (2xx status)
6. summarizeBatchResult: counts failures (4xx/5xx)
7. summarizeBatchResult: extracts error messages
8. summarizeBatchResult: handles empty responses
9. Batch request IDs: sequential numbering
10. Batch request URLs: properly formatted
11. Batch error handling: individual request failures
12. Batch atomicity: partial success allowed

---

## Build + Test Verification

- [ ] `pnpm build` — all new files compile
- [ ] `pnpm typecheck` — strict mode clean
- [ ] `pnpm lint` — Biome clean (extract helpers if complexity >15)
- [ ] `pnpm test` — 905 → 955 (+50 tests)
- [ ] No regressions in existing tools
- [ ] All 5 batch tools registered in index.ts
- [ ] Batch utility unit tested

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `WriteParams` | `src/schemas/common.ts` | All 5 batch tools |
| `checkConfirmation()` | `src/utils/confirmation.ts` | All batch tools |
| `idempotencyCache` | `src/utils/idempotency.ts` | All batch tools |
| `encodeGraphId()` | `src/utils/graph-id.ts` | URL encoding in batch requests |
| `createLogger()` | `src/utils/logger.ts` | All batch tools |
| `McpToolError` | `src/utils/errors.ts` | Error handling |

---

## Acceptance Criteria

- [ ] All 5 batch operation tools fully implemented + tested
- [ ] Graph $batch utility created and unit tested
- [ ] Partial success handling: some requests succeed, some fail
- [ ] Idempotency working for batch operations
- [ ] 50 new tests covering happy path + partial failures + errors
- [ ] No regressions in existing tools
- [ ] Documentation updated: TOOLS.md, PERMISSIONS.md
- [ ] E2E tests: batch_move_emails, batch_delete_events

---

## Known Limitations & Future Work

1. **Max 20 Requests:** Graph API $batch limit. For larger batches, split into multiple calls.
2. **No Cross-Workload Batching:** Cannot mix Mail + Calendar + Files in single batch (Graph limitation).
3. **Not Atomic:** Batch is atomic per request, not across the batch. Partial success is common.
4. **No Dependency Between Requests:** Requests execute independently. Cannot reference result of request 1 in request 2.
5. **Rate Limiting:** Batch counts as 1 call for throttling, but processes N operations. Still subject to per-resource limits.

---

## Implementation Notes

### Batch Request Flow

1. **Preview (confirm=false):**
   - Show count: "Move 15 emails to folder 'Archive'"
   - No API calls

2. **Confirm + Idempotency Check:**
   - Build idempotency key: `batch_move_emails:${message_ids.sort().join(",")}:${destination_folder_id}:${user_id}`
   - Check cache: if hit, return cached result
   - If miss, proceed

3. **Execute Batch:**
   - Build batch requests array (max 20)
   - POST /$batch
   - Parse responses array
   - Summarize: success count, failure count, error details

4. **Cache Result:**
   - Store summary in idempotency cache
   - Return formatted result

### Error Handling

**HTTP 413 Payload Too Large:**
- Batch request exceeds size limit (rare, usually >100 KB)
- Mitigation: reduce batch size

**HTTP 429 Too Many Requests:**
- Rate limit exceeded
- Mitigation: exponential backoff, retry after X seconds

**Partial Success:**
- Some requests succeed (2xx), some fail (4xx/5xx)
- Format: "✓ 18 moved, ✗ 2 failed: msg-123 (404 Not Found), msg-456 (403 Forbidden)"
- Tool returns success with warning, not error

---

## Post-Sprint Notes

Sprint 8.2 enables bulk operations via Graph $batch endpoint, significantly reducing API calls for multi-item operations. The batch utility is designed to be generic and reusable across all Graph API resource types.

Key insight: Partial success is the norm, not the exception. Tools must clearly communicate which items succeeded and which failed, with error details for failed items.

Performance note: Batch operations count as 1 throttle unit but perform N operations. This is beneficial for avoiding per-call throttling but does not bypass per-resource rate limits.
