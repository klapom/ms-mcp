# Sprint 9.1 — File Attachments & Large Upload

**Phase:** 9 (Complete Microsoft 365 Coverage)
**Goal:** Resolve 4MB upload limitation, complete attachment type coverage (itemAttachment, referenceAttachment)
**Status:** PLANNED
**Test-Delta:** ~1,127 → ~1,172 (+45 tests)

---

## Features to Implement

### F-9.1.1: `upload_large_file` (Destructive)

**Graph API:** POST /me/drive/items/{parentId}:/{fileName}:/createUploadSession
**Classification:** destructive (write, creates file)
**Permission:** Files.ReadWrite

**Functionality:**
- Resumable upload for files larger than 4 MB
- Chunked transfer with automatic retry for failed chunks
- Support conflict resolution (fail, replace, rename)
- Progress tracking via chunk status
- Example: Upload 10MB video to OneDrive

**Schema:** `src/schemas/file-upload.ts` → `UploadLargeFileParams` (extends WriteParams)
```typescript
UploadLargeFileParams = WriteParams.extend({
  folder_id: z.string().optional().describe("Target folder ID (default: root)"),
  file_name: z.string().min(1).max(255).describe("Name of file to create"),
  content_bytes: z.string().min(1).describe("Base64-encoded file content"),
  conflict_behavior: z.enum(["fail", "replace", "rename"]).default("fail").describe("How to handle existing file"),
})
```

**Key Implementation Details:**
- POST /me/drive/items/{folderId}:/{fileName}:/createUploadSession returns uploadUrl
- Split content into chunks (5-10 MB recommended per Graph API docs)
- Upload chunks sequentially via PUT with Content-Range header
- Retry failed chunks (Graph API supports range requests for resumption)
- Final response includes new driveItem ID and metadata
- Utility: `src/utils/upload-session.ts` with createUploadSession(), uploadChunk(), chunkBuffer()
- Store upload session state for recovery between requests

---

### F-9.1.2: `attach_item` (Destructive)

**Graph API:** POST /me/messages/{id}/attachments
**Classification:** destructive (write, modifies message)
**Permission:** Mail.ReadWrite

**Functionality:**
- Embed email/event/contact as itemAttachment inside another email
- Common use case: Forward email as embedded item, not as forwarded copy
- Supports three item types: message, event, contact
- Preview shows source item subject/title

**Schema:** `src/schemas/file-upload.ts` → `AttachItemParams` (extends WriteParams)
```typescript
AttachItemParams = WriteParams.extend({
  message_id: z.string().min(1).describe("ID of message to attach to"),
  item_type: z.enum(["message", "event", "contact"]).describe("Type of item to embed"),
  item_id: z.string().min(1).describe("ID of the item to embed"),
  name: z.string().optional().describe("Display name for attachment"),
})
```

**Key Implementation Details:**
- Graph API expects: `{ "@odata.type": "#microsoft.graph.itemAttachment", item: { ... } }`
- Fetch source item first via GET /me/messages/{id}, GET /me/events/{id}, or GET /me/contacts/{id}
- Embed full item JSON (subject, body, dates, participants as applicable)
- Returns 201 with attachment ID
- Preview format: "Attaching [Type]: [Subject] | Size: [itemSize]"
- Utility: buildItemAttachment() in src/tools/mail-attach-item.ts

---

### F-9.1.3: `attach_reference` (Destructive)

**Graph API:** POST /me/messages/{id}/attachments
**Classification:** destructive (write, modifies message)
**Permission:** Mail.ReadWrite, Files.Read

**Functionality:**
- Attach OneDrive/SharePoint file as referenceAttachment (link, not embedded copy)
- Recipient accesses file via link with specified permissions (view/edit)
- Automatically creates sharing link if needed
- More efficient than file copy for large files

**Schema:** `src/schemas/file-upload.ts` → `AttachReferenceParams` (extends WriteParams)
```typescript
AttachReferenceParams = WriteParams.extend({
  message_id: z.string().min(1).describe("ID of message to attach to"),
  file_id: z.string().min(1).describe("OneDrive/SharePoint item ID"),
  name: z.string().optional().describe("Display name for attachment"),
  permission_type: z.enum(["view", "edit"]).default("view").describe("Link permission level"),
})
```

**Key Implementation Details:**
- Graph API expects: `{ "@odata.type": "#microsoft.graph.referenceAttachment", sourceUrl: "...", ... }`
- Call POST /me/drive/items/{fileId}/createLink with scope: "organization", type: permission_type
- Extract sharing URL from response
- Attachment includes file name, size, and link expiration info
- Returns 201 with attachment ID
- Preview format: "Attaching [FileName] ([Size]) | Permission: [view|edit]"
- Utility: buildReferenceAttachment() in src/tools/mail-attach-reference.ts

---

### F-9.1.4: `poll_copy_status` (Safe)

