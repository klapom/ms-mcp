# MS-MCP Installation für Claude Desktop

## Schnellstart

### 1. Paket entpacken
```bash
unzip ms-mcp-v1.0.0.zip -d ~/ms-mcp
cd ~/ms-mcp
```

### 2. Dependencies installieren
```bash
pnpm install --prod
```

Falls pnpm nicht installiert ist:
```bash
npm install -g pnpm
pnpm install --prod
```

### 3. Umgebungsvariablen setzen
Erstelle eine `.env` Datei:
```bash
cp .env.example .env
```

Bearbeite `.env` und trage ein:
```
AZURE_TENANT_ID=4b2ee35f-5f43-44c8-b92b-55e11e6d6f89
AZURE_CLIENT_ID=d42aa1ad-7be6-4f5c-b0ce-08ae34bca63b
LOG_LEVEL=info
```

### 4. Authentifizierung
```bash
pnpm auth login
```

Verwende einen **lizenzierten M365-Account** (z.B. ulla.vogel@pommerconsulting.de).
**NICHT** den Admin-Account verwenden (hat keine Exchange-Lizenz)!

Folge den Anweisungen im Terminal:
1. Öffne die angezeigte URL im Browser
2. Gib den Device Code ein
3. Melde dich mit deinem M365-Account an
4. Kehre zum Terminal zurück

Status prüfen:
```bash
pnpm auth status
```

### 5. Claude Desktop konfigurieren

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

Füge hinzu:
```json
{
  "mcpServers": {
    "ms-mcp": {
      "command": "node",
      "args": [
        "/Users/DEIN_USERNAME/ms-mcp/dist/index.js"
      ],
      "env": {
        "AZURE_TENANT_ID": "4b2ee35f-5f43-44c8-b92b-55e11e6d6f89",
        "AZURE_CLIENT_ID": "d42aa1ad-7be6-4f5c-b0ce-08ae34bca63b"
      }
    }
  }
}
```

**Wichtig:** Passe den Pfad `/Users/DEIN_USERNAME/ms-mcp/dist/index.js` an!

### 6. Claude Desktop neu starten

1. **Schließe Claude Desktop komplett**
2. **Starte Claude Desktop neu**
3. Prüfe unter Settings → Developer → MCP Servers

Du solltest sehen:
- ✅ ms-mcp: Connected
- 108 Tools verfügbar

### 7. Testen

Frage in Claude Desktop:
- "Zeige mir meine letzten 5 E-Mails"
- "Erstelle einen Termin für morgen 14 Uhr: Team Meeting"
- "Liste meine Kalender auf"

---

## Verfügbare Tools (108)

### Mail (17 Tools)
- list_emails, read_email, search_emails
- send_email, reply_email, forward_email
- move_email, delete_email
- list_attachments, download_attachment
- create_draft, send_draft, add_attachment
- list_mail_folders, create_mail_folder
- flag_email, list_mail_rules

### Calendar (20 Tools)
- list_calendars, list_events, get_event, get_calendar_view
- create_event, update_event, delete_event
- respond_to_event, check_availability
- create_recurring_event, update_event_series, list_event_instances
- list_meeting_rooms, find_available_rooms
- share_calendar
- batch_delete_events

### OneDrive (12 Tools)
- list_files, search_files, get_file_metadata, download_file, get_recent_files
- upload_file, upload_large_file, create_folder
- move_file, copy_file, poll_copy_status, share_file
- track_file_changes
- batch_move_files

### Teams (10 Tools)
- list_teams, list_channels, list_channel_messages, send_channel_message, reply_to_channel_message
- list_chats, list_chat_messages, send_chat_message
- list_activity_feed, list_mentions
- create_channel, list_team_members, get_meeting_transcript

### SharePoint (8 Tools)
- search_sites, get_site, list_site_drives
- list_site_lists, list_list_items
- create_list_item, update_list_item, delete_list_item

### Contacts (7 Tools)
- list_contacts, get_contact, search_contacts, list_contact_folders
- create_contact, update_contact, delete_contact

### To Do (7 Tools)
- list_todo_lists, get_todo_list
- list_tasks, get_task
- create_task, update_task, delete_task

### OneNote (6 Tools)
- list_notebooks, list_sections, list_pages
- get_page_content, create_page, search_notes

### Presence (3 Tools)
- get_my_presence, get_presence, set_status_message

### Users & Directory (7 Tools)
- get_my_profile, search_users, get_user
- get_manager, list_direct_reports, list_user_groups
- get_user_photo

### Advanced Search (5 Tools)
- advanced_search_emails, search_events, advanced_search_contacts
- search_teams_messages, search_all

### Batch Operations (6 Tools)
- batch_move_emails, batch_delete_emails, batch_flag_emails
- batch_delete_events, batch_move_files

---

## Troubleshooting

### "Not authenticated" Fehler
```bash
cd ~/ms-mcp
pnpm auth login
# Dann Claude Desktop neu starten
```

### "Connection failed" in Claude Desktop
1. Prüfe, ob der Pfad in claude_desktop_config.json korrekt ist
2. Teste manuell:
   ```bash
   cd ~/ms-mcp
   node dist/index.js
   ```
   Erwartete Ausgabe: JSON-RPC Initialisierung

### "MailboxNotEnabledForRESTAPI" Fehler
Du verwendest den Admin-Account - der hat keine Exchange-Lizenz!
Melde dich ab und nutze einen lizenzierten User-Account:
```bash
pnpm auth logout
pnpm auth login  # Mit lizenziertem Account
```

### Token abgelaufen
Token sind 90 Tage gültig. Bei Ablauf:
```bash
pnpm auth logout
pnpm auth login
```

---

## Deinstallation

```bash
# MCP-Server aus Claude Desktop Config entfernen
# Dann:
rm -rf ~/ms-mcp
rm -rf ~/.ms-mcp  # Token cache
```

---

## Support

- GitHub: https://github.com/klapom/ms-mcp
- Issues: https://github.com/klapom/ms-mcp/issues
- Pommer IT-Consulting GmbH

**Version:** 1.0.0
**Build:** Production Ready (8.1/10 Score)
