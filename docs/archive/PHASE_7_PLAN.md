# Phase 7: User Directory + Mail Extensions

## Context

Phase 6 complete: 59 tools, 752 tests. Phase 7 adds User/Directory access (7 tools) and Mail extensions (7 tools). Sprint 7.1 requires **NEW scopes** in Azure Portal, Sprint 7.2 uses existing `Mail.ReadWrite` scope.

**Total new tools: 14** (7 User/Directory + 7 Mail Extensions)
**Projected after Phase 7: 73 tools, ~830 tests**

---

## Prerequisites

### Sprint 7.1 — New Azure Portal Scopes Required

Add these **Delegated permissions** in Azure Portal → API permissions:

1. **User.Read.All** — Read all users' full profiles
2. **Directory.Read.All** — Read directory data

**Steps:**
1. Azure Portal → App registrations → pommer-m365-mcp
2. API permissions → Add a permission → Microsoft Graph
3. Delegated permissions → Search for `User.Read.All` → Check → Add
4. Repeat for `Directory.Read.All`
5. **Grant admin consent** for the tenant
6. **Re-authenticate:** `rm ~/.ms-mcp/token-cache.json && pnpm auth login`

### Sprint 7.2 — No New Scopes

Uses existing `Mail.ReadWrite` scope (already granted in Phase 2).

---

## Sprint 7.1 — User & Directory (7 tools)

**Goal:** Read-only access to user profiles, organizational hierarchy, and photos.

### Schemas (`src/schemas/user.ts`)

```typescript
import { z } from "zod";
import { BaseParams, ListParams } from "./common.js";

export const GetMyProfileParams = BaseParams;

export const SearchUsersParams = ListParams.extend({
  query: z.string().min(1).max(200),
});

export const GetUserParams = BaseParams.extend({
  user_id: z.string().min(1),
});

export const GetManagerParams = BaseParams.extend({
  user_id: z.string().optional(), // Defaults to /me/manager
});

export const ListDirectReportsParams = BaseParams.extend({
  user_id: z.string().optional(), // Defaults to /me/directReports
  top: z.number().int().positive().max(999).optional(),
  skip: z.number().int().nonnegative().optional(),
});

export const ListUserGroupsParams = BaseParams.extend({
  user_id: z.string().optional(), // Defaults to /me/memberOf
  top: z.number().int().positive().max(999).optional(),
  skip: z.number().int().nonnegative().optional(),
});

export const GetUserPhotoParams = BaseParams.extend({
  user_id: z.string().min(1),
  size: z.enum(["48x48", "64x64", "96x96", "120x120", "240x240", "360x360", "432x432", "504x504", "648x648"]).optional(),
});
```

### Tools

| Tool | Type | Graph API | Notes |
|---|---|---|---|
| `get_my_profile` | safe | GET /me | Full user profile (displayName, mail, jobTitle, etc.) |
| `search_users` | safe | GET /users?$search | Requires `ConsistencyLevel: eventual` + `$count=true` |
| `get_user` | safe | GET /users/{id} | Single user by ID or UPN |
| `get_manager` | safe | GET /me/manager or /users/{id}/manager | User's manager |
| `list_direct_reports` | safe | GET /me/directReports or /users/{id}/directReports | Team members |
| `list_user_groups` | safe | GET /me/memberOf or /users/{id}/memberOf | Group memberships |
| `get_user_photo` | safe | GET /users/{id}/photo/$value | Profile photo as base64 |

### Files

| New File | Purpose |
|---|---|
| `src/schemas/user.ts` | 7 Zod schemas |
| `src/tools/user-profile.ts` | get_my_profile, get_user, get_manager |
| `src/tools/user-search.ts` | search_users (special headers like contacts) |
| `src/tools/user-org.ts` | list_direct_reports, list_user_groups |
| `src/tools/user-photo.ts` | get_user_photo |
| `tests/user-profile.test.ts` | ~12 tests |
| `tests/user-search.test.ts` | ~8 tests |
| `tests/user-org.test.ts` | ~10 tests |
| `tests/user-photo.test.ts` | ~8 tests |
| `tests/mocks/handlers/user.ts` | MSW handlers |

| Modified | Change |
|---|---|
| `src/index.ts` | Register 4 user modules |
| `src/utils/response-shaper.ts` | Add `user`, `userDetail`, `group` to DEFAULT_SELECT |
| `tests/mocks/handlers/index.ts` | Spread userHandlers |

