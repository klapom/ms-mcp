# Sprint 4.2 — OneDrive Read Tools (Retrospective)

**Phase:** 4 (OneDrive + TD Cleanup)
**Goal:** Implement 5 read-only OneDrive file tools
**Status:** COMPLETE
**Test-Delta:** 521 → 556 (+35 tests in 5 test files)

---

## Features Implemented

### F-4.2.1: `list_files` (Safe)

**Graph API:** GET /me/drive/root/children or /me/drive/items/{id}/children
**Classification:** safe (read-only)
**Permission:** Files.Read

**Functionality:**
- List files and folders in OneDrive with pagination
- Support path-based access (e.g., `/Documents/Projects`) or folder ID
- Filter by folder_id OR path (mutually exclusive)
- Return to root if neither specified
- Format output: [File/Folder] name | size | lastModifiedDateTime

**Schema:** `src/schemas/files.ts` → `ListFilesParams` (extends ListParams)
```typescript
ListFilesParams = ListParams.extend({
  folder_id: z.string().optional().describe("Folder ID to list children of"),
  path: z.string().optional().describe("Folder path (e.g. '/Documents'). Mutually exclusive with folder_id"),
  site_id: z.string().optional().describe("SharePoint site ID (Phase 5+)"),
  drive_id: z.string().optional().describe("Drive ID within a SharePoint site (Phase 5+)"),
})
```

**Key Implementation Details:**
- Mutually exclusive validation: folder_id XOR path
- resolveDrivePath() utility for multi-tenant support
- formatFileSize() utility for human-readable sizes
- Default $select fields: id, name, size, lastModifiedDateTime, webUrl, folder
- Pagination via top/skip with @odata.nextLink

---

### F-4.2.2: `search_files` (Safe)

**Graph API:** GET /me/drive/root/search(q='{query}')
**Classification:** safe (read-only)
**Permission:** Files.Read

**Functionality:**
- Full-text search across file names and properties
- Search recursively through entire drive
- Query parameter accepts partial file names, content keywords
- Supports optional filtering via $filter
- Returns matching items with metadata

**Schema:** `src/schemas/files.ts` → `SearchFilesParams` (extends ListParams)
```typescript
SearchFilesParams = ListParams.extend({
  query: z.string().min(1).max(500).describe("Search query (partial file names, keywords)"),
  site_id: z.string().optional(),
  drive_id: z.string().optional(),
})
```

**Key Implementation Details:**
- Search encoded properly in URL: `/search(q='{encodeURIComponent(query)}')`
- Returns ALL matches (pagination handles large result sets)
- Returns: name, id, webUrl, size, lastModifiedDateTime, folder indicator

---

### F-4.2.3: `get_file_metadata` (Safe)

**Graph API:** GET /me/drive/items/{id}
**Classification:** safe (read-only)
**Permission:** Files.Read

**Functionality:**
- Retrieve full metadata for a single file or folder
- Includes creation/modification dates, owner, sharing info
- Shows MIME type for files
- Shows file size, folder item count

**Schema:** `src/schemas/files.ts` → `GetFileMetadataParams` (extends BaseParams)
```typescript
GetFileMetadataParams = BaseParams.extend({
  file_id: z.string().min(1).describe("ID of the file or folder"),
  site_id: z.string().optional(),
  drive_id: z.string().optional(),
})
```

**Key Implementation Details:**
- Extensive $select: id, name, size, webUrl, lastModifiedDateTime, createdDateTime,
  createdBy, lastModifiedBy, mimeType, folder, parentReference, shared
- formatMetadataDetail() helper for structured output
- Shows creator/modifier full details (displayName, email)

---

### F-4.2.4: `download_file` (Safe)

**Graph API:** GET /me/drive/items/{id}/content
**Classification:** safe (read-only)
**Permission:** Files.Read
**Limitation:** Max file size 10 MB (shows warning at 4 MB)

**Functionality:**
- Download file content with size validation
- Returns base64-encoded content for binary files
- Returns UTF-8 plain text for text files (.txt, .json, .csv, .md, etc.)
- Rejects downloads > 10 MB
- Shows warning for files > 4 MB