**Graph API:** GET {monitorUrl} (from copy_file Location header)
**Classification:** safe (read-only)
**Permission:** Files.Read

**Functionality:**
- Check status of async file copy operation
- Returns completion percentage and final status
- Used after copy_file (which returns 202 immediately)
- Example: Monitor 50MB file copy progress

**Schema:** `src/schemas/file-upload.ts` → `PollCopyStatusParams` (extends BaseParams)
```typescript
PollCopyStatusParams = BaseParams.extend({
  monitor_url: z.string().url().describe("Status monitor URL from copy_file Location header"),
})
```

**Key Implementation Details:**
- Monitor URL returned in Location header from copy_file response
- Poll returns { status: "inProgress"|"completed"|"failed", percentComplete: 0-100 }
- Status "completed" includes final driveItem in response
- Status "failed" includes error reason
- Graph API recommendation: poll every 1-2 seconds
- Returns 200 with current state, 303 redirect when completed (follow redirect for final item)
- No confirmation needed (safe read operation)

---

## Test Plan

### upload_large_file (~15 tests)
- [ ] Schema: folder_id optional, file_name required, content_bytes required
- [ ] Schema: conflict_behavior defaults to "fail"
- [ ] Happy path: Upload 5MB file → returns driveItem ID
- [ ] Chunking: Split 10MB into 2x5MB chunks
- [ ] Retry: Failed chunk retry succeeds on 2nd attempt
- [ ] Conflict: Replace existing file with same name
- [ ] Conflict: Rename on conflict (adds suffix)
- [ ] Empty file: content_bytes empty → validation error
- [ ] Large file: 50MB upload completes with multiple retries
- [ ] Error: 413 Payload Too Large
- [ ] Error: 403 Forbidden (no write permission)
- [ ] Folder target: Upload to non-root folder
- [ ] Session timeout: Upload session expires after 24 hours
- [ ] Cancellation: Abandoned session cleaned up
- [ ] Progress tracking: percentComplete field updated

### attach_item (~12 tests)
- [ ] Schema: message_id required, item_type required, item_id required
- [ ] Happy path: Attach email to another email → returns attachmentId
- [ ] Item type: Attach event (meeting) → correct @odata.type
- [ ] Item type: Attach contact → correct item structure
- [ ] Error: 400 Bad Request (invalid item_type)
- [ ] Error: 404 Message not found
- [ ] Error: 404 Item to attach not found
- [ ] Name optional: Display name applied to attachment
- [ ] Size: Item size included in preview
- [ ] Permissions: Recipient can access embedded item
- [ ] Draft message: Can attach to unsent draft
- [ ] Error: 403 Forbidden (message not owned by user)

### attach_reference (~10 tests)
- [ ] Schema: message_id required, file_id required, permission_type defaults to "view"
- [ ] Happy path: Attach OneDrive file → returns attachmentId
- [ ] Link created: sharing link auto-generated
- [ ] Permission: View-only link created
- [ ] Permission: Edit link created
- [ ] Error: 400 Bad Request (invalid file_id)
- [ ] Error: 404 File not found
- [ ] Error: 403 Forbidden (no read access to file)
- [ ] Size info: File size included in response
- [ ] Expiration: Link expiration date included if applicable

### poll_copy_status (~8 tests)
- [ ] Schema: monitor_url required and must be valid URL
- [ ] Happy path: Poll in-progress copy → returns status and percentComplete
- [ ] Status pending: percentComplete = 50
- [ ] Status completed: percentComplete = 100, includes final driveItem
- [ ] Status failed: Returns error reason
- [ ] Polling loop: Multiple polls track progress 0→100
- [ ] Error: 404 Invalid monitor URL
- [ ] Error: 410 Copy operation not found

### New Utilities
- [ ] chunkBuffer: Split base64 into fixed-size chunks
- [ ] createUploadSession: Initiate upload, return uploadUrl
- [ ] uploadChunk: Upload single chunk with retry logic
- [ ] buildItemAttachment: Construct itemAttachment payload
- [ ] buildReferenceAttachment: Construct referenceAttachment payload

---

## New Files to Create

| File | Purpose | Estimated LOC |
|---|---|---|
| `src/schemas/file-upload.ts` | 4 Zod schemas (UploadLargeFileParams, AttachItemParams, AttachReferenceParams, PollCopyStatusParams) | ~80 |
| `src/utils/upload-session.ts` | Upload session management, chunking logic, retry handler | ~200 |
| `src/tools/drive-upload-large.ts` | upload_large_file handler with chunked transfer | ~150 |
| `src/tools/mail-attach-item.ts` | attach_item handler with item fetching | ~120 |
| `src/tools/mail-attach-reference.ts` | attach_reference handler with link creation | ~120 |
| `src/tools/drive-copy-status.ts` | poll_copy_status handler | ~60 |
| `tests/drive-upload-large.test.ts` | ~15 tests | ~180 |
| `tests/mail-attach-item.test.ts` | ~12 tests | ~150 |
| `tests/mail-attach-reference.test.ts` | ~10 tests | ~130 |
| `tests/drive-copy-status.test.ts` | ~8 tests | ~110 |
| `tests/mocks/handlers/upload-session.ts` | MSW handlers for createUploadSession, chunk uploads, copy status monitoring | ~250 |

