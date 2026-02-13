# Phase 9 Planning Review

This document consolidates all "Known Limitations & Future Work" and "Post-Sprint Notes" from Sprints 2.1 through 6.2 to inform Phase 9 implementation decisions.

---

## 1. File Handling & Upload

### From Sprint 4.2 (OneDrive Read)
- ✅ **Max download size (10 MB):** Already implemented and working well
- 🔄 **Text encoding detection:** Currently relies on MIME type. Could improve with header sniffing.

### From Sprint 4.3 (OneDrive Write)
- 🎯 **Resumable upload for files > 4 MB:** Deferred to Phase 9. Graph API supports `createUploadSession`.
- 🎯 **Async copy polling:** Currently returns 202 immediately. Could add polling for completion status.
- 🎯 **Batch operations:** No folder sync. Phase 9 batch API could enable this.

**Recommendation for Phase 9:**
- **High Priority:** Resumable upload (enables large file support, unblocks common use case)
- **Medium Priority:** Async copy polling (nice-to-have for UX)
- **Low Priority:** Text encoding detection (minor improvement)
- **Consider:** Batch API (high complexity, needs clear use cases)

---

## 2. Attachment Support

### From Sprint 2.3 (Mail Attachments)
- 🎯 **itemAttachment support:** Embedded Outlook items (emails, events, contacts)
- 🎯 **referenceAttachment support:** OneDrive/SharePoint links

### From Sprint 5.3 (SharePoint)
- 🎯 **List item attachments:** Not supported

### From Sprint 6.2 (To Do)
- 🎯 **Task attachments:** Not supported

**Recommendation for Phase 9:**
- **High Priority:** itemAttachment support (common use case for email forwards)
- **High Priority:** referenceAttachment support (now that we have OneDrive tools)
- **Low Priority:** List item/task attachments (edge cases)

---

## 3. Graph API Limitations (Documented, No Fix Needed)

### From Sprint 5.1 (Teams Read)
- ✅ **list_teams no pagination:** Graph API limitation. Client-side pagination works.
- ✅ **list_channels no pagination:** Graph API limitation. Client-side slicing works.
- ✅ **list_chats no $orderby:** Graph API limitation. Documented and handled.

### From Sprint 4.2 (OneDrive Read)
- ✅ **SharePoint drive paths:** Foundation prepared, Phase 5 delivered this.

**Recommendation for Phase 9:**
- **No Action Required:** These are permanent Graph API limitations, already documented and handled.

---

## 4. Recurring Items

### From Sprint 3.2 (Calendar Write)
- ❓ **Recurrence:** Calendar events support recurrence via Graph API. Is this already working?

### From Sprint 5.3 (SharePoint)
- 🔄 **Recurring list items:** Requires special Graph handling (likely not common use case)

### From Sprint 6.2 (To Do)
- 🔄 **Recurring tasks:** Not supported. Graph API requires special handling.

**Recommendation for Phase 9:**
- **Investigate First:** Check if calendar recurrence is already working (may not be a limitation)
- **Low Priority:** Recurring tasks (complex API, moderate use case)
- **Skip:** Recurring list items (edge case)

---

## 5. Advanced Features

### From Sprint 4.3 (OneDrive Write)
- 🎯 **Batch API support:** Multiple operations in single request

### From Sprint 6.1 (Contacts)
- 🎯 **Change notifications/webhooks:** Real-time sync

### From Sprint 6.2 (To Do)
- 🎯 **Subtasks:** Not supported (Graph API limitation)
- 🎯 **Task linking/dependencies:** Not supported

**Recommendation for Phase 9:**
- **High Priority:** Batch API support (significant performance win for multi-operation workflows)
- **Medium Priority:** Webhooks (requires infrastructure, but valuable for real-time updates)
- **Low Priority:** Subtasks (Graph API may not support this well)
- **Skip:** Task dependencies (complex, niche use case)

---

## 6. Contact & To Do Enhancements

### From Sprint 6.1 (Contacts)
- 🔄 **Folder hierarchy:** Only top-level folders shown
- 🔄 **Contact photos:** Photo downloads not supported
- 🔄 **Distribution lists:** Only individual contacts (not groups/DLs)

### From Sprint 6.2 (To Do)
- ✅ **All core functionality:** Delivered in Phase 6

**Recommendation for Phase 9:**
- **Low Priority:** All of these (edge cases, complex APIs, low value)

---

## 7. SharePoint & Teams Extensions

### From Sprint 5.2 (SharePoint + Teams Write)
- 🎯 **Teams meetings:** Create/update meeting support (requires new scopes, Phase 8)
- ✅ **Site collections:** Root site access working

### From Sprint 5.3 (SharePoint Write)
- 🔄 **Field validation:** MVP doesn't validate against list schema (acceptable for MVP)
- 🔄 **Lookups:** Complex field types not validated
- 🔄 **Choice sets:** Not validated

**Recommendation for Phase 9:**
- **Defer to Phase 8:** Teams meetings (already in Phase 8 roadmap)
- **Skip:** Field validation (too complex, Graph API provides adequate errors)

---

## 8. Performance & Caching

### From Phase 9 Roadmap (Sprint 9.2)
- 🎯 **Response caching:** Reduce redundant Graph API calls
- 🎯 **Request deduplication:** Merge identical concurrent requests

**Recommendation for Phase 9:**
- **Medium Priority:** Response caching (clear performance win, moderate complexity)
- **Low Priority:** Request deduplication (edge case optimization)

---

## Summary for Phase 9 Decision

### 🎯 High Priority (Clear Value, Unblocks Use Cases)
1. **Resumable upload for large files (>4 MB)** — Common blocker
2. **itemAttachment support** — Embedded Outlook items
3. **referenceAttachment support** — OneDrive/SharePoint links
4. **Batch API support** — Performance win for multi-operations

### 🔄 Medium Priority (Nice-to-Have)
5. **Async copy polling** — Better UX for file operations
6. **Webhooks/change notifications** — Real-time updates (infrastructure needed)
7. **Response caching** — Performance optimization

### ⚠️ Low Priority (Edge Cases or Minor Improvements)
8. **Text encoding detection** — Minor quality improvement
9. **Recurring tasks** — Complex API, moderate value
10. **Contact photos** — Edge case
11. **Folder hierarchies** — Edge case
12. **Request deduplication** — Edge case optimization

### ❌ Skip (Too Complex, Low Value, or Already Handled)
- Field validation for SharePoint (Graph API errors sufficient)
- Distribution lists (complex API, niche use case)
- Subtasks (Graph API limitation)
- Task dependencies (complex, niche)
- List item attachments (edge case)
- Task attachments (edge case)

---

## Recommended Phase 9.2 Scope

### Must-Have (Sprint 9.2a)
1. Resumable upload (large file support)
2. itemAttachment support (email embeddings)
3. referenceAttachment support (OneDrive links)

### Should-Have (Sprint 9.2b)
4. Batch API support ($batch endpoint)
5. Response caching layer

### Could-Have (Sprint 9.2c or Future)
6. Webhooks/change notifications
7. Async copy polling
8. Text encoding improvements

### Won't-Have (Out of Scope)
- Field validation, distribution lists, subtasks, task dependencies, minor edge cases

---

## Next Steps

1. **User Decision:** Review this document and decide which features make it into Phase 9
2. **Scope Definition:** Create detailed sprint plans for selected features
3. **Dependency Check:** Verify which features require new scopes or infrastructure
4. **Implementation:** Execute selected sprints with same quality gates (lint, test, E2E, review)
