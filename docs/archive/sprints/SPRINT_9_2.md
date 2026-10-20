# Sprint 9.2 — OneNote

**Phase:** 9 (Complete Microsoft 365 Coverage)
**Goal:** Integrate OneNote for knowledge management and note-taking use cases
**Status:** PLANNED
**Test-Delta:** ~1,172 → ~1,225 (+53 tests)

---

## Features to Implement

### F-9.2.1: `list_notebooks` (Safe)

**Graph API:** GET /me/onenote/notebooks
**Classification:** safe (read-only)
**Permission:** Notes.Read

**Functionality:**
- List all OneNote notebooks accessible to user
- Return notebook metadata (name, creation date, section count)
- Sort by modification date
- Pagination support

**Schema:** `src/schemas/onenote.ts` → `ListNotebooksParams` (extends ListParams)
```typescript
ListNotebooksParams = ListParams
```

**Key Implementation Details:**
- GET /me/onenote/notebooks with $select: ["id", "displayName", "createdDateTime", "lastModifiedDateTime"]
- Include `sectionsUrl` for reference in response
- Format: Notebook name | Created | Modified | Sections count
- Default pagination: top 25
- Response includes full notebook metadata

---

### F-9.2.2: `list_sections` (Safe)

**Graph API:** GET /onenote/notebooks/{id}/sections
**Classification:** safe (read-only)
**Permission:** Notes.Read

**Functionality:**
- List all sections within a specific notebook
- Return section metadata (name, creation date, page count)
- Sections organize pages hierarchically
- Pagination support

**Schema:** `src/schemas/onenote.ts` → `ListSectionsParams` (extends ListParams)
```typescript
ListSectionsParams = ListParams.extend({
  notebook_id: z.string().min(1).describe("ID of the notebook"),
})
```

**Key Implementation Details:**
- GET /onenote/notebooks/{notebookId}/sections with $select
- Include `pagesUrl` for reference
- Format: Section name | Created | Modified | Pages count
- Default pagination: top 25
- Response includes section hierarchy info

---

### F-9.2.3: `list_pages` (Safe)

**Graph API:** GET /onenote/sections/{id}/pages
**Classification:** safe (read-only)
**Permission:** Notes.Read

**Functionality:**
- List all pages within a specific section
- Return page metadata (title, creation date, last modified)
- Pages are ordered by creation date
- Pagination support

**Schema:** `src/schemas/onenote.ts` → `ListPagesParams` (extends ListParams)
```typescript
ListPagesParams = ListParams.extend({
  section_id: z.string().min(1).describe("ID of the section"),
})
```

**Key Implementation Details:**
- GET /onenote/sections/{sectionId}/pages with $select
- Include `contentUrl` for fetching full page content
- Format: Page title | Created | Modified
- Default pagination: top 25
- Response includes page level/hierarchy

---

### F-9.2.4: `get_page_content` (Safe)

**Graph API:** GET /onenote/pages/{id}/content
**Classification:** safe (read-only)
**Permission:** Notes.Read

**Functionality:**
- Retrieve full HTML content of a OneNote page
- Optional image extraction and base64 embedding
- Convert HTML to plain text for MCP response
- Limit content to 10,000 characters

**Schema:** `src/schemas/onenote.ts` → `GetPageContentParams` (extends BaseParams)
```typescript
GetPageContentParams = BaseParams.extend({
  page_id: z.string().min(1).describe("ID of the page"),
  include_images: z.boolean().default(false).describe("Extract images as base64 (may increase response size)"),
})
```

**Key Implementation Details:**
- GET /onenote/pages/{pageId}/content returns HTML as text/html
- Parse HTML for `<img>` tags if `include_images: true`
- Fetch image data from `src` URLs (OneDrive links), convert to base64
- Convert HTML to plain text via `htmlToPlainText()` utility (reuse from mail tools)
- Limit content to 10,000 chars (similar to email body limit)
- Response format: "# Page Title\n\n[Content]\n\n[Images: N]"
- Metadata: Page creation date, last modified, author

