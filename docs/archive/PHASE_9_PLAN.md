# Phase 9: File Attachments, OneNote, Performance & Presence

## Context

Phase 8 complete: 95 tools, 1,127 tests. Phase 9 adds 4 critical features based on PHASE_9_REVIEW.md analysis:

1. **Sprint 9.1:** Large file upload + complete attachment support (4 tools)
2. **Sprint 9.2:** OneNote integration (6 tools)
3. **Sprint 9.3:** Performance optimizations + webhooks (infrastructure)
4. **Sprint 9.4:** Presence API (3 tools)

**Total new tools: ~13** (4 + 6 + 0 + 3)
**Total new features: ~15** (13 tools + caching + webhooks)
**Projected after Phase 9: ~108 tools, ~1,247 tests**

---

## Sprint 9.1 — File Attachments & Large Upload

**Goal:** Resolve 4MB upload limitation, complete attachment type coverage.

**Priority:** HIGH (unblocks common use cases, addresses known limitations from Phases 2-4)

### Prerequisites

**No new scopes required** — uses existing:
- `Mail.ReadWrite` (already granted)
- `Files.ReadWrite` (already granted)

### Schemas (`src/schemas/file-upload.ts`)

```typescript
import { z } from "zod";
import { BaseParams, WriteParams } from "./common.js";

// Resumable upload for files >4MB
export const UploadLargeFileParams = WriteParams.extend({
  folder_id: z.string().optional(), // Defaults to root
  file_name: z.string().min(1).max(255),
  content_bytes: z.string().min(1), // Base64-encoded, can be chunked
  conflict_behavior: z.enum(["fail", "replace", "rename"]).default("fail"),
});

// itemAttachment (embedded Outlook items)
export const AttachItemParams = WriteParams.extend({
  message_id: z.string().min(1),
  item_type: z.enum(["message", "event", "contact"]),
  item_id: z.string().min(1), // ID of the item to embed
  name: z.string().optional(), // Display name
});

// referenceAttachment (OneDrive/SharePoint links)
export const AttachReferenceParams = WriteParams.extend({
  message_id: z.string().min(1),
  file_id: z.string().min(1), // OneDrive/SharePoint item ID
  name: z.string().optional(), // Display name
  permission_type: z.enum(["view", "edit"]).default("view"),
});

// Poll async copy status
export const PollCopyStatusParams = BaseParams.extend({
  monitor_url: z.string().url(), // URL from copy_file response
});
```

### Tools

| Tool | Type | Graph API | Notes |
|---|---|---|---|
| `upload_large_file` | destructive | POST /me/drive/root:/createUploadSession | Resumable upload, supports >4MB, chunked transfer |
| `attach_item` | destructive | POST /me/messages/{id}/attachments | Embed email/event/contact as itemAttachment |
| `attach_reference` | destructive | POST /me/messages/{id}/attachments | Attach OneDrive file as referenceAttachment |
| `poll_copy_status` | safe | GET {monitorUrl} | Check async copy completion, returns status/percentComplete |

### Files

| New File | Purpose |
|---|---|
| `src/schemas/file-upload.ts` | 4 Zod schemas |
| `src/tools/drive-upload-large.ts` | upload_large_file (chunked upload logic) |
| `src/tools/mail-attach-item.ts` | attach_item |
| `src/tools/mail-attach-reference.ts` | attach_reference |
| `src/tools/drive-copy-status.ts` | poll_copy_status |
| `src/utils/upload-session.ts` | Chunking logic, retry handling |
| `tests/drive-upload-large.test.ts` | ~15 tests |
| `tests/mail-attach-item.test.ts` | ~12 tests |
| `tests/mail-attach-reference.test.ts` | ~10 tests |
| `tests/drive-copy-status.test.ts` | ~8 tests |
| `tests/mocks/handlers/upload-session.ts` | MSW handlers for chunked uploads |

| Modified | Change |
|---|---|
| `src/index.ts` | Register 4 new modules |
| `src/utils/response-shaper.ts` | Add upload session to DEFAULT_SELECT if needed |
| `tests/mocks/handlers/index.ts` | Spread uploadSessionHandlers |