**Schema:** `src/schemas/files.ts` → `DownloadFileParams` (extends BaseParams)
```typescript
DownloadFileParams = BaseParams.extend({
  file_id: z.string().min(1).describe("ID of the file to download"),
  site_id: z.string().optional(),
  drive_id: z.string().optional(),
})
```

**Key Implementation Details:**
- Two-step process: metadata check → size validation → download
- isTextContent() utility detects file type from MIME type
- Size boundaries:
  - <= 4 MB: no warning, full download
  - 4–10 MB: warning + download
  - > 10 MB: abort with error
- Uses `Content-Type` header from metadata to determine text vs binary

---

### F-4.2.5: `get_recent_files` (Safe)

**Graph API:** GET /me/drive/recent
**Classification:** safe (read-only)
**Permission:** Files.Read

**Functionality:**
- List recently accessed/modified files (last 25 by default)
- No filter/search — returns fixed set ordered by recency
- Pagination via top/skip

**Schema:** `src/schemas/files.ts` → `GetRecentFilesParams` (extends ListParams)
```typescript
GetRecentFilesParams = ListParams.extend({
  site_id: z.string().optional(),
  drive_id: z.string().optional(),
})
```

**Key Implementation Details:**
- Simple endpoint (no $filter/$search support)
- Returns same fields as list_files
- Useful for quick access to recently touched files
- Lighter than list_files (no path traversal needed)

---

## New Files Created

| File | Purpose |
|---|---|
| `src/schemas/files.ts` | 5 Zod schemas for OneDrive read tools |
| `src/tools/drive-list.ts` | list_files + get_recent_files handlers |
| `src/tools/drive-search.ts` | search_files handler |
| `src/tools/drive-metadata.ts` | get_file_metadata handler |
| `src/tools/drive-download.ts` | download_file handler + two-step validation |
| `tests/drive-list.test.ts` | 8 tests (list_files + get_recent_files) |
| `tests/drive-search.test.ts` | 7 tests (search_files) |
| `tests/drive-metadata.test.ts` | 6 tests (get_file_metadata) |
| `tests/drive-download.test.ts` | 9 tests (file size validation, text vs binary) |
| `tests/drive-recent.test.ts` | 5 tests (get_recent_files) |
| `tests/mocks/handlers/drive.ts` | MSW handlers for all 5 OneDrive read endpoints |

---

## Modified Files

| File | Changes |
|---|---|
| `src/utils/file-size.ts` | NEW: formatFileSize(), isTextContent() utilities |
| `src/utils/drive-path.ts` | NEW: resolveDrivePath() for multi-drive support |
| `src/index.ts` | Register 5 new tools (list_files, search_files, get_file_metadata, download_file, get_recent_files) |
| `src/utils/response-shaper.ts` | Added DEFAULT_SELECT.file, DEFAULT_SELECT.fileDetail |
| `tests/mocks/handlers/index.ts` | Spread drive handlers alongside existing handlers |

---

## MSW Handlers

### list_files
- GET /me/drive/root/children → array of files + folders with pagination
- GET /me/drive/items/{id}/children → folder contents
- GET /me/drive/root:/{path}:/children → path-based listing
- GET /users/{userId}/drive/root/children → multi-tenant

### search_files
- GET /me/drive/root/search(q='{query}') → search results
- GET /me/drive/root/search(q='nonexistent') → empty array
- Handles URL encoding of search query

### get_file_metadata
- GET /me/drive/items/{id} → full metadata with creator/modifier details
- Returns both file and folder metadata
- Includes mimeType, size, sharing info

### download_file
- GET /me/drive/items/{id}/content → file binary content
- 200 OK with Content-Type header matching file type
- Headers: Content-Length, Last-Modified, ETag

### get_recent_files
- GET /me/drive/recent → array of recent items
- Returns up to 25 items ordered by recency
- Pagination support via top/skip

---

## Tests Summary

**Total:** 35 new tests across 5 test files

### drive-list.test.ts (~8 tests)
1. Schema: folder_id, path, top, skip validation
2. Mutually exclusive: folder_id XOR path
3. API: list root folder children
4. API: list folder by ID
5. API: list folder by path
6. Pagination: top=2 → nextLink present
7. Formatting: [File]/[Folder] prefix, size display
8. Error: 404 folder not found

