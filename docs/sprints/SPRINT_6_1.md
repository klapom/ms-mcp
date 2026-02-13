# Sprint 6.1 — Contacts Tools (Retrospective)

**Phase:** 6 (Contacts + To Do)
**Goal:** Implement 7 Outlook Contacts tools
**Status:** COMPLETE
**Test-Delta:** 688 → 720 (+32 tests)

---

## Features Implemented

### F-6.1.1: `list_contacts` (Safe)

**Graph API:** GET /me/contacts
**Classification:** safe (read-only)
**Permission:** Contacts.Read

**Functionality:**
- List all contacts with pagination
- Filters by folder (optional)
- Sort by displayName (default) or custom field
- Returns contact summary (name, email, company, phone)

**Schema:** `src/schemas/contacts.ts` → `ListContactsParams` (extends ListParams)
```typescript
ListContactsParams = ListParams.extend({
  folder_id: z.string().optional().describe("Contact folder ID. Default: default folder"),
  filter: z.string().optional().describe("OData $filter expression"),
  orderby: z.string().optional().describe("OData $orderby expression. Default: displayName asc"),
})
```

**Key Implementation Details:**
- $select: id, displayName, givenName, surname, emailAddresses, businessPhones, mobilePhone, companyName, jobTitle
- Default sort: displayName ascending
- Pagination: top (max 100), skip, @odata.nextLink
- Format: "Name (Company) | email | phone"

---

### F-6.1.2: `get_contact` (Safe)

**Graph API:** GET /me/contacts/{id}
**Classification:** safe (read-only)
**Permission:** Contacts.Read

**Functionality:**
- Get full contact details
- Includes all addresses, phone numbers, notes, categories
- Detailed metadata (created date, modified date)

**Schema:** `src/schemas/contacts.ts` → `GetContactParams` (extends BaseParams)
```typescript
GetContactParams = BaseParams.extend({
  contact_id: z.string().min(1).describe("ID of the contact"),
})
```

**Key Implementation Details:**
- Extensive $select: all contact fields (50+ fields)
- Includes business/home addresses, all phone types
- Shows creation/modification dates
- Format: structured contact card with all details

---

### F-6.1.3: `search_contacts` (Safe)

**Graph API:** GET /me/contacts?$search
**Classification:** safe (read-only)
**Permission:** Contacts.Read

**Functionality:**
- Full-text search across contacts
- Searches: name, email, company, phone, notes
- Returns matching contacts with summary info
- Pagination via top/skip

**Schema:** `src/schemas/contacts.ts` → `SearchContactsParams` (extends ListParams)
```typescript
SearchContactsParams = ListParams.extend({
  query: z.string().min(1).max(200).describe("Search query (name, email, company, etc.)"),
})
```

**Key Implementation Details:**
- $search parameter: KQL-like search syntax
- Returns contacts matching query in any field
- Pagination: top, skip, @odata.nextLink
- Format: same as list_contacts (name, email, company)

---

### F-6.1.4: `create_contact` (Destructive)

**Graph API:** POST /me/contacts
**Classification:** destructive (confirm + idempotency_key)
**Permission:** Contacts.ReadWrite

**Functionality:**
- Create new contact
- Optional: givenName, surname, displayName, emails, phones, addresses, company, job title, etc.
- At least displayName or givenName+surname required
- Returns new contact ID

**Schema:** `src/schemas/contacts.ts` → `CreateContactParams` (extends WriteParams)
```typescript
CreateContactParams = WriteParams.extend({
  given_name: z.string().optional(),
  surname: z.string().optional(),
  display_name: z.string().optional(),
  email_addresses: z.array(EmailAddressInput).optional(),
  business_phones: z.array(z.string()).optional(),
  mobile_phone: z.string().optional(),
  company_name: z.string().optional(),
  job_title: z.string().optional(),
  department: z.string().optional(),
  office_location: z.string().optional(),
  business_address: PhysicalAddress.optional(),
  home_address: PhysicalAddress.optional(),
  birthday: z.string().optional(),
  personal_notes: z.string().optional(),
  categories: z.array(z.string()).optional(),
})
```