### Key Implementation Notes

**upload_large_file:**
- Graph API `createUploadSession` returns uploadUrl
- Upload in chunks (5-10 MB recommended by Graph)
- Retry failed chunks (Graph supports range requests)
- Final response includes driveItem ID
- Requires `Content-Range` header per chunk

**attach_item:**
- Graph API expects `{ "@odata.type": "#microsoft.graph.itemAttachment", item: { ... } }`
- `item` contains the embedded message/event/contact JSON
- Must fetch the source item first via `GET /me/messages/{id}` etc.
- Preview should show source item subject/title

**attach_reference:**
- Graph API expects `{ "@odata.type": "#microsoft.graph.referenceAttachment", ... }`
- Requires `sourceUrl` (OneDrive sharing link) + `providerType: "oneDriveConsumer"`
- Creates sharing link if not exists via `POST /me/drive/items/{id}/createLink`
- Permission type maps to link type (view = "view", edit = "edit")

**poll_copy_status:**
- Monitor URL from `copy_file` response header `Location`
- Returns `{ status: "inProgress"|"completed"|"failed", percentComplete: 0-100 }`
- Status "completed" includes final driveItem in response
- Polling interval: 1-2 seconds recommended

### Utilities

| Utility | Location | Purpose |
|---|---|---|
| `createUploadSession()` | `src/utils/upload-session.ts` | Initiate session, return uploadUrl |
| `uploadChunk()` | `src/utils/upload-session.ts` | Upload single chunk with retry |
| `chunkBuffer()` | `src/utils/upload-session.ts` | Split base64 into chunks |
| `buildItemAttachment()` | `src/tools/mail-attach-item.ts` | Build itemAttachment payload |
| `buildReferenceAttachment()` | `src/tools/mail-attach-reference.ts` | Build referenceAttachment payload |

---

## Sprint 9.2 — OneNote

**Goal:** Complete Microsoft 365 content coverage with OneNote support.

**Priority:** MEDIUM (new module, clear use case for knowledge management)

### Prerequisites

**New scope required:**
- `Notes.ReadWrite` (NEW — requires Azure Portal)

**Steps:**
1. Azure Portal → App registrations → pommer-m365-mcp
2. API permissions → Add → Microsoft Graph → Delegated → `Notes.ReadWrite`
3. Grant admin consent
4. Update `src/auth/msal-client.ts` DEFAULT_SCOPES
5. Re-authenticate: `rm ~/.ms-mcp/token-cache.json && pnpm auth login`

### Schemas (`src/schemas/onenote.ts`)

```typescript
import { z } from "zod";
import { BaseParams, ListParams, WriteParams } from "./common.js";

export const ListNotebooksParams = ListParams;

export const ListSectionsParams = ListParams.extend({
  notebook_id: z.string().min(1),
});

export const ListPagesParams = ListParams.extend({
  section_id: z.string().min(1),
});

export const GetPageContentParams = BaseParams.extend({
  page_id: z.string().min(1),
  include_images: z.boolean().default(false), // Extract images as base64
});

export const CreatePageParams = WriteParams.extend({
  section_id: z.string().min(1),
  title: z.string().min(1).max(255),
  content: z.string().min(1), // HTML content
});

export const SearchNotesParams = ListParams.extend({
  query: z.string().min(1).max(200),
});
```

### Tools

| Tool | Type | Graph API | Notes |
|---|---|---|---|
| `list_notebooks` | safe | GET /me/onenote/notebooks | Returns notebooks with section count |
| `list_sections` | safe | GET /onenote/notebooks/{id}/sections | Sections within a notebook |
| `list_pages` | safe | GET /onenote/sections/{id}/pages | Pages within a section |
| `get_page_content` | safe | GET /onenote/pages/{id}/content | Returns HTML content, optionally extracts images |
| `create_page` | destructive | POST /onenote/sections/{id}/pages | Create new page with HTML content |
| `search_notes` | safe | GET /me/onenote/pages?$search | Full-text search across all notes |

### Files

