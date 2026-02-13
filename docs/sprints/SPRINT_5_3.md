# Sprint 5.3 — SharePoint Write Tools (Retrospective)

**Phase:** 5 (Teams + SharePoint)
**Goal:** Implement 3 SharePoint list item CRUD tools
**Status:** COMPLETE
**Test-Delta:** 655 → 688 (+33 tests)

---

## Features Implemented

### F-5.3.1: `create_list_item` (Destructive)

**Graph API:** POST /sites/{id}/lists/{id}/items
**Classification:** destructive (confirm + idempotency_key)
**Permission:** Sites.ReadWrite.All

**Functionality:**
- Create new item in SharePoint list
- Set field values via fields JSON object
- Returns new item ID
- Idempotency: prevents duplicate creates

**Schema:** `src/schemas/sharepoint.ts` → `CreateListItemParams` (extends WriteParams)
```typescript
CreateListItemParams = WriteParams.extend({
  site_id: z.string().min(1).describe("SharePoint site ID"),
  list_id: z.string().min(1).describe("SharePoint list ID"),
  fields: z.record(z.string(), z.unknown()).describe("Field values as JSON object"),
})
```

**Key Implementation Details:**
- Request body: `{ fields: { field1: value1, field2: value2, ... } }`
- Field names must match list schema (no validation server-side in MVP)
- Confirmation preview pattern
- Idempotency: prevents duplicate item creation
- Returns created item ID + fields

**Field Examples:**
```json
{
  "Title": "New Project",
  "Status": "In Progress",
  "DueDate": "2026-03-15",
  "Budget": 50000
}
```

---

### F-5.3.2: `update_list_item` (Destructive)

**Graph API:** PATCH /sites/{id}/lists/{id}/items/{id}
**Classification:** destructive (confirm + idempotency_key)
**Permission:** Sites.ReadWrite.All

**Functionality:**
- Update existing list item fields
- Partial update: only provided fields changed
- Returns updated item with all fields
- Idempotency: safe to retry with same values

**Schema:** `src/schemas/sharepoint.ts` → `UpdateListItemParams` (extends WriteParams)
```typescript
UpdateListItemParams = WriteParams.extend({
  site_id: z.string().min(1),
  list_id: z.string().min(1),
  item_id: z.string().min(1).describe("SharePoint list item ID"),
  fields: z.record(z.string(), z.unknown()).describe("Fields to update"),
})
```

**Key Implementation Details:**
- Request body: `{ fields: { ... } }` — only changed fields
- Partial update: missing fields remain unchanged
- Confirmation preview: shows item_id + changed fields
- Returns updated item with all fields
- Idempotency: same values = safe to retry

---

### F-5.3.3: `delete_list_item` (Destructive)

**Graph API:** DELETE /sites/{id}/lists/{id}/items/{id}
**Classification:** destructive (confirm + idempotency_key)
**Response:** 204 No Content
**Permission:** Sites.ReadWrite.All

**Functionality:**
- Delete item from SharePoint list
- Soft delete (moved to recycle bin, recoverable)
- Confirmation required
- Idempotency: already deleted = safe to retry (204)

**Schema:** `src/schemas/sharepoint.ts` → `DeleteListItemParams` (extends WriteParams)
```typescript
DeleteListItemParams = WriteParams.extend({
  site_id: z.string().min(1),
  list_id: z.string().min(1),
  item_id: z.string().min(1).describe("SharePoint list item ID"),
})
```

**Key Implementation Details:**
- Request: DELETE with no body
- Response: 204 No Content (no item returned)
- Confirmation preview: shows item being deleted
- Idempotency: already deleted → 204 (no error)
- Items moved to recycle bin (soft delete, not permanent)

---

## New Files Created

| File | Purpose |
|---|---|
| `src/schemas/sharepoint.ts` | Add 3 write schemas (extends existing) |
| `src/tools/sharepoint-list-write.ts` | create_list_item, update_list_item, delete_list_item handlers |
| `tests/sharepoint-list-write.test.ts` | 33 tests (create, update, delete, errors) |
| `tests/mocks/handlers/sharepoint-list-write.ts` | MSW handlers for list item CRUD |

---

## Modified Files

| File | Changes |
|---|---|
| `src/index.ts` | Register 3 new tools |
| `src/schemas/sharepoint.ts` | Add CreateListItemParams, UpdateListItemParams, DeleteListItemParams |
| `tests/mocks/handlers/index.ts` | Spread sharepoint-list-write handlers |

---

## Tests Summary

**Total:** 33 new tests

### sharepoint-list-write.test.ts

#### create_list_item (~11 tests)
1. Schema: site_id, list_id, fields required
2. API: create item with simple fields (text, number)
3. API: create item with date field
4. Field types: Title, Status, Budget (various types)
5. Returns created item ID
6. Confirmation preview pattern
7. Idempotency: duplicate create prevented
8. Error: 400 invalid field name
9. Error: 403 permission denied
10. Error: 404 list not found
11. Empty fields object → validation error