**Key Implementation Details:**
- Request body maps snake_case → camelCase (displayName, givenName, surname, etc.)
- Email format: `[{ address: "...", name: "..." }]`
- Address format: `{ street, city, state, countryOrRegion, postalCode }`
- Confirmation preview pattern
- Idempotency: prevents duplicate creates

---

### F-6.1.5: `update_contact` (Destructive)

**Graph API:** PATCH /me/contacts/{id}
**Classification:** destructive (confirm + idempotency_key)
**Permission:** Contacts.ReadWrite

**Functionality:**
- Update existing contact
- Partial update: only provided fields changed
- Can update any contact field
- Returns updated contact

**Schema:** `src/schemas/contacts.ts` → `UpdateContactParams` (extends WriteParams)
```typescript
UpdateContactParams = WriteParams.extend({
  contact_id: z.string().min(1),
  given_name: z.string().optional(),
  surname: z.string().optional(),
  // ... all contactFields optional
})
```

**Key Implementation Details:**
- Only defined fields sent in PATCH request
- All fields from CreateContactParams made optional
- Confirmation preview: shows updated fields
- Idempotency: same values = safe to retry
- Returns full updated contact

---

### F-6.1.6: `delete_contact` (Destructive)

**Graph API:** DELETE /me/contacts/{id}
**Classification:** destructive (confirm + idempotency_key)
**Response:** 204 No Content
**Permission:** Contacts.ReadWrite

**Functionality:**
- Permanently delete contact
- Confirmation required
- Idempotency: already deleted = safe (204)

**Schema:** `src/schemas/contacts.ts` → `DeleteContactParams` (extends WriteParams)
```typescript
DeleteContactParams = WriteParams.extend({
  contact_id: z.string().min(1).describe("ID of the contact to delete"),
})
```

**Key Implementation Details:**
- Request: DELETE with no body
- Response: 204 No Content
- Confirmation preview: shows contact name
- Idempotency: already deleted → 204 (safe)

---

### F-6.1.7: `list_contact_folders` (Safe)

**Graph API:** GET /me/contactFolders
**Classification:** safe (read-only)
**Permission:** Contacts.Read

**Functionality:**
- List contact folders (including default and custom)
- Returns folder name, item count
- Pagination via top/skip

**Schema:** `src/schemas/contacts.ts` → `ListContactFoldersParams` (extends ListParams)
(Reuses ListParams, no additional fields needed)

**Key Implementation Details:**
- $select: id, displayName, parentFolderId, childFolderCount, totalItemCount
- Pagination: top, skip, @odata.nextLink
- Default folder is "Contacts"
- Format: "Folder name (itemCount items)"

---

## New Files Created

| File | Purpose |
|---|---|
| `src/schemas/contacts.ts` | 7 Zod schemas + EmailAddressInput, PhysicalAddress sub-schemas |
| `src/tools/contacts-read.ts` | list_contacts, get_contact, list_contact_folders handlers |
| `src/tools/contacts-search.ts` | search_contacts handler |
| `src/tools/contacts-write.ts` | create_contact, update_contact, delete_contact handlers |
| `tests/contacts-read.test.ts` | 10 tests |
| `tests/contacts-search.test.ts` | 6 tests |
| `tests/contacts-write.test.ts` | 16 tests |
| `tests/mocks/handlers/contacts.ts` | MSW handlers for all 7 contact endpoints |

---

## Tests Summary

**Total:** 32 new tests

### contacts-read.test.ts (~10 tests)
1. Schema: ListContactsParams inherits top/skip/user_id
2. API: list contacts in default folder
3. API: list contacts in specific folder
4. Filter: $filter support (e.g., companyName eq 'Acme')
5. Sort: $orderby support (default displayName asc)
6. Pagination: top/skip with @odata.nextLink
7. get_contact: full details with all fields
8. list_contact_folders: list all folders
9. Error: 404 folder not found
10. Error: 401 unauthorized