### Key Implementation Notes

- **search_users** needs `.header("ConsistencyLevel", "eventual")` + `.query({ $count: "true" })` (same as search_contacts)
- **get_user_photo** returns binary data → encode as base64 → return as `image` type in MCP response
- **user_id parameter:** Optional on get_manager, list_direct_reports, list_user_groups → defaults to `/me/*`
- **Photo sizes:** Graph API supports predefined sizes (48x48 up to 648x648). Default to 240x240 if not specified.
- **UPN vs ID:** Graph API accepts both user ID (GUID) and User Principal Name (email) for `user_id`

### DEFAULT_SELECT Fields

```typescript
user: [
  "id", "displayName", "mail", "userPrincipalName",
  "jobTitle", "department", "officeLocation", "mobilePhone", "businessPhones"
],
userDetail: [
  "id", "displayName", "givenName", "surname", "mail", "userPrincipalName",
  "jobTitle", "department", "officeLocation", "companyName",
  "mobilePhone", "businessPhones", "city", "country", "state", "streetAddress", "postalCode",
  "preferredLanguage", "employeeId", "accountEnabled"
],
group: [
  "id", "displayName", "description", "mail", "mailEnabled", "securityEnabled"
],
```

---

## Sprint 7.2 — Mail Extensions (7 tools)

**Goal:** Complete mail management: delete, drafts, attachments, folders, rules, flags.

### Schemas (`src/schemas/mail-extensions.ts`)

```typescript
import { z } from "zod";
import { BaseParams, WriteParams } from "./common.js";
import { EmailAddressInput } from "./mail-write.js"; // Reuse from Phase 2

export const DeleteEmailParams = WriteParams.extend({
  message_id: z.string().min(1),
});

export const CreateDraftParams = WriteParams.extend({
  subject: z.string().optional(),
  body: z.string().optional(),
  body_type: z.enum(["text", "html"]).default("text"),
  to: z.array(EmailAddressInput).optional(),
  cc: z.array(EmailAddressInput).optional(),
  bcc: z.array(EmailAddressInput).optional(),
  importance: z.enum(["low", "normal", "high"]).default("normal"),
  save_to_sent_items: z.boolean().default(true),
});

export const SendDraftParams = WriteParams.extend({
  message_id: z.string().min(1),
});

export const AddAttachmentParams = WriteParams.extend({
  message_id: z.string().min(1),
  name: z.string().min(1),
  content_bytes: z.string().min(1), // Base64-encoded
  content_type: z.string().optional(),
  is_inline: z.boolean().default(false),
});

export const CreateMailFolderParams = WriteParams.extend({
  display_name: z.string().min(1).max(255),
  parent_folder_id: z.string().optional(), // Defaults to mailFolders root
});

export const FlagEmailParams = WriteParams.extend({
  message_id: z.string().min(1),
  flag_status: z.enum(["flagged", "complete", "notFlagged"]),
  due_date: z.string().optional(), // ISO 8601 date
  start_date: z.string().optional(),
  completion_date: z.string().optional(),
});

export const ListMailRulesParams = BaseParams.extend({
  top: z.number().int().positive().max(999).optional(),
  skip: z.number().int().nonnegative().optional(),
});
```

### Tools

| Tool | Type | Graph API | Notes |
|---|---|---|---|
| `delete_email` | destructive | DELETE /me/messages/{id} | confirm + idempotency. 204 No Content |
| `create_draft` | destructive | POST /me/messages | Creates unsent draft. confirm + idempotency |
| `send_draft` | destructive | POST /me/messages/{id}/send | Sends existing draft. confirm + idempotency |
| `add_attachment` | destructive | POST /me/messages/{id}/attachments | Add file to draft. confirm + idempotency |
| `create_mail_folder` | destructive | POST /me/mailFolders | Create custom folder. confirm + idempotency |
| `flag_email` | destructive | PATCH /me/messages/{id} (flag field) | Set flag status. confirm + idempotency |
| `list_mail_rules` | safe | GET /me/mailFolders/inbox/messageRules | Read-only rule listing |

### Files