---

### F-9.2.5: `create_page` (Destructive)

**Graph API:** POST /onenote/sections/{id}/pages
**Classification:** destructive (write, creates page)
**Permission:** Notes.ReadWrite

**Functionality:**
- Create new page in a section with HTML content
- Requires proper HTML structure (OneNote specific)
- Returns new page ID and contentUrl
- Confirmation + idempotency pattern

**Schema:** `src/schemas/onenote.ts` → `CreatePageParams` (extends WriteParams)
```typescript
CreatePageParams = WriteParams.extend({
  section_id: z.string().min(1).describe("ID of the section"),
  title: z.string().min(1).max(255).describe("Page title"),
  content: z.string().min(1).describe("HTML content (wrapped in proper structure)"),
})
```

**Key Implementation Details:**
- Graph API expects multipart/form-data with HTML content
- Required HTML structure: `<html><head><title>Title</title></head><body>[content]</body></html>`
- Content can include: `<p>`, `<table>`, `<img>`, `<ul>`, `<ol>` tags
- POST /onenote/sections/{sectionId}/pages with Content-Type: text/html
- Returns 201 with new page ID
- Preview format: "Creating page: [Title] | Content: [first 100 chars]"
- Confirmation required (destructive)

---

### F-9.2.6: `search_notes` (Safe)

**Graph API:** GET /me/onenote/pages?$search=[query]
**Classification:** safe (read-only)
**Permission:** Notes.Read

**Functionality:**
- Full-text search across all OneNote pages
- Searches title and content
- Return matching pages with relevance ranking
- Pagination support

**Schema:** `src/schemas/onenote.ts` → `SearchNotesParams` (extends ListParams)
```typescript
SearchNotesParams = ListParams.extend({
  query: z.string().min(1).max(200).describe("Search query (full-text)"),
})
```

**Key Implementation Details:**
- GET /me/onenote/pages?$search={query} uses Graph full-text search
- Query syntax: simple keywords or phrases in quotes
- Response includes search rank/relevance score
- Format: Page title | Notebook | Section | Preview (first 100 chars) | Rank
- Default pagination: top 25
- Search index may be eventually consistent (up to 1 hour delay for new content)

---

## Test Plan

### list_notebooks (~8 tests)
- [ ] Schema: Empty params valid (extends ListParams)
- [ ] Happy path: List 3 notebooks → all returned
- [ ] Pagination: top=10 returns 10 notebooks
- [ ] Pagination: skip=5 skips first 5 notebooks
- [ ] Metadata: displayName, createdDateTime, lastModifiedDateTime included
- [ ] Empty results: No notebooks → empty array
- [ ] Error: 403 Forbidden (no access to notes)
- [ ] Sorting: Most recently modified first (default)

### list_sections (~8 tests)
- [ ] Schema: notebook_id required
- [ ] Happy path: List sections in notebook → all returned
- [ ] Pagination: top/skip working
- [ ] Metadata: displayName, createdDateTime, lastModifiedDateTime included
- [ ] Empty sections: Notebook with no sections → empty array
- [ ] Error: 404 Notebook not found
- [ ] Error: 403 Forbidden (no access to notebook)
- [ ] Section hierarchy: Parent notebook ID preserved

### list_pages (~8 tests)
- [ ] Schema: section_id required
- [ ] Happy path: List pages in section → all returned
- [ ] Pagination: top/skip working
- [ ] Metadata: title, createdDateTime, lastModifiedDateTime, level
- [ ] Empty pages: Section with no pages → empty array
- [ ] Error: 404 Section not found
- [ ] Error: 403 Forbidden (no access to section)
- [ ] Page order: Chronological by creation date

