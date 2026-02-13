# Use Cases — MS-MCP Office 365 Tools

This document describes practical, real-world scenarios showing how Claude can help you with Microsoft 365 using the MCP tools available in this project. All use cases are **available** as of Phase 6.

---

## Mail Use Cases

### UC-01: Inbox Triage (Available)

**Scenario:** A manager arrives at the office and wants a quick overview of important emails from the past 24 hours, categorized by urgency.

**Example Prompt:**
> Summarize my unread emails from the last 24 hours. Categorize them as: urgent, informational, or delegable.

**Tools Used:**
1. `list_emails` — Filter `isRead eq false`, sorted by received date
2. `read_email` — Fetch full content for relevant messages
3. Claude analyzes and categorizes

**Sample Output:**
```
## Inbox Triage — 2026-02-13

### Urgent (2)
1. **Project PHOENIX Sign-off Required** — From: Dr. Schmidt
   Sign-off deadline: today 5 PM. Budget overview attached.
   → Action: Grant approval or clarify questions

2. **Production Database Server Down** — From: IT Monitoring
   Server prod-sql-03 unreachable since 8:15 AM.
   → Action: Check status, escalate if needed

### Informational (3)
1. **January Monthly Report** — From: Finance
   Revenue +12% vs. last year. Details in attachment.

2. **Updated Data Protection Policy** — From: Compliance
   New policy effective March 1st. No immediate action needed.

3. **Team Summer Event Planning** — From: HR
   Survey deadline: Friday. Please respond.

### Delegable (1)
1. **Office Supplies Quote** — From: Office Manager
   New quote from vendor received. Compare with existing contract.
   → Delegate to: Office Management
```

**Time Saved:** 15–30 minutes per day

---

### UC-02: Email Search and Consolidation (Available)

**Scenario:** A consultant needs to find all emails related to a specific project over the past two weeks and extract key points.

**Example Prompt:**
> Find all emails about "PHOENIX Proposal" from the last 2 weeks and summarize the key points chronologically.

**Tools Used:**
1. `search_emails` — KQL: `subject:PHOENIX AND body:Proposal`
2. `read_email` — Fetch full content of top results
3. Claude creates a chronological summary

**Common Variations:**
- `"Find all emails from schmidt@company.de with attachments"` → `from:schmidt@company.de hasattachment:true`
- `"Show me emails sent to the engineering team in the last week"` → `to:engineering@company.de` + date filter
- `"Find emails with PDF attachments about contracts"` → `hasattachment:true body:contract`

---

### UC-03: Folder Structure Overview (Available)

**Scenario:** A new employee wants to understand the mailbox folder structure, or a manager needs an overview of unread messages across all folders.

**Example Prompt:**
> Show me all my mail folders with counts of total and unread messages.

**Tools Used:**
1. `list_mail_folders` — With `include_children=true` for hierarchy

**Sample Output:**
```
| Folder              | Total | Unread |
|---------------------|-------|--------|
| Inbox               | 1,247 |     12 |
| Sent Items          |   834 |      0 |
| Drafts              |     3 |      0 |
| Deleted Items       |   156 |      0 |
| Junk Email          |    28 |     28 |
| Archive             | 5,412 |      0 |
|  → Projects         | 2,103 |      0 |
|  → Clients          | 1,847 |      0 |
```

---

### UC-04: Quick Reply and Forward (Available)

**Scenario:** A team lead receives an important email and wants to send a quick reply or forward it to a colleague for input.

**Example Prompt:**
> Reply to the latest email from John: "Thanks, let's discuss in our next sync."

**Tools Used:**
1. `list_emails` — Find most recent from specific sender
2. `read_email` — Get full message context
3. `reply_email` — Send reply

**Advanced Variations:**
- `"Forward the email about the Q1 budget to the finance team"` → `search_emails` + `forward_email`
- `"Send a bulk email to marketing@company.de, sales@company.de, finance@company.de with an update"` → `send_email` with multiple recipients

---

### UC-05: Attachment Management (Available)

**Scenario:** An employee receives an email with attachments and needs to download specific files or check what's attached.

