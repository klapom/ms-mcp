# Sprint 6.2 — To Do Tools (Retrospective)

**Phase:** 6 (Contacts + To Do)
**Goal:** Implement 7 Microsoft To Do tools
**Status:** COMPLETE
**Test-Delta:** 720 → 752 (+32 tests)

---

## Features Implemented

### F-6.2.1: `list_todo_lists` (Safe)

**Graph API:** GET /me/todo/lists
**Classification:** safe (read-only)
**Permission:** Tasks.Read

**Functionality:**
- List all To Do lists (default + custom)
- Returns list name, type (defaultList, flaggedEmails), sharing status
- Pagination via top/skip

**Schema:** `src/schemas/todo.ts` → `ListTodoListsParams` (extends ListParams)
```typescript
ListTodoListsParams = ListParams;  // Inherits user_id?, top?, skip?
```

**Key Implementation Details:**
- $select: id, displayName, isShared, wellknownListName
- Pagination: top, skip, @odata.nextLink
- Format: "List name | type (defaultList/flaggedEmails)"
- Default lists: "Tasks", "My Day", "Flagged Emails"

---

### F-6.2.2: `get_todo_list` (Safe)

**Graph API:** GET /me/todo/lists/{id}
**Classification:** safe (read-only)
**Permission:** Tasks.Read

**Functionality:**
- Get To Do list details
- Shows list name, type, item count, owner info
- Metadata like creation/modification dates

**Schema:** `src/schemas/todo.ts` → `GetTodoListParams` (extends BaseParams)
```typescript
GetTodoListParams = BaseParams.extend({
  list_id: z.string().min(1).describe("ID of the To Do list"),
})
```

**Key Implementation Details:**
- Extended $select: id, displayName, isShared, wellknownListName, owner (if available)
- Format: structured list details
- Shows owner email + name

---

### F-6.2.3: `list_tasks` (Safe)

**Graph API:** GET /me/todo/lists/{id}/tasks
**Classification:** safe (read-only)
**Permission:** Tasks.Read

**Functionality:**
- List tasks in a To Do list
- Filter by status (notStarted, inProgress, completed, etc.)
- Sort by due date, importance, or custom field
- Returns task summary (title, due date, status, importance)
- Pagination via top/skip

**Schema:** `src/schemas/todo.ts` → `ListTasksParams` (extends ListParams)
```typescript
ListTasksParams = ListParams.extend({
  list_id: z.string().min(1).describe("ID of the To Do list"),
  filter: z.string().optional().describe("OData $filter, e.g. \"status eq 'notStarted'\""),
  orderby: z.string().optional().describe("OData $orderby expression"),
})
```

**Key Implementation Details:**
- $select: id, title, status, importance, dueDateTime, isReminderOn, lastModifiedDateTime
- Pagination: top, skip, @odata.nextLink
- Default sort: dueDateTime ascending (nearest due first)
- Format: "Task | due date | status | importance"

---

### F-6.2.4: `get_task` (Safe)

**Graph API:** GET /me/todo/lists/{id}/tasks/{id}
**Classification:** safe (read-only)
**Permission:** Tasks.Read

**Functionality:**
- Get full task details
- Includes task body (description), all dates, reminders, categories
- Completion details if completed

**Schema:** `src/schemas/todo.ts` → `GetTaskParams` (extends BaseParams)
```typescript
GetTaskParams = BaseParams.extend({
  list_id: z.string().min(1).describe("ID of the To Do list"),
  task_id: z.string().min(1).describe("ID of the task"),
})
```

**Key Implementation Details:**
- Extended $select: id, title, body, status, importance, dueDateTime, reminderDateTime, startDateTime, isReminderOn, createdDateTime, lastModifiedDateTime, completedDateTime, categories
- Format: structured task details with all metadata
- Body HTML → plain text conversion (optional)

---

### F-6.2.5: `create_task` (Destructive)

**Graph API:** POST /me/todo/lists/{id}/tasks
**Classification:** destructive (confirm + idempotency_key)
**Permission:** Tasks.ReadWrite

**Functionality:**
- Create new task in To Do list
- Required: list_id, title
- Optional: body, due date, start date, reminder, status, importance, categories
- Returns new task ID

**Schema:** `src/schemas/todo.ts` → `CreateTaskParams` (extends WriteParams)
```typescript
CreateTaskParams = WriteParams.extend({
  list_id: z.string().min(1),
  title: z.string().min(1).describe("Task title"),
  body: TaskBody.optional().describe("Task body (text or HTML)"),
  due_date_time: DateTimeTimeZone.optional().describe("Due date/time with timezone"),
  reminder_date_time: DateTimeTimeZone.optional(),
  start_date_time: DateTimeTimeZone.optional(),
  importance: z.enum(["low", "normal", "high"]).default("normal"),
  status: z.enum(["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"]).default("notStarted"),
  categories: z.array(z.string()).optional(),
  is_reminder_on: z.boolean().optional(),
})
```