| New File | Purpose |
|---|---|
| `src/schemas/mail-extensions.ts` | 7 Zod schemas |
| `src/tools/mail-delete.ts` | delete_email |
| `src/tools/mail-drafts.ts` | create_draft, send_draft, add_attachment |
| `src/tools/mail-folders.ts` | create_mail_folder |
| `src/tools/mail-flags.ts` | flag_email |
| `src/tools/mail-rules.ts` | list_mail_rules |
| `tests/mail-delete.test.ts` | ~10 tests |
| `tests/mail-drafts.test.ts` | ~15 tests |
| `tests/mail-folders.test.ts` | ~8 tests |
| `tests/mail-flags.test.ts` | ~10 tests |
| `tests/mail-rules.test.ts` | ~8 tests |
| `tests/mocks/handlers/mail-extensions.ts` | MSW handlers |

| Modified | Change |
|---|---|
| `src/index.ts` | Register 5 mail extension modules |
| `src/utils/response-shaper.ts` | Add `mailRule` to DEFAULT_SELECT |
| `tests/mocks/handlers/index.ts` | Spread mailExtensionHandlers |

### Key Implementation Notes

- **delete_email:** Permanent deletion (not move to Deleted Items). Preview should warn about permanence.
- **create_draft:** POST /me/messages creates draft in Drafts folder. Returns message ID.
- **send_draft:** POST /me/messages/{id}/send. Returns 202 with null body (like send_email).
- **add_attachment:** Max size 3 MB via direct POST. Larger attachments need upload session (defer to Phase 9).
- **flag_email:** Graph API expects `{ flag: { flagStatus, dueDateTime, ... } }` nested object.
- **list_mail_rules:** Read-only for MVP. Creating/updating rules is complex (defer to future phase).
- **create_mail_folder:** Can nest under parent_folder_id. Root if not specified.

### DEFAULT_SELECT Fields

```typescript
mailRule: [
  "id", "displayName", "sequence", "isEnabled", "hasError",
  "conditions", "actions"
],
```

---

## Reusable Utilities

All existing utilities from Phases 2-6 apply:

| Utility | Location | Used By |
|---|---|---|
| `fetchPage()` | `src/utils/pagination.ts` | All list tools |
| `buildSelectParam()` | `src/utils/response-shaper.ts` | All tools with $select |
| `encodeGraphId()` | `src/utils/graph-id.ts` | All tools with IDs in URL |
| `checkConfirmation()` | `src/utils/confirmation.ts` | All destructive tools |
| `idempotencyCache` | `src/utils/idempotency.ts` | All destructive tools |
| `formatPreview()` | `src/utils/confirmation.ts` | All destructive tools |
| `EmailAddressInput` | `src/schemas/mail-write.ts` | create_draft (reuse) |
| `resolveUserPath()` | `src/schemas/common.ts` | Multi-tenant support |

---

## Summary

| Sprint | New Tools | New Tests (est.) | New Scopes |
|---|---|---|---|
| 7.1 User & Directory | 7 | ~38 | User.Read.All, Directory.Read.All |
| 7.2 Mail Extensions | 7 | ~51 | None (existing Mail.ReadWrite) |
| **Total** | **14** | **~89** | **2 new scopes** |

### Verification

#### After Each Sprint
- `pnpm run lint:fix && pnpm run typecheck && pnpm run test`
- `pnpm run docs:generate`

#### E2E Tests

**Sprint 7.1:**
- get_my_profile → search_users → get_user → get_manager → list_direct_reports → list_user_groups → get_user_photo

**Sprint 7.2:**
- create_draft → add_attachment → send_draft
- list_mail_rules → create_mail_folder
- flag_email (flagged/complete/notFlagged)
- delete_email (last, permanent)

---

## Implementation Order

### Step 1: Azure Portal Configuration (Sprint 7.1 only)
Add `User.Read.All` and `Directory.Read.All` scopes, grant admin consent, re-authenticate.

### Step 2: Sprint 7.1 Implementation
- Create schemas (user.ts)
- Implement 4 tool modules (profile, search, org, photo)
- Create MSW handlers
- Write tests (~38 tests)
- Quality gates + E2E verification

### Step 3: Sprint 7.2 Implementation
- Create schemas (mail-extensions.ts)
- Implement 5 tool modules (delete, drafts, folders, flags, rules)
- Create MSW handlers
- Write tests (~51 tests)
- Quality gates + E2E verification

### Step 4: Documentation & Commit
- Update CHANGELOG, ROADMAP
- Create SPRINT_7_1.md and SPRINT_7_2.md
- Commit with `/commit` workflow