### get_page_content (~15 tests)
- [ ] Schema: page_id required, include_images optional
- [ ] Happy path: Fetch HTML content → converted to plain text
- [ ] Include images: False (default) → images skipped, text only
- [ ] Include images: True → images extracted and base64 embedded
- [ ] Content limit: >10,000 chars truncated with "..." suffix
- [ ] Metadata: Creation date, modified date included
- [ ] Format: Title as markdown heading + content + image count
- [ ] Empty page: Page with no content → returns title only
- [ ] Error: 404 Page not found
- [ ] Error: 403 Forbidden (no access to page)
- [ ] HTML parsing: Handles nested tables, lists, formatting
- [ ] Image extraction: OneDrive image URLs converted to base64
- [ ] Special characters: HTML entities decoded correctly
- [ ] Large content: 50KB page handled gracefully
- [ ] Timeout: Long image download doesn't block response

### create_page (~12 tests)
- [ ] Schema: section_id required, title required, content required
- [ ] Schema: confirm=false returns preview only (no creation)
- [ ] Happy path: Create page → returns new page ID
- [ ] Confirmation: confirm=true actually creates page
- [ ] Idempotency: Same idempotency_key returns same result
- [ ] HTML structure: Minimal valid HTML `<html><body>...</body></html>` accepted
- [ ] Rich content: Tables, lists, images in HTML supported
- [ ] Preview format: Shows title + content snippet
- [ ] Error: 400 Invalid HTML structure
- [ ] Error: 404 Section not found
- [ ] Error: 403 Forbidden (no write permission)
- [ ] Title limit: >255 chars rejected

### search_notes (~8 tests)
- [ ] Schema: query required, max 200 chars
- [ ] Happy path: Search "quarterly" → matching pages returned
- [ ] Pagination: top/skip supported
- [ ] Ranking: Most relevant pages first
- [ ] Quoted phrase: "exact phrase" search works
- [ ] Empty results: No matches → empty array
- [ ] Error: 400 Invalid search query
- [ ] Error: 403 Forbidden (no access to notes)

### New Utilities
- [ ] htmlToPlainText: Convert HTML to plain text (reuse from mail)
- [ ] extractImagesFromHtml: Parse HTML for img tags, fetch and base64 encode
- [ ] buildPageContent: Construct valid OneNote HTML structure
- [ ] DEFAULT_SELECT for notebook, section, page

---

## New Files to Create

| File | Purpose | Estimated LOC |
|---|---|---|
| `src/schemas/onenote.ts` | 6 Zod schemas (list/create page, search operations) | ~100 |
| `src/tools/onenote-notebooks.ts` | list_notebooks handler | ~80 |
| `src/tools/onenote-sections.ts` | list_sections handler | ~85 |
| `src/tools/onenote-pages.ts` | list_pages and get_page_content handlers | ~150 |
| `src/tools/onenote-create.ts` | create_page handler with HTML structure building | ~130 |
| `src/tools/onenote-search.ts` | search_notes handler with ranking | ~100 |
| `tests/onenote-notebooks.test.ts` | ~8 tests | ~120 |
| `tests/onenote-sections.test.ts` | ~8 tests | ~120 |
| `tests/onenote-pages.test.ts` | ~15 tests | ~200 |
| `tests/onenote-create.test.ts` | ~12 tests | ~160 |
| `tests/onenote-search.test.ts` | ~10 tests | ~140 |
| `tests/mocks/handlers/onenote.ts` | MSW handlers for all OneNote endpoints | ~300 |

---

## Modified Files

| File | Changes |
|---|---|
| `src/index.ts` | Register 6 new OneNote tools |
| `src/utils/response-shaper.ts` | Add notebook, section, page to DEFAULT_SELECT |
| `tests/mocks/handlers/index.ts` | Spread onenoteHandlers |

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `ListParams`, `WriteParams`, `BaseParams` | `src/schemas/common.js` | All 6 tools |
| `htmlToPlainText()` | `src/utils/html-convert.js` | get_page_content |
| `createLogger()` | `src/utils/logger.js` | All tools |
| `McpToolError` | `src/utils/errors.js` | Error handling |
| `resolveUserPath()` | `src/schemas/common.js` | Multi-tenant support |
| `encodeGraphId()` | `src/utils/graph-id.js` | ID encoding |