**Example Prompt:**
> What attachments are in the email from Dr. Mueller? Download all PDFs to review them.

**Tools Used:**
1. `list_emails` — Find email from sender
2. `read_email` — Confirm message context
3. `list_attachments` — See attachment metadata and file sizes
4. `download_attachment` — Retrieve specific files

**Safety Guardrails:**
- Files >4 MB show a warning
- Files >10 MB are rejected (too large for MCP context)
- Only file attachments supported; embedded items require manual Outlook action

---

## Calendar Use Cases

### UC-06: Meeting Preparation (Available)

**Scenario:** Before a busy day or important meeting, an executive wants to see all upcoming events with full details and attendee information.

**Example Prompt:**
> What do I have scheduled tomorrow? Show me the full details of each meeting including attendees and room locations.

**Tools Used:**
1. `get_calendar_view` — Retrieve all events in a time range (expands recurring meetings)
2. `get_event` — Fetch complete details including attendees, description, and online meeting links
3. Claude presents a formatted agenda

**Sample Output:**
```
## Calendar — February 14, 2026

### 09:00 – 10:00 | Project PHOENIX Kickoff
Location: Conference Room B / Teams Meeting
Organizer: Dr. Schmidt
Attendees: John (required), Alice (accepted), Bob (tentative)
Description: Initial alignment on scope, timeline, and budget.

### 10:30 – 11:15 | 1:1 with Team Lead
Location: Office 304
Organizer: Jane
Description: Quarterly feedback and career development discussion.

### 13:00 – 14:00 | Client Presentation (ACME Corp)
Location: Virtual Teams Meeting
Link: https://teams.microsoft.com/...
Organizer: Sarah
Notes: Q1 service review and proposal for expanded services.
```

---

### UC-07: Schedule Coordination and Meeting Creation (Available)

**Scenario:** A manager needs to find a time slot that works for all team members and wants to create a meeting without manual back-and-forth.

**Example Prompt:**
> Find a 60-minute slot next week when john@company.de, alice@company.de, and I are all available, then create a meeting.

**Tools Used:**
1. `check_availability` — Query free/busy status for multiple attendees over a date range
2. `create_event` — Schedule the meeting with all attendees once a slot is found
3. Claude analyzes availability and proposes/creates the event

**Advanced Scenario:**
- `"Schedule a 30-minute sync with the product team for this week. Avoid conflicts with existing meetings."` → `check_availability` + `create_event`

---

### UC-08: Event Management and Responses (Available)

**Scenario:** An attendee receives multiple meeting invitations and wants to accept, decline, or propose a new time for meetings.

**Example Prompt:**
> I can't make the Project PHOENIX meeting at 2 PM tomorrow. Respond declining and suggest 3 PM instead.

**Tools Used:**
1. `list_events` — Find the specific meeting
2. `respond_to_event` — Send decline or tentative acceptance with optional proposed time
3. Optional: `update_event` — Reschedule if organizer needs to move the entire meeting

**Common Actions:**
- `"Accept the meeting invitation from john@company.de"` → `respond_to_event` (accept)
- `"I need to cancel the team standup tomorrow"` → `delete_event` (if organizer)
- `"Update the budget review meeting to start 30 minutes earlier"` → `update_event` (if organizer)

---

## OneDrive Use Cases

### UC-09: Document Search and Download (Available)

**Scenario:** A consultant needs to locate specific files across OneDrive to reference in a meeting or analysis.

**Example Prompt:**
> Search for all PDF files related to "PHOENIX" from the last month. Show file sizes and dates.

**Tools Used:**
1. `search_files` — Find files by name, content, or metadata
2. `get_file_metadata` — Fetch details (size, modified date, type)
3. `download_file` — Retrieve file content for local analysis

**Advanced Variations:**
- `"Find the latest version of the Q1 budget spreadsheet"` → `search_files` (recent, Excel type)
- `"Show me all Word documents modified in the last 7 days"` → `search_files` with date filter
- `"List all files in the /Projects/PHOENIX/Reports folder"` → `list_files` with folder path

---

### UC-10: File and Folder Management (Available)

