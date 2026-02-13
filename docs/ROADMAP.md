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

---

## Upcoming Phases

---

### Phase 7 — User Directory + Mail Extensions
New scopes needed for User/Directory. Mail extensions use existing scopes.

#### Sprint 7.1 — User & Directory (~7 tools)
Scope: `User.Read.All`, `Directory.Read.All` (NEW — requires Azure Portal)

| Tool | Type | Graph API |
|---|---|---|
| `get_my_profile` | safe | GET /me |
| `search_users` | safe | GET /users?$search |
| `get_user` | safe | GET /users/{id} |
| `get_manager` | safe | GET /me/manager |
| `list_direct_reports` | safe | GET /me/directReports |
| `list_user_groups` | safe | GET /me/memberOf |
| `get_user_photo` | safe | GET /users/{id}/photo/$value |

#### Sprint 7.2 — Mail Extensions (~7 tools)
Scope: `Mail.ReadWrite` (already granted)

| Tool | Type | Graph API |
|---|---|---|
| `delete_email` | destructive | DELETE /me/messages/{id} |
| `create_draft` | destructive | POST /me/messages |
| `send_draft` | destructive | POST /me/messages/{id}/send |
| `add_attachment` | destructive | POST .../messages/{id}/attachments |
| `create_mail_folder` | destructive | POST /me/mailFolders |
| `flag_email` | destructive | PATCH /me/messages/{id} (flag) |
| `list_mail_rules` | safe | GET /me/mailFolders/inbox/messageRules |

---

### Phase 8 — Teams Extensions + OneNote
New scopes needed for both modules.

#### Sprint 8.1 — Teams Extensions (~6 tools)
Scope: `Channel.Create`, `ChannelMember.ReadWrite.All`, `TeamMember.Read.All`, `OnlineMeetings.ReadWrite` (NEW)

| Tool | Type | Graph API |
|---|---|---|
| `create_channel` | destructive | POST /teams/{id}/channels |
| `add_channel_member` | destructive | POST .../channels/{id}/members |
| `remove_channel_member` | destructive | DELETE .../channels/{id}/members/{id} |
| `list_team_members` | safe | GET /teams/{id}/members |
| `create_chat` | destructive | POST /chats |
| `create_online_meeting` | destructive | POST /me/onlineMeetings |

#### Sprint 8.2 — OneNote (~6 tools)
Scope: `Notes.ReadWrite` (NEW)

| Tool | Type | Graph API |
|---|---|---|
| `list_notebooks` | safe | GET /me/onenote/notebooks |
| `list_sections` | safe | GET .../notebooks/{id}/sections |
| `list_pages` | safe | GET .../sections/{id}/pages |
| `get_page_content` | safe | GET .../pages/{id}/content |
| `create_page` | destructive | POST .../sections/{id}/pages |
| `search_notes` | safe | GET /me/onenote/pages?$search |

---

### Phase 9 — Presence + Polish & Advanced (originally Phase 7)
Scope: `Presence.Read.All` (NEW)

#### Sprint 9.1 — Presence (~3 tools)

| Tool | Type | Graph API |
|---|---|---|
| `get_presence` | safe | GET /users/{id}/presence |
| `get_my_presence` | safe | GET /me/presence |
| `set_status_message` | destructive | POST /me/presence/setStatusMessage |

#### Sprint 9.2 — Polish & Advanced
- Review all sprint documents for "Known Limitations & Future Work" and "Post-Sprint Notes" sections to identify open items and validate their relevance for Sprint 9. Joint decision on which features to implement.
- Batch API support ($batch) for multi-call operations
- itemAttachment support (embedded Outlook items)
- referenceAttachment support (OneDrive/SharePoint links)
- Large file upload (resumable upload session >4MB)
- Webhook subscriptions (change notifications)
- Performance: response caching, request deduplication
- Technical debt cleanup (see TECHNICAL_DEBT.md)

---

## Summary

| Phase | Module | New Tools | New Scopes Required |
|---|---|---|---|
| 6 | Contacts + To Do | ~14 | None (already granted) |
| 7 | User/Directory + Mail Extensions | ~14 | User.Read.All, Directory.Read.All |
| 8 | Teams Extensions + OneNote | ~12 | Channel.Create, ChannelMember.RW, TeamMember.Read, OnlineMeetings.RW, Notes.RW |
| 9 | Presence + Polish | ~3 + enhancements | Presence.Read.All |
| **Total** | | **~43 new tools** | |

**Projected total after Phase 9: ~88 tools.**
