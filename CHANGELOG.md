# Changelog

All notable changes to this project are documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Note:** All entries translated to English. Original German entries have been preserved for historical context.

## [Unreleased]

### Added
- **User & Directory tools (7 new tools):** `get_my_profile`, `search_users`, `get_user`, `get_manager`, `list_direct_reports`, `list_user_groups`, `get_user_photo`
- New scopes required: User.Read.All, Directory.Read.All (Sprint 7.1)
- Phase 6 documentation and specification

### Fixed
- **encodeGraphId** now preserves commas in SharePoint composite site IDs (e.g., "hostname,guid,guid") while safely encoding other special characters
- **list_chats** removed unsupported `$orderby` on `lastUpdatedDateTime` — Graph API doesn't support ordering this field
- **list_site_lists** replaced unsupported `$filter` on list/hidden with client-side filtering for tenant compatibility
- **list_teams** and **list_channels** removed unsupported pagination parameters (`$top`/`$skip`) — Graph API doesn't support these on `/me/joinedTeams` and `/teams/{id}/channels`
- **Auth error handling** improved: `AuthTokenError` thrown for invalid_grant/AADSTS65001/AADSTS50076 with clear user instructions to re-authenticate

---

## [0.15.0] -- 2026-02-13

### Added
- **list_contacts** Tool -- List contacts with pagination
- **get_contact** Tool -- Get contact details
- **search_contacts** Tool -- Search for contacts by name/email
- **create_contact** Tool -- Create new contact (destructive, requires confirm + idempotency_key)
- **update_contact** Tool -- Update contact details (destructive, requires confirm)
- **delete_contact** Tool -- Delete contact (destructive, requires confirm)
- **list_contact_folders** Tool -- List contact folders
- **list_todo_lists** Tool -- List To Do lists
- **get_todo_list** Tool -- Get To Do list details
- **list_tasks** Tool -- List tasks in a To Do list with pagination
- **get_task** Tool -- Get task details
- **create_task** Tool -- Create new task (destructive, requires confirm + idempotency_key)
- **update_task** Tool -- Update task details (destructive, requires confirm)
- **delete_task** Tool -- Delete task (destructive, requires confirm)
- 752 tests (59 tools total, 52 test files)
- Contacts and To Do modules (contacts-read.ts, contacts-search.ts, contacts-write.ts, todo-lists.ts, todo-tasks.ts, todo-tasks-write.ts)

### Changed
- Authorization scopes extended: Contacts.ReadWrite, Tasks.ReadWrite

---

## [0.14.0] -- 2026-02-13

### Added
- **list_teams** Tool -- List Teams user is member of
- **list_channels** Tool -- List channels in a Teams team
- **list_channel_messages** Tool -- List messages in a Teams channel with pagination
- **send_channel_message** Tool -- Send message to Teams channel (destructive, requires confirm)
- **reply_to_channel_message** Tool -- Reply to message in Teams channel (destructive, requires confirm)
- **list_chats** Tool -- List Teams chats with pagination
- **list_chat_messages** Tool -- List messages in a Teams chat
- **send_chat_message** Tool -- Send message to Teams chat (destructive, requires confirm)
- **search_sites** Tool -- Search SharePoint sites by keyword
- **get_site** Tool -- Get SharePoint site details
- **list_site_drives** Tool -- List drives in a SharePoint site
- **list_site_lists** Tool -- List SharePoint lists in a site
- **list_list_items** Tool -- List items in a SharePoint list
- **create_list_item** Tool -- Create new list item (destructive, requires confirm)
- **update_list_item** Tool -- Update existing list item (destructive, requires confirm)
- **delete_list_item** Tool -- Delete list item (destructive, requires confirm)
- 688 tests (45 tools total)

---

## [0.13.0] -- 2026-02-13