| New File | Purpose |
|---|---|
| `src/schemas/onenote.ts` | 6 Zod schemas |
| `src/tools/onenote-notebooks.ts` | list_notebooks |
| `src/tools/onenote-sections.ts` | list_sections |
| `src/tools/onenote-pages.ts` | list_pages, get_page_content |
| `src/tools/onenote-create.ts` | create_page |
| `src/tools/onenote-search.ts` | search_notes |
| `tests/onenote-notebooks.test.ts` | ~8 tests |
| `tests/onenote-sections.test.ts` | ~8 tests |
| `tests/onenote-pages.test.ts` | ~15 tests |
| `tests/onenote-create.test.ts` | ~12 tests |
| `tests/onenote-search.test.ts` | ~10 tests |
| `tests/mocks/handlers/onenote.ts` | MSW handlers |

| Modified | Change |
|---|---|
| `src/index.ts` | Register 5 onenote modules |
| `src/utils/response-shaper.ts` | Add notebook, section, page to DEFAULT_SELECT |
| `tests/mocks/handlers/index.ts` | Spread onenoteHandlers |

### Key Implementation Notes

**list_notebooks:**
- Returns `displayName`, `createdDateTime`, `lastModifiedDateTime`, `sectionsUrl`
- Include section count in response if available

**list_sections:**
- Requires notebook_id
- Returns sections with page count

**get_page_content:**
- Graph API returns HTML as `text/html`
- If `include_images: true`, parse HTML for `<img>` tags, fetch image data, embed as base64
- Convert HTML to plain text for MCP response (reuse `htmlToPlainText()` from mail tools)
- Limit content to 10,000 chars (similar to email body limit)

**create_page:**
- Graph API expects `multipart/form-data` with HTML content
- Required HTML structure: `<html><head><title>...</title></head><body>...</body></html>`
- Returns 201 with page ID and contentUrl

**search_notes:**
- Full-text search across all notebooks, sections, pages
- Supports KQL-like syntax
- Returns page snippets with search highlights

### DEFAULT_SELECT Fields

```typescript
notebook: ["id", "displayName", "createdDateTime", "lastModifiedDateTime", "sectionsUrl"],
section: ["id", "displayName", "createdDateTime", "lastModifiedDateTime", "pagesUrl"],
page: ["id", "title", "createdDateTime", "lastModifiedDateTime", "contentUrl", "level"],
```

---

## Sprint 9.3 — Performance & Real-time

**Goal:** Optimize API usage, enable real-time updates via webhooks.

**Priority:** MEDIUM (performance win, infrastructure complexity)

### Prerequisites

**No new scopes required** — uses existing permissions

**Infrastructure required:**
- Public HTTPS endpoint for webhook notifications
- Webhook signature validation
- Subscription renewal logic (Graph subscriptions expire after 3 days)

### Features

#### 1. Response Caching Layer

**Implementation:**
- In-memory LRU cache (use `lru-cache` npm package)
- Cache GET requests only (safe operations)
- TTL per resource type:
  - User profile: 1 hour
  - Calendars list: 1 hour
  - Todo lists: 30 minutes
  - Mail folders: 30 minutes
  - Notebooks: 1 hour
- Cache key: `${method}:${url}:${userId}`
- Invalidate on DELETE/POST/PATCH to same resource

**Files:**
| New File | Purpose |
|---|---|
| `src/utils/cache.ts` | LRU cache wrapper, TTL config |
| `src/middleware/caching-middleware.ts` | Graph client middleware for caching |
| `tests/cache.test.ts` | ~15 tests |

**Modified:**
| File | Change |
|---|---|
| `src/auth/graph-client.ts` | Add caching middleware to pipeline |

#### 2. Webhooks / Change Notifications

**Implementation:**
- Graph API: POST /subscriptions
- Supported resources: messages, events, driveItems
- Change types: created, updated, deleted
- Notification URL: Must be HTTPS, publicly accessible
- Validation: Initial GET with `validationToken` query param
- Signature validation: `X-MS-Graph-ClientState` header

**Not implementing in Phase 9 (requires infrastructure):**
- Webhook endpoint setup (Express server, ngrok for dev)
- Subscription management UI
- Event persistence/queue

**Documentation only:**
Create `docs/WEBHOOKS.md` with:
- How to set up webhook endpoint
- Subscription creation via Graph API
- Validation and renewal logic
- Example payload handling

