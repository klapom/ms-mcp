# pommer-m365-mcp

Office 365 MCP Server for Claude Desktop and Claude Code. Direct access to Microsoft 365 via natural language.

## What is this?

An MCP Server (Model Context Protocol) that exposes the Microsoft Graph API through domain-specific tools for Claude. No browser switching, no copy-paste workflows — read emails, search folders, manage calendars, upload files, and collaborate in Teams directly in your chat. The server runs locally as a subprocess and is started by Claude Desktop or Claude Code via the MCP protocol.

## Features

### Available (Sprint 9.3 Complete - Infrastructure optimization)

**105 tools across 10 modules** with response caching:

#### Mail (20 tools)
`list_emails` · `read_email` · `search_emails` · `list_mail_folders` · `send_email` · `reply_email` · `forward_email` · `move_email` · `list_attachments` · `download_attachment` · `delete_email` · `create_draft` · `send_draft` · `add_attachment` · `flag_email` · `create_mail_folder` · `list_mail_rules` · `attach_item` · `attach_reference`

#### Calendar (9 tools)
`list_calendars` · `list_events` · `get_event` · `get_calendar_view` · `create_event` · `update_event` · `delete_event` · `respond_to_event` · `check_availability`

#### OneDrive (12 tools)
`list_files` · `search_files` · `get_file_metadata` · `download_file` · `get_recent_files` · `upload_file` · `upload_large_file` · `create_folder` · `move_file` · `copy_file` · `poll_copy_status` · `share_file`

#### Teams (8 tools)
`list_teams` · `list_channels` · `list_channel_messages` · `send_channel_message` · `reply_to_channel_message` · `list_chats` · `list_chat_messages` · `send_chat_message`

#### SharePoint (8 tools)
`search_sites` · `get_site` · `list_site_drives` · `list_site_lists` · `list_list_items` · `create_list_item` · `update_list_item` · `delete_list_item`

#### Contacts (7 tools)
`list_contacts` · `get_contact` · `search_contacts` · `create_contact` · `update_contact` · `delete_contact` · `list_contact_folders`

#### To Do (7 tools)
`list_todo_lists` · `get_todo_list` · `list_tasks` · `get_task` · `create_task` · `update_task` · `delete_task`

#### OneNote (6 tools)
`list_notebooks` · `list_sections` · `list_pages` · `get_page_content` · `create_page` · `search_notes`

#### User & Directory (7 tools)
`get_my_profile` · `search_users` · `get_user` · `get_manager` · `list_direct_reports` · `list_user_groups` · `get_user_photo`

## Roadmap Status

**Sprint 9.3: Complete** (Infrastructure optimization - Response caching + Webhooks docs)
- Response caching layer with LRU cache and TTL-based expiration
- CachingMiddleware for transparent GET request caching on Graph API
- Automatic cache invalidation on write operations (POST/PATCH/DELETE)
- Comprehensive webhooks documentation for external service integration
- Tool count remains 105 (infrastructure only, no new tools)

**Phase 9 (Complete):** File attachments, large file uploads, async operations, OneNote integration, caching
- Sprint 9.1: `attach_item`, `attach_reference`, `upload_large_file`, `poll_copy_status`
- Sprint 9.2: `list_notebooks`, `list_sections`, `list_pages`, `get_page_content`, `create_page`, `search_notes`
- Sprint 9.3: Response caching, webhooks documentation

**Phase 10+: Future Enhancements** (Planned)
- Mail: Message signing, advanced attachment streaming
- Calendar: Recurring events, meeting room finder
- Drive: Delta sync, versioning, advanced permissions
- Teams: Threaded replies, reactions, file sharing
- SharePoint: Document versioning, advanced list queries
- Contacts: Group management, distribution lists
- To Do: Task dependencies, recurring tasks
- Notifications: Webhook subscriptions, real-time updates

## Example Prompts

### Inbox Triage
> "Summarize my unread emails from the last 24 hours. Categorize by: urgent, informational, delegate-able."

Claude uses `list_emails` (filter: `isRead eq false`), then `read_email` for each message to build a structured summary.

### Quick Search
> "Find all emails from alice@company.com about Q4 budget"

Claude uses `search_emails` with KQL: `from:alice@company.com subject:"Q4 budget"`

### Calendar Sync
> "Show me my calendar for next week and suggest 1-hour slots where I can meet with 3 people (bob@, carol@, dave@)"

Claude uses `get_calendar_view` and `check_availability` to identify free slots across all attendees.

### File Management
> "Upload my proposal.pdf to OneDrive and share it with the Marketing team"

Claude uses `upload_file`, then `share_file` to grant access.

### Large File Upload
> "Upload a 500 MB video file to the project folder in OneDrive"

Claude uses `upload_large_file` for files >4 MB, `poll_copy_status` to monitor progress.

### Team Collaboration
> "Send a message to the #general channel in my Sales team with a summary of today's results"

Claude uses `send_channel_message` to post updates in real time.

## Quickstart

Detailed setup instructions: **[docs/SETUP.md](docs/SETUP.md)**

```bash
# Clone and install
git clone https://github.com/klapom/ms-mcp.git
cd ms-mcp
pnpm install

# Build
pnpm build

# Authenticate (interactive Device Code Flow)
pnpm auth login

# Check authentication status
pnpm auth status

# Start the server (for testing)
pnpm dev

# Run tests
pnpm test
```

## Technology