**Key Implementation Details:**
- Request body maps snake_case → camelCase
- Body format: `{ content: "...", contentType: "text|html" }`
- DateTime format: `{ dateTime: "2026-02-15T10:00:00", timeZone: "Europe/Berlin" }`
- Reuses DateTimeTimeZone sub-schema from calendar-write
- Confirmation preview pattern
- Idempotency: prevents duplicate creates

---

### F-6.2.6: `update_task` (Destructive)

**Graph API:** PATCH /me/todo/lists/{id}/tasks/{id}
**Classification:** destructive (confirm + idempotency_key)
**Permission:** Tasks.ReadWrite

**Functionality:**
- Update existing task
- Partial update: only provided fields changed
- Can update title, body, status, dates, importance, reminders, categories
- Returns updated task

**Schema:** `src/schemas/todo.ts` → `UpdateTaskParams` (extends WriteParams)
```typescript
UpdateTaskParams = WriteParams.extend({
  list_id: z.string().min(1),
  task_id: z.string().min(1).describe("ID of the task to update"),
  title: z.string().min(1).optional(),
  body: TaskBody.optional(),
  // ... all task fields optional
})
```

**Key Implementation Details:**
- All fields optional (partial update)
- Only defined fields sent in PATCH
- Confirmation preview: shows changed fields
- Idempotency: same values = safe to retry
- Returns full updated task

---

### F-6.2.7: `delete_task` (Destructive)

**Graph API:** DELETE /me/todo/lists/{id}/tasks/{id}
**Classification:** destructive (confirm + idempotency_key)
**Response:** 204 No Content
**Permission:** Tasks.ReadWrite

**Functionality:**
- Permanently delete task
- Confirmation required
- Idempotency: already deleted = safe (204)

**Schema:** `src/schemas/todo.ts` → `DeleteTaskParams` (extends WriteParams)
```typescript
DeleteTaskParams = WriteParams.extend({
  list_id: z.string().min(1),
  task_id: z.string().min(1).describe("ID of the task to delete"),
})
```

**Key Implementation Details:**
- Request: DELETE with no body
- Response: 204 No Content
- Confirmation preview: shows task title
- Idempotency: already deleted → 204 (safe)

---

## New Files Created

| File | Purpose |
|---|---|
| `src/schemas/todo.ts` | 7 Zod schemas + TaskBody, taskStatusEnum, taskImportanceEnum |
| `src/tools/todo-lists.ts` | list_todo_lists, get_todo_list handlers |
| `src/tools/todo-tasks.ts` | list_tasks, get_task handlers |
| `src/tools/todo-tasks-write.ts` | create_task, update_task, delete_task handlers |
| `tests/todo-lists.test.ts` | 8 tests |
| `tests/todo-tasks.test.ts` | 7 tests |
| `tests/todo-tasks-write.test.ts` | 17 tests |
| `tests/mocks/handlers/todo.ts` | MSW handlers for all 7 To Do endpoints |

---

## Tests Summary

**Total:** 32 new tests

### todo-lists.test.ts (~8 tests)
1. Schema: ListTodoListsParams (basic ListParams)
2. API: list To Do lists
3. Default lists: "Tasks", "My Day", "Flagged Emails"
4. List types: defaultList vs flaggedEmails
5. Pagination: top/skip with @odata.nextLink
6. get_todo_list: full list details
7. Error: 404 list not found
8. Error: 401 unauthorized

### todo-tasks.test.ts (~7 tests)
1. Schema: ListTasksParams (extends ListParams with list_id)
2. API: list tasks in list
3. Filter support: e.g., status eq 'notStarted'
4. Sort support: orderby dueDateTime asc
5. Pagination: top/skip
6. get_task: full task details with all fields
7. Error: 404 task not found

### todo-tasks-write.test.ts (~17 tests)

#### create_task (~6 tests)
1. Schema: list_id + title required
2. API: create task with minimal fields
3. API: create task with all fields (dates, body, importance, status)
4. DateTime format: uses DateTimeTimeZone sub-schema
5. Confirmation + idempotency
6. Status/importance enums respected

#### update_task (~6 tests)
1. Schema: list_id + task_id required, rest optional
2. API: update title only
3. API: update multiple fields
4. Partial update: unchanged fields remain
5. Confirmation preview: shows changed fields
6. Idempotency: same values safe to retry

#### delete_task (~5 tests)
1. Schema: list_id + task_id required
2. API: delete task → 204 No Content
3. Confirmation check
4. Idempotency: already deleted → 204 (safe)
5. Error: 404 task not found