### contacts-search.test.ts (~6 tests)
1. Schema: query required (min 1, max 200)
2. API: search by name
3. API: search by email
4. API: search by company
5. Empty results: query matches nothing
6. Error: 400 invalid query

### contacts-write.test.ts (~16 tests)

#### create_contact (~5 tests)
1. Schema: at least displayName or givenName+surname
2. API: create with minimal fields (displayName)
3. API: create with full details (address, phones, company)
4. Email format: array of { address, name }
5. Confirmation + idempotency

#### update_contact (~6 tests)
1. Schema: contact_id required, rest optional
2. API: update single field
3. API: update multiple fields
4. Partial update: unchanged fields remain
5. Confirmation preview: shows changed fields
6. Idempotency: same values safe to retry

#### delete_contact (~5 tests)
1. Schema: contact_id required
2. API: delete contact → 204 No Content
3. Confirmation check
4. Idempotency: already deleted → 204 (safe)
5. Error: 404 contact not found

---

## Build + Test Verification

1. ✅ `pnpm build` — all new files compile
2. ✅ `pnpm typecheck` — strict mode clean
3. ✅ `pnpm lint` — Biome clean
4. ✅ `pnpm test` — 688 → 720 (+32 tests)
5. ✅ No regressions in Phase 4/5 tools
6. ✅ All 7 tools registered in index.ts

---

## MSW Handlers

### list_contacts
- GET /me/contacts → array of contacts
- GET /me/contactFolders/{id}/contacts → folder-specific
- Pagination with @odata.nextLink

### get_contact
- GET /me/contacts/{id} → full contact details

### search_contacts
- GET /me/contacts?$search={query} → search results

### create_contact
- POST /me/contacts → 201 Created
- Returns new contact with ID

### update_contact
- PATCH /me/contacts/{id} → 200 OK
- Returns updated contact

### delete_contact
- DELETE /me/contacts/{id} → 204 No Content

### list_contact_folders
- GET /me/contactFolders → array of folders

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `ListParams`, `BaseParams`, `WriteParams` | `src/schemas/common.js` | All 7 contact tools |
| `confirmation` | `src/utils/confirmation.js` | create, update, delete |
| `idempotencyCache` | `src/utils/idempotency.js` | create, update, delete |
| `encodeGraphId()` | `src/utils/graph-id.js` | All write tools |
| `DEFAULT_SELECT` | `src/utils/response-shaper.js` | All contact tools |
| `fetchPage()` | `src/utils/pagination.js` | list_contacts, search_contacts, list_contact_folders |

---

## Acceptance Criteria

- [x] All 7 contact tools fully implemented + tested
- [x] Destructive tools: confirm + idempotency_key pattern
- [x] Confirmation preview consistent with existing patterns
- [x] Contact field mapping: snake_case ↔ camelCase
- [x] Sub-schemas: EmailAddressInput, PhysicalAddress reusable
- [x] 32 new tests covering happy path + errors
- [x] No regressions in Phase 4/5 tools
- [x] All 7 tools registered in index.ts
- [x] Coverage thresholds maintained (60/50/60/60)

---

## Known Limitations & Future Work

1. **Folder hierarchy:** Only top-level folders shown. Sub-folder navigation future enhancement.
2. **Contact photos:** Photo downloads not supported (MVP).
3. **Distribution lists:** Only individual contacts supported (not groups/DLs).
4. **Sync:** No change notification/webhook support (Phase 9).

---

## Post-Sprint Notes

Sprint 6.1 establishes Outlook Contacts tooling with full CRUD support. The contact field mapping pattern (snake_case ↔ camelCase) will be reused in Phase 6.2 (To Do).

Key design decisions:
- **Optional fields:** All contact fields optional on create (flexible contact creation)
- **Email format:** Array of objects `{ address, name }` (matches Graph API structure)
- **Address fields:** Reusable PhysicalAddress sub-schema (business + home support)
- **Partial updates:** Only specified fields changed (idempotent)

Phase 6.2 will add To Do list + task management tools.