**Scenario:** A project manager needs to organize files, upload new deliverables, and share documents with team members.

**Example Prompt:**
> Upload the Q1 budget document to OneDrive, create a "Budget" subfolder in the PHOENIX project, and share it with the finance team.

**Tools Used:**
1. `upload_file` — Add new file to OneDrive
2. `create_folder` — Organize files into directories
3. `move_file` — Reorganize existing files
4. `copy_file` — Duplicate files (note: async, returns 202)
5. `share_file` — Grant access to users or groups with permission levels

**Common Workflows:**
- `"Move all January invoices to the Archive folder"` → `list_files` + `move_file` (bulk operation)
- `"Copy the project template to a new project folder"` → `create_folder` + `copy_file`
- `"Share the final report with read-only access to the client"` → `share_file` (view role)

---

## Teams Use Cases

### UC-11: Channel Messaging (Available)

**Scenario:** A team lead wants to check recent channel activity, search for past discussions, and post team announcements.

**Example Prompt:**
> Show me the last 10 messages in the #general channel. Did anyone mention the PHOENIX project?

**Tools Used:**
1. `list_teams` — Find the specific team
2. `list_channels` — Find the target channel
3. `list_channel_messages` — Retrieve message history (paginated)
4. `send_channel_message` — Post announcement or update

**Advanced Scenarios:**
- `"Search for all mentions of 'budget' in the Engineering channel from the last week"` → `list_channel_messages` (paginate) + Claude search
- `"Post an urgent update to all team channels: Production is temporarily down"` → `send_channel_message` (multiple channels)

---

### UC-12: Chat and Direct Messaging (Available)

**Scenario:** An employee wants to follow up on a direct conversation or send a quick message to a colleague without context switching.

**Example Prompt:**
> What did John and I discuss in our last chat? Send him a message: "Can we sync on the proposal tomorrow?"

**Tools Used:**
1. `list_chats` — Find chat conversations
2. `list_chat_messages` — Retrieve conversation history
3. `send_chat_message` — Send direct message

**Use Cases:**
- `"Send a message to the project team chat: 'Meeting moved to 3 PM'"` → `send_chat_message`
- `"Get the latest updates from my 1:1 with my manager"` → `list_chats` + `list_chat_messages`

---

## SharePoint Use Cases

### UC-13: Site Discovery and Navigation (Available)

**Scenario:** A new team member wants to find and explore relevant SharePoint sites and libraries.

**Example Prompt:**
> Find all SharePoint sites related to "PHOENIX". Show me what document libraries they contain.

**Tools Used:**
1. `search_sites` — Locate sites by name or keyword
2. `get_site` — Fetch site details
3. `list_site_drives` — List associated document libraries (drives)

**Sample Workflow:**
- `"Show me the structure of the Finance team site"` → `search_sites` + `list_site_drives`
- `"What sites do I have access to?"` → `list_sites` (list all accessible sites)

---

### UC-14: List Management and Data Entry (Available)

**Scenario:** A coordinator manages a project tracking list or inventory list in SharePoint and needs to view, add, or update items.

**Example Prompt:**
> Show me all open tasks in the Project Tracker list. Add a new task: "Complete budget review by Friday."

**Tools Used:**
1. `list_site_lists` — Find available lists in a SharePoint site
2. `list_list_items` — Retrieve list items with filtering/pagination
3. `create_list_item` — Add new item with field values
4. `update_list_item` — Modify existing items
5. `delete_list_item` — Remove items (when needed)

**Advanced Scenarios:**
- `"Filter the status report list to show only items due this week"` → `list_list_items` + filtering
- `"Bulk update all 'In Progress' tasks to 'Completed' for the milestone"` → Multiple `update_list_item` calls
- `"Create a new issue in the bug tracker: 'Login page timeout error'"` → `create_list_item`

---

### UC-15: SharePoint Document Library Management (Available)

**Scenario:** A team needs to search, upload, and organize documents within SharePoint libraries alongside Outlook and OneDrive workflows.

**Example Prompt:**
> Search for all design documents in the PHOENIX site library from Q4. Download the latest version.