#### update_list_item (~11 tests)
1. Schema: site_id, list_id, item_id, fields required
2. API: update single field
3. API: update multiple fields
4. Partial update: only changed fields sent
5. Returns updated item with all fields
6. Confirmation preview: shows changed fields
7. Idempotency: same values = safe to retry
8. Error: 404 item not found
9. Error: 403 permission denied
10. Error: 400 invalid field value
11. Non-existent field → graceful handling

#### delete_list_item (~11 tests)
1. Schema: site_id, list_id, item_id required
2. API: delete item → 204 No Content
3. Confirmation preview: shows item_id
4. Idempotency: already deleted → 204 (safe)
5. Soft delete: item goes to recycle bin
6. Error: 404 item already deleted (idempotent)
7. Error: 403 permission denied
8. Error: 409 item locked
9. Confirmation check required
10. User message: item deleted
11. No item returned (204 No Content)

---

## Build + Test Verification

1. ✅ `pnpm build` — all new files compile
2. ✅ `pnpm typecheck` — strict mode clean
3. ✅ `pnpm lint` — Biome clean
4. ✅ `pnpm test` — 655 → 688 (+33 tests)
5. ✅ No regressions in Phase 4/5.1/5.2 tools
6. ✅ All 3 tools registered in index.ts

---

## MSW Handlers

### create_list_item
- POST /sites/{siteId}/lists/{listId}/items → 201 Created
- Returns new item with id + fields
- Handles field type validation

### update_list_item
- PATCH /sites/{siteId}/lists/{listId}/items/{itemId} → 200 OK
- Returns updated item with all fields
- Supports partial updates

### delete_list_item
- DELETE /sites/{siteId}/lists/{listId}/items/{itemId} → 204 No Content
- No response body
- Simulates soft delete (recycle bin)

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `WriteParams` | `src/schemas/common.ts` | All 3 write tools |
| `confirmation` | `src/utils/confirmation.ts` | All 3 write tools |
| `idempotencyCache` | `src/utils/idempotency.ts` | All 3 write tools |
| `encodeGraphId()` | `src/utils/graph-id.ts` | All write tools (site/list/item IDs) |
| `McpToolError` | `src/utils/errors.js` | All write tools (error handling) |

---

## Acceptance Criteria

- [x] All 3 SharePoint list write tools fully implemented + tested
- [x] Destructive tools: confirm + idempotency_key pattern
- [x] Confirmation preview consistent with Mail/Calendar/Drive/Teams
- [x] create_list_item: idempotency prevents duplicates
- [x] update_list_item: partial updates only change specified fields
- [x] delete_list_item: 204 No Content response handling
- [x] 33 new tests covering happy path + errors + edge cases
- [x] No regressions in existing tools
- [x] All 3 tools registered in index.ts
- [x] Coverage thresholds maintained (60/50/60/60)

---

## Known Limitations & Future Work

1. **Field validation:** MVP doesn't validate field names/types against list schema (client receives Graph API errors)
2. **Recurrence:** Recurring events/items not supported (requires special Graph handling)
3. **Attachments:** List item attachments not supported (future enhancement)
4. **Lookups:** Complex field types (lookups, choice sets) not validated (MVP)

---

## Phase 5 Summary

**Total Tools Added:** 16 new tools (5 Teams read + 3 Teams write + 8 SharePoint)

**Breakdown:**
- Sprint 5.1: Teams read (5 tools) — list_teams, list_channels, list_channel_messages, list_chats, list_chat_messages
- Sprint 5.2: Teams write + SharePoint read (8 tools) — send_channel_message, reply_to_channel_message, send_chat_message, search_sites, get_site, list_site_drives, list_site_lists, list_list_items
- Sprint 5.3: SharePoint write (3 tools) — create_list_item, update_list_item, delete_list_item

**Test Coverage:** 591 → 688 (+97 tests)
**Total Tools:** 29 → 45 tools
**Total Tests:** 591 → 688 tests

---

## Post-Sprint Notes

Sprint 5.3 completes Phase 5 implementation. The SharePoint list item CRUD operations follow the established destructive safety pattern and integrate seamlessly with the read tools from Sprints 5.1 and 5.2.

Key design decisions:
- **Field handling:** Fields passed as JSON object (flexible, but requires knowledge of list schema)
- **Partial updates:** Only specified fields are changed (idempotent design)
- **Soft delete:** Items go to recycle bin (user-recoverable), not permanent deletion
- **Idempotency:** All write operations support retry safely

Phase 6 will focus on Contacts and To Do modules (different scopes, independent from Teams/SharePoint).
