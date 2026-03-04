# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - Production Readiness (v1.0.0 Conditions)
- Config upper bounds: maxItems .max(100), maxBodyLength .max(10000)
- Enhanced startup log with version, tool count (108), and config summary
- Production validation E2E script (scripts/test-production-validation-e2e.ts)

### Added - Production Readiness (Complete)
- Token cache file permissions set to 0600 for security
- GitHub Actions CI/CD pipeline with security audit
- LRU eviction for client cache (max 10 entries)
- Periodic health metrics logging (every 5 minutes)
- Graceful shutdown handlers (SIGTERM/SIGINT)
- Warning when AZURE_CLIENT_SECRET is set but unused
- Circuit breaker middleware (per-endpoint failure tracking)
- Request coalescing middleware (deduplicates concurrent GET requests)
- Tool timeout middleware (120s per invocation with AbortController)
- Tool rate limiting (1000 requests per 15 minutes per user)
- Memory monitoring with 80%/90% thresholds
- Pre-push git hook for quality gates
- Operations runbook (docs/OPERATIONS.md)

### Fixed
- Response body caching bug in CachingMiddleware (aeffb58)

## [0.0.1] - 2026-02-14

### Added - Phase 9: File Attachments, OneNote, Performance & Presence

#### Sprint 9.1: File Attachments & Large Upload
- `upload_large_file` - Resumable upload for files >4MB
- `attach_item` - Attach embedded Outlook items (itemAttachment)
- `attach_reference` - Attach OneDrive/SharePoint links (referenceAttachment)
- `poll_copy_status` - Check async copy completion

#### Sprint 9.2: OneNote Integration
- `list_notebooks` - List all OneNote notebooks
- `list_sections` - List sections in a notebook
- `list_pages` - List pages in a section
- `get_page_content` - Get page content (HTML or preview)
- `create_page` - Create new OneNote page
- `search_notes` - Search across all notes

#### Sprint 9.3: Performance Optimization
- Response caching layer with LRU cache (500 entries, configurable TTL)
- Automatic cache invalidation on write operations
- Cache metrics (hit rate, size, hits/misses)

#### Sprint 9.4: Presence Integration
- `get_my_presence` - Get your current presence status
- `get_presence` - Get another user's presence
- `set_status_message` - Set custom status message with expiration

**Total:** 108 tools across 11 modules

### Added - Phase 8: Advanced Features & Extensions (2026-02-13)

#### Sprint 8.1: Advanced Search & Delta Queries
- `advanced_search_emails` - KQL-based email search
- `search_events` - Search calendar events
- `advanced_search_contacts` - Advanced contact search
- `search_teams_messages` - Search Teams messages
- `search_all` - Cross-resource search
- `track_file_changes` - Delta queries for file changes

#### Sprint 8.2: Batch Operations
- `batch_move_emails` - Move multiple emails
- `batch_delete_emails` - Delete multiple emails
- `batch_flag_emails` - Flag multiple emails
- `batch_delete_events` - Delete multiple events
- `batch_move_files` - Move multiple files

#### Sprint 8.3: Advanced Calendar Features
- `create_recurring_event` - Create recurring events
- `update_event_series` - Update entire event series
- `list_event_instances` - List occurrences of recurring event
- `list_meeting_rooms` - List available meeting rooms
- `find_available_rooms` - Find rooms by capacity/features
- `share_calendar` - Share calendar with permissions

#### Sprint 8.4: Teams Advanced & Notifications
- `list_activity_feed` - Get Teams activity feed
- `list_mentions` - Get @mentions
- `get_meeting_transcript` - Get Teams meeting transcript
- `create_channel` - Create Teams channel
- `list_team_members` - List team members

**Total:** 95 tools after Phase 8

### Added - Phase 7: User Directory & Mail Extensions (2026-02-13)

#### Sprint 7.1: User & Directory Tools
- `get_my_profile` - Get your user profile
- `search_users` - Search directory for users
- `get_user` - Get user details
- `get_manager` - Get user's manager
- `list_direct_reports` - List direct reports
- `list_user_groups` - List user's group memberships
- `get_user_photo` - Get user's profile photo

#### Sprint 7.2: Mail Extensions
- `delete_email` - Delete emails
- `create_draft` - Create email draft
- `send_draft` - Send existing draft
- `add_attachment` - Add attachment to draft
- `create_mail_folder` - Create mail folder
- `flag_email` - Flag/unflag emails
- `list_mail_rules` - List mail rules

**Total:** 73 tools after Phase 7

### Added - Phase 6: Contacts & To Do (2026-02-13)