---

## Modified Files

| File | Changes |
|---|---|
| `src/index.ts` | Register 4 new tools (upload_large_file, attach_item, attach_reference, poll_copy_status) |
| `tests/mocks/handlers/index.ts` | Spread uploadSessionHandlers |

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `WriteParams`, `BaseParams` | `src/schemas/common.js` | All 4 tools |
| `resolveUserPath()` | `src/schemas/common.js` | All tools (multi-tenant) |
| `createLogger()` | `src/utils/logger.js` | All tools |
| `McpToolError` | `src/utils/errors.js` | Error handling |
| `encodeGraphId()` | `src/utils/graph-id.js` | Item ID encoding |

---

## Acceptance Criteria

- [ ] All 4 attachment and upload tools fully implemented + tested
- [ ] Upload session chunking utility created and tested
- [ ] itemAttachment support working (email/event/contact embedding)
- [ ] referenceAttachment support working (OneDrive link attachment)
- [ ] Async copy polling utility operational
- [ ] 45 new tests covering happy path + errors + edge cases
- [ ] No regressions in existing tools
- [ ] Documentation updated: TOOLS.md, PERMISSIONS.md
- [ ] E2E tests: upload_large_file (10MB+), attach_item, attach_reference, poll_copy_status

---

## Known Limitations & Future Work

1. **Max Chunk Size:** Graph API limits individual chunks to 60 MB. Tool enforces this with warnings.
2. **Upload Session Timeout:** Sessions expire after 24 hours of inactivity. Long uploads may timeout.
3. **Conflict Resolution:** "Rename" only adds numeric suffix; user cannot customize naming pattern.
4. **Item Embedding Size:** Very large items (>25 MB equivalent JSON) may fail; Graph API has undocumented limits.
5. **Batch Uploads:** Tool handles single file only. Multi-file batch uploads deferred to Phase 9.3.
6. **Reference Sharing:** Tool always creates organization-scoped links; Anonymous links (public) not supported yet.

---

## Implementation Notes

### Upload Session Flow

1. **Initiate Upload:**
   ```
   POST /me/drive/items/{parentId}:/{fileName}:/createUploadSession
   {
     "item": { "name": "largefile.zip" },
     "@microsoft.graph.conflictBehavior": "fail"
   }
   → Returns: { "uploadUrl": "https://...", "expirationDateTime": "..." }
   ```

2. **Chunk Upload:**
   ```
   PUT {uploadUrl}
   Content-Range: bytes 0-5242879/104857600
   [binary chunk data]
   → Returns: { "expirationDateTime": "...", "nextExpectedRanges": ["5242880-..."] }
   ```

3. **Final Chunk:**
   ```
   PUT {uploadUrl}
   Content-Range: bytes 99999744-104857599/104857600
   [final chunk]
   → Returns: { "id": "driveItemId", "name": "...", "size": 104857600 }
   ```

### itemAttachment Construction

```typescript
const itemAttachment = {
  "@odata.type": "#microsoft.graph.itemAttachment",
  name: "Embedded Email",
  item: {
    "@odata.type": "#microsoft.graph.message",
    subject: sourceMessage.subject,
    body: { contentType: "html", content: sourceMessage.body.content },
    from: sourceMessage.from,
    toRecipients: sourceMessage.toRecipients,
    ccRecipients: sourceMessage.ccRecipients,
  }
};
```

### referenceAttachment Construction

```typescript
const refAttachment = {
  "@odata.type": "#microsoft.graph.referenceAttachment",
  sourceUrl: "https://contoso.sharepoint.com/...",
  providerType: "oneDriveConsumer",
  permission": permission_type === "view" ? "view" : "edit",
  name: fileName,
};
```

### Retry Pattern for Failed Chunks

```typescript
async function uploadChunkWithRetry(uploadUrl, chunk, range, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadChunk(uploadUrl, chunk, range);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await delay(Math.pow(2, attempt) * 1000); // Exponential backoff
    }
  }
}
```

---

## Post-Sprint Notes

Sprint 9.1 resolves the 4MB upload limitation that has been a known constraint since Phase 4. The chunked upload pattern with retry logic enables reliable large file transfers. itemAttachment and referenceAttachment support complete the attachment type coverage, enabling common email embedding workflows (forward-as-attachment vs forward-as-copy). The poll_copy_status utility improves UX for async file operations by allowing progress tracking instead of immediate return with no feedback. Together, these features significantly enhance file handling capabilities.