### Added
- **list_site_lists** Tool -- List SharePoint lists in a site
- **list_list_items** Tool -- List items in a SharePoint list
- **create_list_item** Tool -- Create new list item (destructive, requires confirm)
- **update_list_item** Tool -- Update existing list item (destructive, requires confirm)
- **delete_list_item** Tool -- Delete list item (destructive, requires confirm)
- **resolveDrivePath** utility extension for SharePoint drives
- Sprint 5.3 documentation (docs/sprints/SPRINT_5_3.md)
- 49 new tests (685 total)

### Changed
- SharePoint drive resolution now supports multi-segment paths
- Drive utilities extended to handle both OneDrive and SharePoint drives

---

## [0.12.0] -- 2026-02-13

### Added
- **list_chats** Tool -- List Teams chats with pagination
- **list_chat_messages** Tool -- List messages in a Teams chat
- **send_chat_message** Tool -- Send message to Teams chat (destructive, requires confirm)
- **search_sites** Tool -- Search SharePoint sites by keyword
- **get_site** Tool -- Get SharePoint site details
- **list_site_drives** Tool -- List drives in a SharePoint site
- Sprint 5.2 documentation (docs/sprints/SPRINT_5_2.md)
- 6 new tools (35 total)

---

## [0.11.0] -- 2026-02-13

### Added
- **list_teams** Tool -- List Teams user is member of
- **list_channels** Tool -- List channels in a Teams team
- **list_channel_messages** Tool -- List messages in a Teams channel with pagination
- **send_channel_message** Tool -- Send message to Teams channel (destructive, requires confirm)
- **reply_to_channel_message** Tool -- Reply to message in Teams channel (destructive, requires confirm)
- Sprint 5.1 documentation (docs/sprints/SPRINT_5_1.md)
- Teams-specific error handling and response formatting

---

## [0.10.0] -- 2026-02-12

### Added
- **upload_file** Tool -- Upload file to OneDrive (destructive, requires confirm + idempotency_key)
- **create_folder** Tool -- Create new folder (destructive, requires confirm + idempotency_key)
- **move_file** Tool -- Move file to different location (destructive, dry_run support)
- **copy_file** Tool -- Copy file (async operation, returns 202)
- **share_file** Tool -- Create sharing link (destructive, requires confirm)
- Sprint 4.3 documentation (docs/sprints/SPRINT_4_3.md)
- 591 tests (29 tools)

### Changed
- OneDrive utilities expanded for write operations
- MSW handlers updated for drive item operations

---

## [0.9.0] -- 2026-02-12

### Added
- **list_files** Tool -- List files and folders in OneDrive
- **search_files** Tool -- Search files by name and properties
- **get_file_metadata** Tool -- Get detailed file metadata
- **download_file** Tool -- Download file with size validation (>10MB rejected)
- **get_recent_files** Tool -- Get user's recently accessed files
- Sprint 4.2 documentation (docs/sprints/SPRINT_4_2.md)
- 556 tests (24 tools)
- MSW RegExp handlers for OneDrive drive item routes

### Changed
- File size utilities (formatFileSize, isTextContent) shared across mail and OneDrive

---

## [0.8.0] -- 2026-02-12

### Added
- Sprint 4.1 technical debt cleanup documentation

### Changed
- Timezone localization for all calendar tools (getUserTimezone, Prefer header)
- proposedNewTime support added to respond_to_event
- Attendees mapping refactored to shared toAttendees utility (DRY principle)
- All German strings translated to English
- 521 tests

---

## [0.7.0] -- 2026-02-12

### Added
- **create_event** Tool -- Create calendar event (destructive, requires confirm + idempotency_key)
- **update_event** Tool -- Update event details (destructive, requires confirm + idempotency_key)
- **delete_event** Tool -- Delete calendar event (destructive, requires confirm)
- **respond_to_event** Tool -- Accept/decline/tentatively accept invitations (destructive, requires confirm)
- **check_availability** Tool -- Check free/busy availability for users (safe read operation)
- Sprint 3.2 documentation (docs/sprints/SPRINT_3_2.md)
- 516 tests (19 tools)

### Changed
- Calendar event update validates UPDATABLE_FIELDS
- Event delete returns 204 No Content

---

## [0.6.0] -- 2026-02-12