---

## Build + Test Verification

1. ✅ `pnpm build` — all new files compile
2. ✅ `pnpm typecheck` — strict mode clean
3. ✅ `pnpm lint` — Biome clean
4. ✅ `pnpm test` — 720 → 752 (+32 tests)
5. ✅ No regressions in Phase 4/5/6.1 tools
6. ✅ All 7 tools registered in index.ts

---

## MSW Handlers

### list_todo_lists
- GET /me/todo/lists → array of To Do lists

### get_todo_list
- GET /me/todo/lists/{id} → list details

### list_tasks
- GET /me/todo/lists/{id}/tasks → array of tasks
- Supports $filter and $orderby

### get_task
- GET /me/todo/lists/{id}/tasks/{id} → full task details

### create_task
- POST /me/todo/lists/{id}/tasks → 201 Created
- Returns new task with ID

### update_task
- PATCH /me/todo/lists/{id}/tasks/{id} → 200 OK
- Returns updated task

### delete_task
- DELETE /me/todo/lists/{id}/tasks/{id} → 204 No Content

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `ListParams`, `BaseParams`, `WriteParams` | `src/schemas/common.js` | All 7 To Do tools |
| `DateTimeTimeZone` | `src/schemas/calendar-write.js` | create_task, update_task (reused!) |
| `TaskBody` | `src/schemas/todo.js` | create_task, update_task (new sub-schema) |
| `confirmation` | `src/utils/confirmation.js` | create, update, delete |
| `idempotencyCache` | `src/utils/idempotency.js` | create, update, delete |
| `encodeGraphId()` | `src/utils/graph-id.js` | All write tools |
| `DEFAULT_SELECT` | `src/utils/response-shaper.js` | All To Do tools |
| `fetchPage()` | `src/utils/pagination.js` | list_todo_lists, list_tasks |

---

## Acceptance Criteria

- [x] All 7 To Do tools fully implemented + tested
- [x] Destructive tools: confirm + idempotency_key pattern
- [x] Confirmation preview consistent with existing patterns
- [x] DateTimeTimeZone reused from calendar-write (DRY!)
- [x] Task field mapping: snake_case ↔ camelCase
- [x] Task statuses: notStarted, inProgress, completed, waitingOnOthers, deferred
- [x] 32 new tests covering happy path + errors
- [x] No regressions in Phase 4/5/6.1 tools
- [x] All 7 tools registered in index.ts
- [x] Coverage thresholds maintained (60/50/60/60)

---

## Known Limitations & Future Work

1. **Recurring tasks:** Not supported (Graph API requires special handling).
2. **Subtasks:** Not supported (Graph API limitation for this MVP).
3. **Attachments:** Task attachments not supported.
4. **Linked To:** Task linking/dependencies not supported.
5. **Sync:** No change notifications (Phase 9 enhancement).

---

## Phase 6 Summary

**Total Tools Added:** 14 new tools (7 Contacts + 7 To Do)

**Breakdown:**
- Sprint 6.1: Contacts (7 tools) — list_contacts, get_contact, search_contacts, create_contact, update_contact, delete_contact, list_contact_folders
- Sprint 6.2: To Do (7 tools) — list_todo_lists, get_todo_list, list_tasks, get_task, create_task, update_task, delete_task

**Test Coverage:** 688 → 752 (+64 tests)
**Total Tools:** 45 → 59 tools
**Total Tests:** 688 → 752 tests

---

## Post-Sprint Notes

Sprint 6.2 completes Phase 6 and brings the project to 59 total tools with comprehensive coverage across Mail, Calendar, OneDrive, Teams, SharePoint, Contacts, and To Do.

Key design decisions:
- **DateTimeTimeZone reuse:** Imported from calendar-write to maintain consistency
- **Task statuses:** Standard Microsoft To Do status enum (5 values)
- **Partial updates:** All fields optional on update (flexible task management)
- **Body support:** Tasks can have text or HTML bodies (like mail messages)

Phase 7 will add User/Directory access and Mail extensions (new scopes required for User.Read.All, Directory.Read.All).

---

## Overall Project Statistics (After Phase 6)

| Metric | Count |
|---|---|
| Total Tools | 59 |
| Read-Only Tools | 32 |
| Destructive Tools | 27 |
| Test Files | 52 |
| Total Tests | 752 |
| Source Files (src/) | 50+ |
| Utility Modules | 15+ |
| Schema Modules | 10 |
| Handler Files | 12+ |

**Quality Metrics:**
- TypeScript strict mode: ✅ clean
- Biome lint: ✅ clean
- Coverage thresholds: ✅ maintained (60/50/60/60)
- Pre-commit hooks: ✅ passing
- E2E verified: ✅ Phase 5 (Teams/SharePoint)