| Component | Technology |
|---|---|
| Runtime | Node.js 22+, TypeScript 5.x (strict mode) |
| MCP Protocol | @modelcontextprotocol/sdk |
| Graph API | @microsoft/microsoft-graph-client |
| Authentication | MSAL Node (Device Code Flow) |
| Token Cache | File-based (encrypted recommended for production) |
| Input Validation | Zod (Single Source of Truth) |
| Testing | Vitest + MSW (Mock Service Worker) |
| Linting & Format | Biome (no ESLint/Prettier) |
| Build Tool | tsup |
| Logging | pino (structured JSON, GDPR-compliant) |
| Test Coverage | 1200+ unit tests across 80+ test files, E2E suite against M365 tenant |
| Response Caching | LRU cache with TTL and automatic invalidation for GET requests |

## Key Design Principles

### Safety
- **Destructive Operations:** All write operations require explicit `confirm=true` parameter
- **Idempotency:** Write operations support `idempotency_key` to prevent duplicates
- **Fail-Fast:** Server exits immediately at startup if authentication fails (no silent errors)
- **Preview Mode:** Dry-run preview before confirmation on destructive operations

### Privacy & Compliance
- **GDPR-Compliant:** No logging of email bodies, subjects, recipients, file contents, or PII
- **Stateless Proxy:** No persistent data storage; token cache is encrypted on disk
- **Metadata Only:** Logs contain tool name, HTTP status, latency, and request ID
- **Context Budget:** All Graph queries use `$select` to minimize data transfer
- **No Token Leaks:** Authorization headers and sensitive values never logged

### Reliability
- **Multi-Tenant Support:** Optional `user_id` parameter on all tools for delegated access
- **Pagination:** All list operations support standard pagination (`top`, `skip`)
- **Error Mapping:** Graph API errors mapped to user-friendly MCP error responses
- **Structured Logging:** All Graph calls logged via pino for observability (no sensitive data)

### Developer Experience
- **Zod as SSoT:** Single source of truth for schemas → TypeScript types → JSON Schema → Runtime validation
- **MCP Tool Pattern:** Consistent pattern across all 105 tools (schema → handler → registration → tests)
- **Test Coverage:** Happy path, error cases, pagination, validation for each tool
- **Dev Server:** Hot-reload with `pnpm dev`

## Architecture

For detailed architecture, design decisions, and technical debt tracking:

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System design, data flow, error handling
- **[docs/TECHNICAL_DEBT.md](docs/TECHNICAL_DEBT.md)** — Known limitations, refactoring backlog, future improvements
- **[docs/USE-CASES.md](docs/USE-CASES.md)** — Real-world scenarios and workflows (updated for Sprint 9.2)
- **[docs/PERMISSIONS.md](docs/PERMISSIONS.md)** — API scopes and tool permissions (updated for Sprint 9.2)

## Authentication

The server uses Microsoft's **Device Code Flow** for authentication:

1. Run `pnpm auth login` to open the authentication flow
2. You'll see a device code and URL to visit
3. Authenticate in your browser
4. The token is cached locally at `~/.ms-mcp/token-cache.json`
5. Subsequent calls use the cached token silently

To check your current authentication status:
```bash
pnpm auth status
```

To log out:
```bash
pnpm auth logout
```

After logout, you must re-authenticate with `pnpm auth login` before using the server again.

## Privacy

We take privacy seriously. This server follows GDPR guidelines and best practices:

- **No PII Logging:** Email bodies, subjects, recipients, and file contents are never logged
- **Stateless Architecture:** The server is a pure proxy with no persistent state beyond the token cache
- **Token Security:** Access tokens are stored in your local token cache (recommended: use OS Keychain for production)
- **Audit Trail:** All API calls are logged with metadata (request ID, tool name, status, latency) for troubleshooting

See [docs/DATA-PRIVACY.md](docs/DATA-PRIVACY.md) for detailed privacy policy.

## Commands

```bash
# Development
pnpm dev              # Start dev server with hot-reload
pnpm build            # Build production bundle (dist/)
pnpm test             # Run all unit tests
pnpm test:e2e         # Run E2E tests against M365 tenant (requires auth)
pnpm lint             # Check code style (Biome)
pnpm lint:fix         # Auto-fix code style issues
pnpm typecheck        # Run TypeScript strict type checking

# Authentication
pnpm auth login       # Authenticate with Device Code Flow
pnpm auth status      # Check authentication status
pnpm auth logout      # Clear cached token
```

## Integration with Claude Desktop / Code

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "m365": {
      "command": "node",
      "args": ["/path/to/ms-mcp/dist/index.js"],
      "env": {
        "AZURE_CLIENT_ID": "your-app-registration-id",
        "AZURE_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

Or use `pommer-m365-mcp` npm package (when published).

## Example Usage in Claude

Once the MCP server is connected:

```
You: "List my calendars and show me the next 3 events"
Claude uses: list_calendars → get_calendar_view → returns formatted event list

You: "Create a 1-hour meeting with alice@company.com on Tuesday at 2 PM"
Claude uses: check_availability (preview) → create_event (confirm) → confirmation message

You: "Search for all emails mentioning 'contract' and download the first PDF attachment"
Claude uses: search_emails → read_email → list_attachments → download_attachment → base64 file
```

## Testing

The project includes comprehensive test coverage:

- **Unit Tests:** 1162+ tests covering all tools, error cases, pagination, and validation
- **E2E Tests:** Integration tests against a real M365 developer tenant (nightly runs)
- **MSW Mocks:** All Graph API endpoints mocked for fast, deterministic unit tests
- **Snapshot Tests:** Verify formatted output consistency

Run tests:
```bash
pnpm test              # All unit tests
pnpm test:e2e          # E2E against real tenant
pnpm test mytest.ts    # Single file
pnpm test -- -t "tool name"  # By pattern
```

## License

UNLICENSED — Pommer IT-Consulting GmbH

## Support

For issues, feature requests, or documentation:

- GitHub Issues: https://github.com/klapom/ms-mcp/issues
- Documentation: [docs/](docs/) folder
- Setup Help: [docs/SETUP.md](docs/SETUP.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
