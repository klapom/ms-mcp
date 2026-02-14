# Architecture

## Overview

pommer-m365-mcp is a local MCP Server that exposes the Microsoft Graph API through domain-specific tools to Claude Desktop and other MCP clients.

```
Claude Desktop/Cowork ←→ stdio ←→ pommer-m365-mcp ←→ HTTPS ←→ Microsoft Graph API
```

## Layered Architecture

The server is organized into six distinct layers, each responsible for a specific concern:

### 1. MCP Layer (`src/index.ts`)

- **Responsibility:** Tool registration, MCP protocol handling, stdio transport
- **Key Features:**
  - Loads configuration via `loadConfig()` (env: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`)
  - Initializes authentication via `createDefaultAuthDeps()` (creates MSAL client with persistent token cache)
  - Implements fail-fast: checks for cached token before starting MCP server (exits with instructions if not authenticated)
  - Registers 108 tools from all domain modules (Mail, Calendar, OneDrive/SharePoint, Teams, SharePoint Lists, Contacts, To Do, OneNote, Presence, User & Directory, Advanced Features)
  - Establishes stdio transport for MCP JSON-RPC communication

### 2. Tool Layer (`src/tools/`)

- **Responsibility:** Domain-specific request handlers organized by domain module
- **Module Organization (108 tools across 11 modules):**
  - **Mail** (20 tools): `mail.ts`, `mail-read.ts`, `mail-search.ts`, `mail-folders.ts`, `mail-send.ts`, `mail-reply.ts`, `mail-forward.ts`, `mail-move.ts`, `mail-attachments.ts`, `mail-delete.ts`, `mail-drafts.ts`, `mail-folder-create.ts`, `mail-flag.ts`, `mail-rules-list.ts`, `mail-attach-item.ts`, `mail-attach-reference.ts`
  - **Calendar** (9 tools): `calendar-list.ts`, `calendar-events.ts`, `calendar-view.ts`, `calendar-create.ts`, `calendar-update.ts`, `calendar-delete.ts`, `calendar-respond.ts`, `calendar-availability.ts`
  - **OneDrive/SharePoint** (12 tools): `drive-list.ts`, `drive-search.ts`, `drive-metadata.ts`, `drive-download.ts`, `drive-upload.ts`, `drive-upload-large.ts`, `drive-folder.ts`, `drive-move.ts`, `drive-copy.ts`, `drive-copy-status.ts`, `drive-share.ts` (supports SharePoint via `site_id`/`drive_id`)
  - **Teams** (8 tools): `teams-list.ts`, `teams-messages.ts`, `teams-send.ts`, `teams-chats.ts`, `teams-chat-messages.ts`
  - **SharePoint** (8 tools): `sharepoint-sites.ts`, `sharepoint-lists.ts`, `sharepoint-list-write.ts`
  - **Contacts** (7 tools): `contacts-read.ts`, `contacts-search.ts`, `contacts-write.ts`
  - **To Do** (7 tools): `todo-lists.ts`, `todo-tasks.ts`, `todo-tasks-write.ts`
  - **OneNote** (6 tools): `onenote-notebooks.ts`, `onenote-sections.ts`, `onenote-pages.ts`, `onenote-search.ts`
  - **Presence** (3 tools): `presence.ts` — Real-time presence and status management
  - **User & Directory** (7 tools): `user-profile.ts`, `user-search.ts`, `user-org.ts`, `user-photo.ts`
  - **Advanced Features** (15 tools): Message signing, meeting room finder, delegate access, advanced sharing (Phase 8)

- **Pattern:** Each module exports a `register*Tools()` function that calls `server.tool()` for each tool in that domain

### 3. Schema Layer (`src/schemas/`)

- **Responsibility:** Zod-based input validation (Single Source of Truth)
- **Key Design:**
  - All user inputs validated against Zod schemas before handler execution
  - Schemas extend `BaseParams` for consistency
  - Zod `.shape` object passed to `server.tool()` for MCP parameter definition
  - Automatic generation of TypeScript types from schemas (no manual type duplication)
  - Example: Mail schemas (`mail.ts`), Calendar schemas (`calendar-write.ts`, `calendar-read.ts`), Drive schemas (`drive.ts`), Teams schemas (`teams.ts`), SharePoint schemas (`sharepoint.ts`)

### 4. Middleware Layer (`src/middleware/`)

- **Responsibility:** Cross-cutting concerns: caching, error mapping, logging, retry logic
- **Components:**
  - **CachingMiddleware** (`caching-middleware.ts`): Transparent response caching for GET requests
    - Cache-before-request check for GET operations
    - Cache-after-response store for successful GET responses
    - Automatic cache invalidation on POST/PATCH/DELETE operations
    - Pattern-based invalidation: POST → invalidate list, PATCH/DELETE → invalidate detail and list
    - TTL-based expiration with per-resource configuration (cache-config.ts)
    - Cache metrics for observability (hits, misses, size, hit rate)
  - **ErrorMappingMiddleware** (`error-mapping.ts`): Maps Graph HTTP errors → typed MCP errors
    - HTTP 400 → `ValidationError`
    - HTTP 401 → `AuthError`
    - HTTP 403 → `AuthError` (with scope extraction)
    - HTTP 404 → `NotFoundError`
    - HTTP 409 → `ConflictError`
    - HTTP 429 → `RateLimitError` (with Retry-After parsing)
    - HTTP 5xx → `ServiceError`
    - Network errors (ECONNREFUSED, ETIMEDOUT, etc.) → `NetworkError`
  - Attached to Graph client via middleware chain in `getGraphClient()`

### 5. Auth Layer (`src/auth/`)

- **Responsibility:** Azure AD authentication and token management
- **Components:**
  - **MsalClient** (`msal-client.ts`):
    - Supports Device Code Flow for interactive auth (outputs to stderr, not stdout)
    - Implements silent token acquisition (cache-first, then refresh)
    - Method `getAccessToken()`: Falls back to Device Code Flow if no cached token
    - Method `getAccessTokenSilentOnly()`: Returns null on failure (used for fail-fast check)
    - Throws `AuthTokenError` for invalid_grant/AADSTS65001/AADSTS50076 with clear user instructions
    - Supports optional `ICachePlugin` for persistent token storage across restarts
  - **Token Cache Plugin** (`token-cache.ts`):
    - Implements `ICachePlugin` interface from @azure/msal-node
    - Backed by `FilePersistence` (plaintext JSON in `~/.ms-mcp/token-cache.json`)
    - Async initialization via `createCachePlugin(cachePath)`
  - **Graph Client Factory** (`graph-client.ts`):
    - Creates configured Microsoft Graph client
    - Attaches error-mapping middleware
    - Accepts `GraphClientDeps` (MSAL client or compatible auth provider)

### 6. Utils Layer (`src/utils/`)

- **Responsibility:** Cross-cutting utilities used across all domains
- **Key Utilities:**
  - **Confirmation** (`confirmation.ts`): Destructive safety pattern
    - `checkConfirmation()`: Returns preview if `confirm=false`, allows execution if `confirm=true`
    - Tool classifications: `safe`, `moderate`, `destructive`
    - `formatPreview()`: Human-readable confirmation preview
  - **Idempotency** (`idempotency.ts`): Deduplication of duplicate requests
    - `IdempotencyCache`: In-memory cache with TTL (10 min default)
    - Composite key: `userId:toolName:idempotencyKey`
    - Multi-tenant isolation via userId in key
  - **Response Shaping** (`response-shaper.ts`): Context budget management
    - `DEFAULT_SELECT`: OData $select fields per entity type (mail, event, file, calendar, etc.)
    - `shapeListResponse()`: Limits items, truncates body fields, adds pagination hint
    - `buildSelectParam()`: Constructs OData $select query parameter
  - **Graph ID Encoding** (`graph-id.ts`): Safe URL encoding for Graph IDs
    - `encodeGraphId()`: Percent-encodes special characters in IDs while preserving commas (SharePoint composite site IDs)
    - Used on all tools that pass IDs to Graph API
  - **Drive Path Resolution** (`drive-path.ts`): Multi-tenant OneDrive/SharePoint support
    - `resolveDrivePath()`: Returns `/me/drive`, `/users/{userId}/drive`, or `/sites/{siteId}/drives/{driveId}`
  - **HTML Conversion** (`html-convert.ts`): Email/event body HTML → plain text
    - `htmlToPlainText()`: Strips tags, decodes entities, handles inline styles
  - **File Size Formatting** (`file-size.ts`): Human-readable byte display
    - `formatFileSize()`: Converts bytes → KB/MB/GB with appropriate precision
    - `isTextContent()`: Detects text MIME types
  - **Recipients Mapping** (`recipients.ts`): DRY helpers for email/calendar recipients
    - `toRecipients()`: Converts email address → Graph recipient object
    - `toAttendees()`: Converts email address → Graph attendee object
  - **Logging** (`logger.ts`): Structured JSON logging via pino
    - `createLogger()`: Scoped logger (no PII, no tokens logged)
  - **Path Resolution** (`path.ts`): Tilde expansion for config paths
    - `resolveTildePath()`: Expands `~` to home directory
  - **Cache Manager** (`cache.ts`): LRU cache with TTL and invalidation
    - `CacheManager`: In-memory LRU cache with configurable max size
    - `get()`: Retrieve cached value with TTL check
    - `set()`: Store value with TTL and LRU eviction
    - `invalidatePattern()`: Invalidate caches matching URL pattern (for write operations)
    - `getMetrics()`: Observability metrics (hits, misses, size, hit rate)
    - Attached to Graph client middleware stack for transparent caching

## Cross-Cutting Patterns

Every tool implements these five core patterns to ensure consistency and safety:

### 1. Context Budget Management

**Problem:** Graph API responses can contain large nested objects that exceed MCP context limits.

**Solution:**
- Use OData `$select` to request only needed fields
- Define `DEFAULT_SELECT` for each entity type in `response-shaper.ts`
- Pass `$select` query parameter to all list/get endpoints
- Truncate body fields (email bodies, event descriptions) to max length
- Limit result items per page (e.g., 25 items max)
- Add pagination hint: `"Showing X of Y results. Use skip: Z for next page."`

**Example:**
```typescript
// Mail list request
`/v1.0/me/mailFolders/inbox/messages?$select=${buildSelectParam(DEFAULT_SELECT.mail)}&$top=25`

// Response shaping
shapeListResponse(items, totalCount, { maxItems: 25, maxBodyLength: 500 }, ['body.content'])
```

### 2. Destructive Safety

**Problem:** Tools that delete/move/send resources could be triggered unintentionally.

**Solution:**
- All write operations require `confirm` parameter (boolean)
- If `confirm=false` (default), return a preview showing what would happen
- If `confirm=true`, execute the operation
- Classifications: `safe` (no confirmation), `moderate` (confirmation optional), `destructive` (confirmation required)

**Example:**
```typescript
const preview = checkConfirmation('destructive', confirm,
  formatPreview('Delete email', { messageId, subject })
);
if (preview) return preview.message;
// Execute delete...
```

### 3. Idempotency

**Problem:** Network failures or retries could cause duplicate operations (send two emails, create two folders).

**Solution:**
- All write operations accept `idempotency_key` parameter (optional string)
- First request: Check cache, if miss, execute and cache result
- Retry: Check cache, return cached result without re-executing
- Cache TTL: 10 minutes per key
- Multi-tenant: Composite key includes userId

**Example:**
```typescript
const cached = idempotencyCache.get('send_email', idempotencyKey, userId);
if (cached) return cached; // Duplicate detected

const result = await sendEmail(...);
idempotencyCache.set('send_email', idempotencyKey, result, userId);
return result;
```

### 4. Observability (Logging)

**Problem:** Need to troubleshoot issues without exposing sensitive data (PII, tokens, content).

**Solution:**
- Use structured JSON logging via pino
- Log only metadata: tool name, HTTP status, latency, request ID
- NEVER log: email bodies, subjects, recipients, attachments, tokens, auth headers
- Each module has scoped logger (e.g., `createLogger('mail')`)

**Example:**
```typescript
logger.info({ toolName: 'send_email', status: 202, requestId: 'abc123' }, 'Email sent');
// NOT: logger.info({ to: 'user@example.com', body: '...' })
```

### 5. Error Mapping

**Problem:** Graph API HTTP errors need user-friendly presentation in MCP.

**Solution:**
- ErrorMappingMiddleware catches all Graph API errors
- Maps HTTP status + error code → typed MCP error
- Preserves error details (message, code, innerError) for debugging
- Multi-tenant: user_id optional parameter on all tools

**Example:**
```typescript
// Graph API returns 404
// ErrorMappingMiddleware throws NotFoundError('messages', 'abc123')
// MCP returns: { isError: true, message: "messages with ID abc123 not found" }
```

## Tool Pattern (Standard Template)

Every tool follows this structure:

```
1. Schema Definition (src/schemas/domain.ts)
   - Zod schema extending BaseParams
   - Input validation rules
   - Parameter descriptions

2. Handler Implementation (src/tools/domain.ts)
   - Takes parsed params from schema
   - Constructs Graph API URL with $select
   - Calls Graph client
   - Handles errors via middleware
   - Shapes response for context budget
   - Returns MCP-compatible output

3. Registration (src/index.ts)
   - register* function exported from tool module
   - Calls server.tool() with schema.shape and handler
   - Added to registrations array

4. Tests (tests/domain.test.ts)
   - Unit tests with MSW mocks
   - Happy path: successful operation
   - Error cases: 404, 403, 500, network errors
   - Pagination: multiple pages, last page
   - Validation: invalid inputs
   - Destructive ops: confirm=false (preview), confirm=true (execute)
   - Idempotency: duplicate request detection
```

## Security Model

### Authentication
- **Device Code Flow:** User opens link in browser, authentication happens out-of-band
- **Token Cache:** Persistent JSON file at `~/.ms-mcp/token-cache.json` (user-readable, encrypted by OS)
- **Fail-Fast:** Server exits if no cached token (prevents silent auth failures in MCP mode)
- **Scopes:** Fixed set of scopes requested on login (User.Read, Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, Files.ReadWrite, Contacts.ReadWrite, Tasks.ReadWrite, Notes.ReadWrite, Teams.ReadWrite, Sites.ReadWrite.All, ChannelMessage.Send)

### Authorization
- **Graph API Enforces:** Microsoft 365 access controls
- **Multi-Tenant:** Optional `user_id` parameter allows delegated access (if token has admin consent)

### Data Protection (DSGVO)
- **PII Handling:** Never log email bodies, subjects, recipients, attachment names
- **Token Handling:** Never log token values, authorization headers
- **Response Filtering:** Strip PII from error messages when possible
- **Data Persistence:** Only token cache persisted (OAuth tokens, no content)

## Module Responsibilities

| Module | Tools | Responsibility | Key Resources |
|--------|-------|-----------------|----------------|
| **Mail** | 20 | Email CRUD, search, attachments | list_emails, read_email, send_email, move_email, download_attachment |
| **Calendar** | 9 | Events, availability, RSVP | list_events, create_event, respond_to_event, check_availability |
| **OneDrive/SharePoint** | 12 | File storage, sharing, large uploads | list_files, upload_file, upload_large_file, share_file, move_file, copy_file, poll_copy_status |
| **Teams** | 8 | Team collaboration, channels, chats | list_teams, send_channel_message, list_chats, send_chat_message |
| **SharePoint** | 8 | Site structure, lists, list items | search_sites, list_list_items, create_list_item |
| **Contacts** | 7 | Contact CRUD, search, folders | list_contacts, get_contact, create_contact, delete_contact |
| **To Do** | 7 | Task lists, tasks, CRUD | list_todo_lists, list_tasks, create_task, update_task, delete_task |
| **OneNote** | 6 | Note-taking, notebooks, sections, pages | list_notebooks, list_sections, list_pages, get_page_content, create_page, search_notes |
| **Presence** | 3 | Real-time status, availability | get_my_presence, get_presence, set_status_message |
| **User & Directory** | 7 | User profiles, search, org chart | get_my_profile, search_users, get_user, get_manager, list_direct_reports, list_user_groups, get_user_photo |
| **Auth** | — | Token acquisition, caching | MSAL Device Code Flow, persistent file cache |
| **Utils** | — | Shared concerns | Response shaping, error mapping, logging, pagination |

## Development Workflow

### Adding a New Tool

1. **Define Schema** (`src/schemas/domain.ts`)
   ```typescript
   export const GetItemParamsSchema = BaseParams.extend({
     itemId: z.string().describe('Item ID'),
     userId: z.string().optional().describe('User ID (default: me)'),
   });
   ```

2. **Implement Handler** (`src/tools/domain.ts`)
   ```typescript
   async function handleGetItem(params, graphClient, config) {
     const { itemId, userId } = params;
     const url = `${resolveDrivePath(userId)}/items/${encodeGraphId(itemId)}`;
     const result = await graphClient.api(url)
       .select(buildSelectParam(DEFAULT_SELECT.file))
       .get();
     return result;
   }
   ```

3. **Register Tool** (in `src/index.ts`)
   ```typescript
   server.tool('get_item', GetItemParamsSchema.shape, handleGetItem);
   ```

4. **Write Tests** (`tests/domain.test.ts`)
   - MSW handlers for Graph endpoints
   - Happy path + error cases
   - Pagination if applicable
   - Validation errors

5. **Build & Test**
   ```bash
   pnpm build       # Compile TypeScript
   pnpm test        # Run unit tests with MSW
   pnpm lint        # Check with Biome
   ```

### Testing Strategy

- **Unit Tests:** Vitest + MSW (Mock Service Worker)
  - 1200+ tests across 80+ test files
  - MSW intercepts HTTP requests, returns mock Graph responses
  - Tests validation, happy path, error cases, pagination, confirmation
- **E2E Tests:** Real M365 Developer Tenant
  - Manual, run nightly in CI
  - Tests against real Graph API
  - Requires licensed user (admin account may not have Exchange license)

## Configuration

### Environment Variables
```
AZURE_TENANT_ID       # Azure AD tenant ID (required)
AZURE_CLIENT_ID       # App registration client ID (required)
TOKEN_CACHE_PATH      # Token cache file path (default: ~/.ms-mcp/token-cache.json)
LOG_LEVEL            # Pino log level (default: info)
```

### Config Loading (`src/config.ts`)
- Reads from environment variables
- Validates required fields
- Provides defaults for optional fields
- Used by MSAL client and logger

## Deployment

### Local Development
```bash
pnpm install        # Install dependencies
pnpm dev            # Run dev server with hot-reload
pnpm auth login     # Authenticate with Device Code Flow
```

### Build for Production
```bash
pnpm build          # TypeScript → JavaScript (ESM)
npm install -g .    # Install globally from dist/
npx pommer-m365-mcp # Run MCP server
```

### MCP Client Configuration
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "ms-mcp": {
      "command": "npx",
      "args": ["pommer-m365-mcp"],
      "env": {
        "AZURE_TENANT_ID": "tenant-id",
        "AZURE_CLIENT_ID": "client-id"
      }
    }
  }
}
```

## Tech Stack

| Component | Library | Version | Purpose |
|-----------|---------|---------|---------|
| Runtime | Node.js | 22+ | JavaScript runtime |
| Language | TypeScript | 5.x | Type safety |
| MCP SDK | @modelcontextprotocol/sdk | latest | MCP protocol implementation |
| Graph Client | @microsoft/microsoft-graph-client | latest | Microsoft Graph API calls |
| Auth | @azure/msal-node | latest | Azure AD authentication |
| Validation | zod | latest | Schema validation & type generation |
| Test Runner | vitest | latest | Unit test execution |
| Test Mocks | msw | latest | HTTP request mocking |
| Lint/Format | biome | latest | Code quality |
| Build | tsup | latest | TypeScript bundler |
| Logging | pino | latest | Structured JSON logging |
| Package Manager | pnpm | latest | Dependency management |

## Performance Considerations

- **Response Caching:** CachingMiddleware provides transparent LRU caching with TTL for GET requests
  - Reduces redundant Graph API calls for repeated reads
  - Automatic invalidation on write operations (POST/PATCH/DELETE)
  - Per-resource TTL configuration (default: 5 minutes for lists, 10 minutes for details)
  - Cache metrics available for observability and tuning
- **Context Budget:** DEFAULT_SELECT limits fields per entity type, responses truncated to 500-1000 chars per body field
- **Pagination:** All list operations paginate with `$top=25` by default, provide `skip` for subsequent pages
- **Token Cache:** Persistent file cache reduces Device Code Flow prompts on restarts
- **Auth Error Handling:** Clear error messages for scope changes, revoked consent, and invalid tokens (AuthTokenError)
- **Error Mapping:** Single middleware layer catches all errors, no per-tool error handling duplication
- **Logging:** Structured JSON allows efficient parsing and filtering by observability tools
- **Graph API Quirks:** Some endpoints don't support pagination parameters; fallback to client-side filtering where needed

## Webhooks & Change Notifications

While the MCP server itself does not implement webhook endpoints (unsuitable for local/CLI tools), comprehensive documentation is provided for external services:

- **[docs/WEBHOOKS.md](../WEBHOOKS.md)** — Patterns for consuming Microsoft Graph change notifications
  - Real-time subscription patterns for Mail, Calendar, OneDrive, Teams, Contacts, To Do
  - Webhook validation and handling
  - Subscription lifecycle management (renewal, expiration)
  - Client state authentication for notifications
  - Example endpoint implementations in Python, Node.js

This documentation enables building complementary services that receive real-time updates from Microsoft 365 and feed them into the MCP server via polling or event-driven architectures.

## Future Enhancements

- **Teams:** Message threads, reactions
- **SharePoint:** Document library versioning, advanced permissions
- **Contacts:** Group management, advanced filtering
- **To Do:** Recurring tasks, task categories, advanced scheduling
- **Advanced Drive:** Delta sync, versioning, sharing permissions
- **External Integrations:** Webhook consumer patterns, event-driven architecture support