**Tools Used:**
1. `search_files` — Find files in SharePoint drives (site_id/drive_id parameters)
2. `list_files` — Browse a specific library folder
3. `get_file_metadata` — Check file details and version history
4. `download_file` — Retrieve document content
5. `upload_file` — Add new documents to the library

**Integration Pattern:**
- Complete workflow: Email reminder → Search SharePoint → Download latest docs → Read in email body → Share findings → Reply to sender

---

## Cross-Service Integration Examples

### Example A: Meeting Preparation Workflow

> "Prepare for my meeting with ACME Corp tomorrow. Show me the meeting details, find related emails, and download the latest proposal from OneDrive."

**Tools in Sequence:**
1. `get_calendar_view` → Find tomorrow's meetings
2. `get_event` → Get ACME meeting full details and attendees
3. `search_emails` → Search for emails mentioning "ACME"
4. `read_email` → Get full email contexts
5. `search_files` → Find proposal document in OneDrive
6. `download_file` → Retrieve proposal
7. Claude consolidates into a briefing document

---

### Example B: Project Status and Communication

> "Create a status report on project PHOENIX. Include calendar milestones, recent emails, OneDrive files, and post a summary to the #phoenix-team channel."

**Tools in Sequence:**
1. `get_calendar_view` → Find PHOENIX-related events this month
2. `search_emails` → Get recent PHOENIX discussions
3. `search_files` → List project documents and updates
4. Claude composes status report
5. `send_channel_message` → Post to Teams channel

---

### Example C: Delegation Workflow

> "Forward the budget emails to the finance team, share the spreadsheet with them, and create a task in the Approvals list by end of day."

**Tools in Sequence:**
1. `search_emails` → Find budget-related emails
2. `forward_email` → Send to finance team
3. `share_file` → Grant OneDrive access to spreadsheet
4. `list_site_lists` → Find Approvals list in SharePoint
5. `create_list_item` → Create approval task with deadline

---

## Key Patterns and Best Practices

### Safety Features
- **Destructive confirmation:** Write operations (`send_email`, `create_event`, `upload_file`, etc.) require `confirm=true`
- **Idempotency keys:** Preventing duplicate sends, posts, or uploads via `idempotency_key` parameter
- **Pagination:** Large result sets support `top` and `skip` for safe iteration
- **Rate limiting:** Batch operations should respect Microsoft Graph API rate limits

### Observability
- All tools log operation metadata (status, latency) without exposing sensitive content
- Email bodies, calendar descriptions, and file contents are not logged
- Error handling provides clear feedback for troubleshooting

### Multi-Tenant Support
- All tools accept optional `user_id` parameter for delegated access scenarios
- Useful for admins managing multiple user mailboxes, calendars, or drives

---

## User & Directory Use Cases

### UC-18: Find Colleague Contact Info (Available)

**Scenario:** A new employee needs to find contact information for colleagues or team members.

**Example Prompt:**
> Find the contact information for Alice Schmidt. What's her email, phone number, and reporting manager?

**Tools Used:**
1. `search_users` — Find user by name
2. `get_user` — Get full user profile including email and phone
3. `get_manager` — Find the user's manager
4. Claude presents contact details and organizational relationship

**Common Scenarios:**
- `"What's the phone number for john@company.de?"` → `get_user`
- `"Who's Alice's manager?"` → `get_manager`
- `"Find all users in the Finance department"` → `search_users` with department filter

---

### UC-19: Organizational Chart and Reporting Structure (Available)

**Scenario:** A manager wants to understand their team structure and who reports to them.

**Example Prompt:**
> Show me my direct reports and their managers. Create an organizational chart.

**Tools Used:**
1. `get_my_profile` — Get current user's identity
2. `list_direct_reports` — List all direct reports
3. `get_user` — Get details for each report
4. `get_manager` — Get manager for context
5. Claude formats as org chart or hierarchy

**Advanced Scenarios:**
- `"Who are all the people in my reporting chain?"` → `get_manager` (recursive)
- `"Show me my director and their other direct reports"` → `get_manager` + `list_direct_reports`

---

### UC-20: User Profile and Group Membership (Available)

