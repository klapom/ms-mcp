# Roadmap

## Completed Phases

### Phase 0 — Project Scaffold
Infrastructure: MCP SDK, Graph Client, MSAL auth, Zod schemas, Vitest + MSW, Biome, pino logging.

### Phase 1 — Mail (Read)
10 tools: list_emails, search_emails, read_email, list_mail_folders, send_email, reply_email, forward_email, move_email, list_attachments, download_attachment.

### Phase 2 — Mail (Write) + Auth CLI
Destructive safety pattern (confirm/idempotency), auth CLI (login/status/logout), fail-fast, persistent token cache.

### Phase 3 — Calendar
9 tools: list_calendars, list_events, get_event, get_calendar_view, create_event, update_event, delete_event, respond_to_event, check_availability.

### Phase 4 — OneDrive + TD Cleanup
10 tools: list_files, search_files, get_file_metadata, download_file, get_recent_files, upload_file, create_folder, move_file, copy_file, share_file. TD: timezone localization, proposedNewTime, DRY attendees, English strings.

### Phase 5 — Teams + SharePoint
16 new tools + 7 modified drive tools. Teams: list_teams, list_channels, list_channel_messages, send_channel_message, reply_to_channel_message, list_chats, list_chat_messages, send_chat_message. SharePoint: search_sites, get_site, list_site_drives, list_site_lists, list_list_items, create_list_item, update_list_item, delete_list_item.

**Status after Phase 5: 45 tools, 688 tests.**

### Phase 6 — Contacts + To Do
14 tools: 7 Contacts (list_contacts, get_contact, search_contacts, create_contact, update_contact, delete_contact, list_contact_folders) + 7 To Do (list_todo_lists, get_todo_list, list_tasks, get_task, create_task, update_task, delete_task).

**Status after Phase 6: 59 tools, 752 tests.**

### Phase 7 — User Directory + Mail Extensions
14 tools: 7 User/Directory (get_my_profile, search_users, get_user, get_manager, list_direct_reports, list_user_groups, get_user_photo) + 7 Mail Extensions (delete_email, create_draft, send_draft, add_attachment, create_mail_folder, flag_email, list_mail_rules). Scopes: User.Read.All, Directory.Read.All.

**Status after Phase 7: 73 tools, 841 tests.**

### Phase 8 — Advanced Features & Extensions
22 tools across 4 sprints. Sprint 8.1: Advanced search with KQL, delta queries (6 tools). Sprint 8.2: Batch operations via $batch API (5 tools). Sprint 8.3: Recurring events, meeting rooms, calendar sharing (6 tools). Sprint 8.4: Activity feed, mentions, meeting transcripts (5 tools). Scopes: Calendars.ReadWrite.Shared, TeamsActivity.Read, OnlineMeetings.Read, Place.Read.All.

**Status after Phase 8: 95 tools, 1,127 tests.**

---

## Upcoming Phases

---

### Phase 9 — File Attachments, OneNote, Performance & Presence

#### Sprint 9.1 — File Attachments & Large Upload (~4 tools)
Scopes: None (uses existing Mail.ReadWrite, Files.ReadWrite)

**Goals:** Resolve 4MB upload limitation, complete attachment support.

| Tool | Type | Graph API | Notes |
|---|---|---|---|
| `upload_large_file` | destructive | POST /me/drive/items/{id}/createUploadSession | Resumable upload >4MB |
| `attach_item` | destructive | POST /me/messages/{id}/attachments | itemAttachment (embedded emails/events) |
| `attach_reference` | destructive | POST /me/messages/{id}/attachments | referenceAttachment (OneDrive links) |
| `poll_copy_status` | safe | GET /me/drive/items/{id}/copy (monitor URL) | Check async copy completion |

#### Sprint 9.2 — OneNote (~6 tools)
Scope: `Notes.ReadWrite` (NEW — requires Azure Portal)

**Goals:** Complete Microsoft 365 content coverage.

| Tool | Type | Graph API |
|---|---|---|
| `list_notebooks` | safe | GET /me/onenote/notebooks |
| `list_sections` | safe | GET /onenote/notebooks/{id}/sections |
| `list_pages` | safe | GET /onenote/sections/{id}/pages |
| `get_page_content` | safe | GET /onenote/pages/{id}/content |
| `create_page` | destructive | POST /onenote/sections/{id}/pages |
| `search_notes` | safe | GET /me/onenote/pages?$search |

#### Sprint 9.3 — Performance & Real-time (~2 features + infra)
Scopes: None (infrastructure only)

**Goals:** Optimize performance, enable real-time updates.

| Feature | Type | Implementation |
|---|---|---|
| Response Caching | infrastructure | In-memory LRU cache for GET requests |
| Webhooks/Subscriptions | infrastructure | POST /subscriptions, webhook endpoint |

**Tools affected by caching:**
- `get_my_profile`, `list_calendars`, `get_user`, `list_todo_lists` (low-change data)

**Webhook support for:**
- Mail (`created`, `updated`, `deleted`)
- Calendar (`created`, `updated`, `deleted`)
- OneDrive (`created`, `updated`, `deleted`)

#### Sprint 9.4 — Presence (~3 tools)
Scope: `Presence.Read.All` (NEW — requires Azure Portal)

**Goals:** Real-time presence and status management.

| Tool | Type | Graph API |
|---|---|---|
| `get_my_presence` | safe | GET /me/presence |
| `get_presence` | safe | GET /users/{id}/presence |
| `set_status_message` | destructive | POST /me/presence/setStatusMessage |

---

## Summary

| Phase | Module | Tools | Tests | New Scopes |
|---|---|---|---|---|
| **0-6** | Foundation + Core | **59** | **752** | — |
| **7** | User + Mail Extensions | **+14** | **+89** | User.Read.All, Directory.Read.All |
| **8** | Advanced Features | **+22** | **+286** | Calendars.RW.Shared, TeamsActivity.Read, OnlineMeetings.Read, Place.Read.All |
| **9** | Attachments + OneNote + Performance + Presence | **+13** | **~+120** | Notes.ReadWrite, Presence.Read.All |
| **Total** | | **~108 tools** | **~1,247 tests** | |

**Current Status (after Phase 8): 95 tools, 1,127 tests, 8 completed phases.**

**Projected after Phase 9: ~108 tools, ~1,247 tests, full Microsoft 365 coverage.**