### Added
- **list_calendars** Tool -- List user's calendars with permissions
- **list_events** Tool -- List calendar events with filtering and pagination
- **get_event** Tool -- Get full event details including attendees
- **get_calendar_view** Tool -- Get expanded calendar view for time range
- Sprint 3.1 documentation (docs/sprints/SPRINT_3_1.md)
- 473 tests (15 tools)
- html-to-text conversion for event bodies
- DEFAULT_SELECT for calendar and event details

### Changed
- encodeGraphId() refactored as shared utility, applied to all tools (mail + calendar)
- MSW handlers extended with path disambiguation for overlapping routes

---

## [0.5.0] -- 2026-02-11

### Added
- **move_email** Tool -- Move email to different folder (destructive, dry_run support)
- **list_attachments** Tool -- List email attachments with type detection
- **download_attachment** Tool -- Download attachment with size validation (>10MB rejected)
- Sprint 2.3 documentation (docs/sprints/SPRINT_2_3.md)
- 420 tests

### Changed
- File size formatting shared utility (formatFileSize, isTextContent)
- Only fileAttachment type supported; itemAttachment and referenceAttachment rejected

---

## [0.4.0] -- 2026-02-11

### Added
- **send_email** Tool -- Send new email (destructive, requires confirm + idempotency_key)
- **reply_email** Tool -- Reply to email (destructive, requires confirm + idempotency_key)
- **forward_email** Tool -- Forward email (destructive, requires confirm + idempotency_key)
- Sprint 2.2 documentation (docs/sprints/SPRINT_2_2.md)
- 314 tests
- Confirmation preview pattern (confirm=false returns preview)
- Idempotency cache for duplicate detection

### Changed
- Recipients utility refactored to shared toRecipients() helper
- Cognitive complexity optimization: preview/execute helpers extracted

---

## [0.3.0] -- 2026-02-11

### Added
- **read_email** Tool -- Read email with HTML-to-text conversion
- **list_mail_folders** Tool -- List mail folders with counts and subfolders
- **search_emails** Tool -- Full-text search via KQL (Keyword Query Language)
- Sprint documentation (docs/sprints/SPRINT_2_1.md)
- html-to-text dependency for email body conversion
- 50 new tests (219 total)

### Changed
- Review technical debt cleanup from Phase 1 (JSDoc, error tests, DI factory)
- DEFAULT_SELECT extended with mailDetail and mailFolder

---

## [0.2.0] -- 2026-02-11

### Added
- GraphClientDeps DI interface (instead of direct MsalClient dependency)
- clearClientCache() for test isolation
- isRecordObject type guard (src/utils/type-guards.ts)
- LimitsConfig type export
- 82 additional tests (164 total)

### Changed
- parseRetryAfterMs returns `number | undefined`
- ShapeOptions: maxItems and maxBodyLength now mandatory
- isGraphErrorBody rejects non-object error fields
- Retry middleware: fixed double header reading

---

## [0.1.0] -- 2026-02-10

### Added
- **list_emails** Tool -- List emails with filtering, search, pagination
- MSAL Device Code Flow (3-step: silent, cache, device code)
- Error hierarchy: 8 typed error classes with messages
- Middleware chain: Logging, Retry, ErrorMapping, Auth, HTTP
- Cross-cutting utilities: response-shaper, confirmation, idempotency, rate-limit, pagination
- Graph client with middleware and caching
- @vitest/coverage-v8 with coverage thresholds (60/50/60/60)
- husky + lint-staged pre-commit hooks
- 82 tests (3 test files)

---

## [0.0.1] -- 2026-02-09

### Added
- Phase 0: Project scaffold with infrastructure patterns
- TypeScript strict mode, Biome, Vitest + MSW setup
- MCP SDK integration with stdio transport
- Zod-based schemas (BaseParams, WriteParams, ListParams)
- Pino logger with PII redaction
- Docs: ARCHITECTURE.md, SETUP.md (stub), DATA-PRIVACY.md (stub)
- CI/CD: lint, typecheck, test scripts