---

## Sprint 9.4 — Presence

**Goal:** Real-time presence and status management.

**Priority:** LOW (nice-to-have, limited use cases in AI context)

### Prerequisites

**New scope required:**
- `Presence.Read.All` (NEW — requires Azure Portal)

**Steps:**
1. Azure Portal → API permissions → Add → `Presence.Read.All`
2. Grant admin consent
3. Update DEFAULT_SCOPES in `src/auth/msal-client.ts`
4. Re-authenticate

### Schemas (`src/schemas/presence.ts`)

```typescript
import { z } from "zod";
import { BaseParams, WriteParams } from "./common.js";

export const GetMyPresenceParams = BaseParams;

export const GetPresenceParams = BaseParams.extend({
  user_id: z.string().min(1),
});

export const SetStatusMessageParams = WriteParams.extend({
  message: z.string().max(280).optional(), // Optional = clear message
  expires_at: z.string().datetime().optional(), // ISO 8601
});
```

### Tools

| Tool | Type | Graph API | Notes |
|---|---|---|---|
| `get_my_presence` | safe | GET /me/presence | Current user's presence |
| `get_presence` | safe | GET /users/{id}/presence | Another user's presence |
| `set_status_message` | destructive | POST /me/presence/setStatusMessage | Set custom status message |

### Files

| New File | Purpose |
|---|---|
| `src/schemas/presence.ts` | 3 Zod schemas |
| `src/tools/presence.ts` | All 3 presence tools |
| `tests/presence.test.ts` | ~12 tests |
| `tests/mocks/handlers/presence.ts` | MSW handlers |

| Modified | Change |
|---|---|
| `src/index.ts` | Register presence module |
| `src/utils/response-shaper.ts` | Add presence to DEFAULT_SELECT |
| `tests/mocks/handlers/index.ts` | Spread presenceHandlers |

### Key Implementation Notes

**get_presence / get_my_presence:**
- Returns: `availability` (Available, Busy, Away, etc.), `activity` (InACall, InAMeeting, etc.)
- Include `statusMessage` if set
- Format as human-readable string

**set_status_message:**
- Empty `message` clears status
- `expiresAt` optional — defaults to no expiration
- Preview shows current vs new message

### DEFAULT_SELECT Fields

```typescript
presence: ["id", "availability", "activity", "statusMessage"],
```

---

## Verification

### After Each Sprint

```bash
pnpm run lint:fix
pnpm run typecheck
pnpm run test
pnpm run build
```

### E2E Tests

**Sprint 9.1:**
- upload_large_file (10MB test file)
- attach_item (embed email in draft)
- attach_reference (attach OneDrive file)
- poll_copy_status (monitor async copy)

**Sprint 9.2:**
- list_notebooks → list_sections → list_pages → get_page_content → create_page → search_notes

**Sprint 9.3:**
- Cache hit/miss verification (repeat same GET request)
- Webhook documentation review

**Sprint 9.4:**
- get_my_presence → get_presence → set_status_message

---

## Summary

| Sprint | New Tools | New Tests (est.) | New Scopes |
|---|---|---|---|
| 9.1 File Attachments | 4 | ~45 | None |
| 9.2 OneNote | 6 | ~53 | Notes.ReadWrite |
| 9.3 Performance | 0 (infra) | ~15 | None |
| 9.4 Presence | 3 | ~12 | Presence.Read.All |
| **Total** | **13** | **~125** | **2 new scopes** |

**Projected after Phase 9:**
- **~108 tools** (95 + 13)
- **~1,252 tests** (1,127 + 125)
- **Full Microsoft 365 coverage** (Mail, Calendar, Files, Teams, SharePoint, Contacts, Todo, OneNote, Presence)

---

## Implementation Order

1. **Sprint 9.1** (File Attachments) — Highest priority, unblocks use cases
2. **Sprint 9.2** (OneNote) — New module, clear value
3. **Sprint 9.3** (Performance) — Infrastructure, medium complexity
4. **Sprint 9.4** (Presence) — Optional, low priority

Each sprint should be committed separately for clear change tracking.