---

## Acceptance Criteria

- [ ] All 6 OneNote tools fully implemented + tested
- [ ] HTML content extraction and conversion working
- [ ] Image embedding (optional) working
- [ ] Page creation with proper HTML structure validated
- [ ] Full-text search operational
- [ ] 53 new tests covering happy path + errors + edge cases
- [ ] No regressions in existing tools
- [ ] NEW SCOPE: `Notes.ReadWrite` added to DEFAULT_SCOPES and Azure Portal
- [ ] Documentation updated: TOOLS.md, PERMISSIONS.md, SCOPES.md
- [ ] E2E tests: list_notebooks → list_sections → list_pages → get_page_content → create_page

---

## Known Limitations & Future Work

1. **HTML Content Only:** OneNote API only returns/accepts HTML. Rich media (embedded video, voice) not supported.
2. **Page Updates:** Graph API does not support PATCH on pages. Updates require page deletion + recreation.
3. **Image Extraction:** Large images (>10MB) may not download reliably. Tool caps at 5MB per image.
4. **Search Index Lag:** Full-text search index may be eventually consistent (up to 1 hour delay).
5. **Embedded Attachments:** OneNote file attachments not supported (OfficeDOC feature, not Graph).
6. **Section Groups:** OneNote supports nested section groups (folders of sections). MVP only supports flat sections.
7. **Notebook Sharing:** Shared notebooks accessible but tool doesn't differentiate ownership/permissions.

---

## Implementation Notes

### DEFAULT_SELECT Fields

```typescript
const DEFAULT_SELECT = {
  notebook: ["id", "displayName", "createdDateTime", "lastModifiedDateTime", "sectionsUrl"],
  section: ["id", "displayName", "createdDateTime", "lastModifiedDateTime", "pagesUrl"],
  page: ["id", "title", "createdDateTime", "lastModifiedDateTime", "contentUrl", "level"],
};
```

### Valid OneNote HTML Structure

```html
<html>
  <head>
    <title>Page Title</title>
  </head>
  <body>
    <p>Paragraph content</p>
    <table>
      <tr><td>Cell</td></tr>
    </table>
    <ul><li>List item</li></ul>
  </body>
</html>
```

### Image Extraction Pattern

```typescript
async function extractImagesFromHtml(htmlContent: string): Promise<{
  html: string;
  images: Array<{ src: string; base64: string }>;
}> {
  const images = [];
  const updated = htmlContent.replace(/<img[^>]+src="([^"]+)"[^>]*>/g, async (match, src) => {
    if (!src.startsWith("https://")) return match; // Skip external URLs
    const data = await fetch(src).then(r => r.arrayBuffer());
    const base64 = Buffer.from(data).toString("base64");
    images.push({ src, base64 });
    return `<img src="data:image/png;base64,${base64}">`;
  });
  return { html: updated, images };
}
```

### Page Content Truncation

```typescript
function truncatePageContent(content: string, maxChars = 10000): string {
  if (content.length <= maxChars) return content;
  return content.substring(0, maxChars - 3) + "...";
}
```

### Search Query Examples

```
"quarterly budget" — Phrase search
meeting notes — Multiple terms
project:alpha — Field-specific (if supported)
created:2026-02-01 — Date range (if supported)
```

---

## Post-Sprint Notes

Sprint 9.2 expands Microsoft 365 coverage to OneNote, completing content management capabilities alongside mail, calendar, files, and tasks. The feature set focuses on read operations (list/search/view) with minimal write support (create-page only). The decision to not support page updates is intentional—Graph API limitations make updates cumbersome. HTML content handling reuses existing utilities (htmlToPlainText) but adds image extraction capability for richer note capture. OneNote integration enables knowledge base and documentation use cases that were previously unavailable.