**Scenario:** An administrator or team lead needs to check a user's group memberships or view their profile photo.

**Example Prompt:**
> Show me all the groups that Alice Schmidt belongs to. Include her profile photo.

**Tools Used:**
1. `search_users` — Find user by name
2. `list_user_groups` — Get user's group memberships
3. `get_user_photo` — Download user's profile picture
4. Claude displays groups and provides photo URL

**Common Scenarios:**
- `"What groups am I a member of?"` → `list_user_groups` (for self)
- `"Who is in the Engineering group?"` — Not directly supported (would need list_group_members)
- `"Get my profile photo for a presentation"` → `get_user_photo`

---

## Contacts Use Cases

### UC-16: Contact Management (Available)

**Scenario:** An employee needs to maintain and organize their contact list, search for specific contacts, and add new contacts from meetings or emails.

**Example Prompt:**
> Show me all contacts in my "Business Partners" folder. Find the contact for Alice Schmidt.

**Tools Used:**
1. `list_contact_folders` — List contact folders
2. `list_contacts` — Retrieve contacts in a folder with filtering
3. `get_contact` — Get full contact details
4. `search_contacts` — Search for contacts by name or email
5. `create_contact` — Add new contact
6. `update_contact` — Update existing contact information
7. `delete_contact` — Remove contacts (destructive, requires confirm)

**Common Scenarios:**
- `"Create a new contact for john@company.de with phone number +49 123 456789"` → `create_contact`
- `"Find all contacts with 'Schmidt' in their name"` → `search_contacts`
- `"Update Alice's phone number to +49 987 654321"` → `update_contact` (requires confirm)

---

## To Do Use Cases

### UC-17: Task and List Management (Available)

**Scenario:** An employee manages their tasks and projects in Microsoft To Do, creating lists for different areas and organizing tasks with priorities.

**Example Prompt:**
> Show me all my to-do lists. Add a new task "Complete budget review" to the "Finance" list with high priority.

**Tools Used:**
1. `list_todo_lists` — List all To Do lists
2. `get_todo_list` — Get list details
3. `list_tasks` — List tasks in a list with filtering
4. `get_task` — Get full task details
5. `create_task` — Create new task (destructive, requires confirm + idempotency_key)
6. `update_task` — Update task status, priority, due date (destructive, requires confirm)
7. `delete_task` — Remove task (destructive, requires confirm)

**Common Scenarios:**
- `"Create a new task list called 'Q1 Projects'"` → `create_list` (via list management)
- `"Mark the 'Project PHOENIX' task as complete"` → `update_task` (set status to completed)
- `"What tasks are due this week?"` → `list_tasks` with due date filter
- `"Move all completed tasks to the archive"` → Multiple `update_task` or `delete_task` calls

---

## Current Tool Inventory (66 Tools)

**Mail (10 tools):** list_emails, search_emails, read_email, list_mail_folders, send_email, reply_email, forward_email, move_email, list_attachments, download_attachment

**Calendar (9 tools):** list_calendars, list_events, get_event, get_calendar_view, create_event, update_event, delete_event, respond_to_event, check_availability

**OneDrive (10 tools):** list_files, search_files, get_file_metadata, download_file, get_recent_files, upload_file, create_folder, move_file, copy_file, share_file

**Teams (8 tools):** list_teams, list_channels, list_channel_messages, send_channel_message, reply_to_channel_message, list_chats, list_chat_messages, send_chat_message

**SharePoint (8 tools):** search_sites, get_site, list_site_drives, list_site_lists, list_list_items, create_list_item, update_list_item, delete_list_item

**Contacts (7 tools):** list_contacts, get_contact, search_contacts, create_contact, update_contact, delete_contact, list_contact_folders

**To Do (7 tools):** list_todo_lists, get_todo_list, list_tasks, get_task, create_task, update_task, delete_task

**User & Directory (7 tools):** get_my_profile, search_users, get_user, get_manager, list_direct_reports, list_user_groups, get_user_photo

---

## Questions or Feedback?

For implementation details, see `/docs/TECHNICAL_DEBT.md` and sprint documentation in `/docs/sprints/`.