#### Contacts (7 tools)
- `list_contacts` - List contacts
- `get_contact` - Get contact details
- `search_contacts` - Search contacts
- `create_contact` - Create new contact
- `update_contact` - Update contact
- `delete_contact` - Delete contact
- `list_contact_folders` - List contact folders

#### To Do (7 tools)
- `list_todo_lists` - List To Do lists
- `get_todo_list` - Get list details
- `list_tasks` - List tasks in a list
- `get_task` - Get task details
- `create_task` - Create new task
- `update_task` - Update task
- `delete_task` - Delete task

**Total:** 59 tools after Phase 6

### Added - Phase 5: Teams & SharePoint (2026-02-13)

#### Teams (8 tools)
- `list_teams` - List joined Teams
- `list_channels` - List channels in a team
- `list_channel_messages` - List messages in a channel
- `send_channel_message` - Send message to channel
- `reply_to_channel_message` - Reply to channel message
- `list_chats` - List 1:1 and group chats
- `list_chat_messages` - List messages in a chat
- `send_chat_message` - Send chat message

#### SharePoint (8 tools)
- `search_sites` - Search SharePoint sites
- `get_site` - Get site details
- `list_site_drives` - List document libraries
- `list_site_lists` - List SharePoint lists
- `list_list_items` - List items in a list
- `create_list_item` - Create list item
- `update_list_item` - Update list item
- `delete_list_item` - Delete list item

**Total:** 45 tools after Phase 5

### Added - Phase 4: OneDrive & Technical Debt Cleanup (2026-02-12)

#### Sprint 4.1: Technical Debt
- Timezone localization (getUserTimezone, Prefer header)
- proposedNewTime for respond_to_event
- DRY attendees mapping (toAttendees utility)
- All user-facing strings → English

#### Sprint 4.2: OneDrive Read (5 tools)
- `list_files` - List files in OneDrive
- `search_files` - Search for files
- `get_file_metadata` - Get file details
- `download_file` - Download file content
- `get_recent_files` - List recently modified files

#### Sprint 4.3: OneDrive Write (5 tools)
- `upload_file` - Upload file (up to 4MB)
- `create_folder` - Create folder
- `move_file` - Move file/folder
- `copy_file` - Copy file (async)
- `share_file` - Create sharing link

**Total:** 29 tools after Phase 4

### Added - Phase 3: Calendar (2026-02-12)

#### Sprint 3.1: Calendar Read (4 tools)
- `list_calendars` - List calendars
- `list_events` - List calendar events
- `get_event` - Get event details
- `get_calendar_view` - Get events in date range

#### Sprint 3.2: Calendar Write (5 tools)
- `create_event` - Create calendar event
- `update_event` - Update event
- `delete_event` - Delete event
- `respond_to_event` - Accept/decline/tentative
- `check_availability` - Check free/busy schedule

**Total:** 19 tools after Phase 3

### Added - Phase 2: Mail Write & Auth (2026-02-12)

#### Sprint 2.1: Mail Read (3 tools)
- `read_email` - Read email with full body
- `list_mail_folders` - List mail folders
- `search_emails` - Search emails

#### Sprint 2.2: Mail Write (3 tools)
- `send_email` - Send new email with confirmation
- `reply_email` - Reply to email
- `forward_email` - Forward email

#### Sprint 2.3: Mail Organization & Attachments (4 tools)
- `move_email` - Move email to folder
- `list_attachments` - List email attachments
- `download_attachment` - Download attachment (up to 10MB)

#### Auth Features
- Persistent MSAL token cache (~/.ms-mcp/token-cache.json)
- Auth CLI: `pnpm auth login/status/logout`
- Fail-fast startup check
- Device Code Flow support

**Total:** 10 tools after Phase 2

### Added - Phase 1: Foundation (2026-02-11)

#### Infrastructure
- MCP SDK integration (@modelcontextprotocol/sdk)
- Microsoft Graph API client setup
- MSAL authentication (Device Code Flow)
- Zod schema validation
- Error handling middleware
- Retry middleware (exponential backoff)
- Logging middleware (pino, no PII)
- Test infrastructure (Vitest + MSW)
- Biome linting & formatting

#### First Tool
- `list_emails` - List emails from mailbox

### Added - Phase 0: Project Scaffold (2026-02-11)
- TypeScript project setup
- ESM configuration
- tsup build tooling
- pnpm package manager
- Git repository initialization

## [0.0.0] - 2026-02-11

Initial project creation.

---

[Unreleased]: https://github.com/klapom/ms-mcp/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/klapom/ms-mcp/releases/tag/v0.0.1
[0.0.0]: https://github.com/klapom/ms-mcp/releases/tag/v0.0.0