### drive-search.test.ts (~7 tests)
1. Schema: query required (min 1), max 500
2. API: search by filename
3. API: search by keyword
4. Empty results: query="nonexistent"
5. URL encoding: special characters in query
6. Pagination: large result set with nextLink
7. Error: 400 invalid query

### drive-metadata.test.ts (~6 tests)
1. Schema: file_id required
2. API: get file metadata
3. API: get folder metadata
4. Details: includes creator/modifier info
5. Details: includes mimeType, sharing, webUrl
6. Error: 404 file not found

### drive-download.test.ts (~9 tests)
1. Schema: file_id required
2. Size validation: <= 4 MB no warning
3. Size validation: 4–10 MB with warning
4. Size validation: > 10 MB rejected
5. Text detection: .txt/.json/.csv as plaintext
6. Binary detection: .pdf/.zip/.png as base64
7. Content encoding: text returns UTF-8, binary returns base64
8. Two-step: metadata → size check → download
9. Error: 403 permission denied

### drive-recent.test.ts (~5 tests)
1. Schema: top/skip optional, defaults respected
2. API: list recent files
3. Pagination: recent + pagination parameters
4. Ordering: results ordered by recency (newest first)
5. Error: 401 authentication required

---

## Build + Test Verification

1. ✅ `pnpm build` — all new files compile (no errors, no warnings)
2. ✅ `pnpm typecheck` — strict TypeScript mode clean
3. ✅ `pnpm lint` — Biome clean (formatFileSize, resolveDrivePath extracted for complexity)
4. ✅ `pnpm test` — 521 → 556 (+35 tests)
5. ✅ No regressions in calendar/mail tests
6. ✅ All 5 tools registered in index.ts
7. ✅ File size utilities shared with mail attachment tools

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `ListParams`, `BaseParams` | `src/schemas/common.ts` | All 5 OneDrive tools |
| `formatFileSize()` | `src/utils/file-size.ts` | list_files, drive-metadata, download_file |
| `isTextContent()` | `src/utils/file-size.ts` | download_file |
| `resolveDrivePath()` | `src/utils/drive-path.ts` | list_files, search_files (Phase 5+) |
| `encodeGraphId()` | `src/utils/graph-id.ts` | All OneDrive tools for folder/file IDs |
| `DEFAULT_SELECT` | `src/utils/response-shaper.ts` | All OneDrive tools |
| `fetchPage()` | `src/utils/pagination.ts` | list_files, search_files, get_recent_files |

---

## Acceptance Criteria

- [x] All 5 read-only tools (list_files, search_files, get_file_metadata, download_file, get_recent_files) fully implemented + tested
- [x] File size validation: 4 MB warning, 10 MB limit enforced
- [x] Text vs binary detection working correctly for common file types
- [x] Multi-tenant support: site_id + drive_id parameters for SharePoint (Phase 5 prep)
- [x] Pagination: all list tools support top/skip with @odata.nextLink
- [x] 35 new tests covering happy path + errors + edge cases
- [x] No regressions in existing mail/calendar tools
- [x] File size and text content utilities properly exported for mail tools
- [x] Coverage thresholds maintained (60/50/60/60)

---

## Known Limitations & Future Work

1. **Max download size (10 MB):** For larger files, users should use direct Graph API or web UI. This is a deliberate limitation to prevent context overflow.
2. **Text encoding detection:** Currently relies on MIME type. Future: sniff file headers for robustness.
3. **Folder-only APIs:** create_folder, move_file, copy_file, share_file are Phase 4.3 (write tools).
4. **SharePoint drive paths:** Full support deferred to Phase 5 (Teams + SharePoint sprint). Current implementation prepares foundation.

---

## Post-Sprint Notes

This sprint established the read-only OneDrive tooling foundation. The file size validation pattern (4 MB warning / 10 MB limit) is reused from mail attachments, and the text/binary detection is a significant quality-of-life improvement for users. The utilities (file-size, drive-path) are designed to be extended in Phase 4.3 (write tools) and Phase 5 (SharePoint integration).

All MSW handlers use RegExp patterns to support both OneDrive and SharePoint paths, preventing route ambiguity.
