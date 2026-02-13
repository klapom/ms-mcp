# Setup Guide

## Prerequisites

- **Node.js 22+** — Check with `node --version`
- **pnpm** — Install with `npm install -g pnpm` if not present
- **Microsoft 365 Account** — Business edition or [Developer Program](https://developer.microsoft.com/en-us/microsoft-365/dev-program) (free, 90 days)
- **Claude Desktop** or **Claude Code**
- **Azure Permissions** — Ability to create an App Registration (Global Admin or Application Administrator role)

## Step 1: Azure App Registration

1. Open [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Name: `pommer-m365-mcp` (or any name you prefer)
3. Supported account types: **Accounts in this organizational directory only** (Single Tenant)
4. Redirect URI: **Leave empty** (Device Code Flow does not require a redirect URI)
5. Click **Register**
6. Note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page

### Configure API Permissions

1. In the app menu: **API permissions** → **Add a permission**
2. Select **Microsoft Graph** → **Delegated permissions**
3. Add the following permissions based on which tools you need. See `docs/PERMISSIONS.md` for a complete reference of which permissions are required for each tool:
   - `User.Read` — Read own profile
   - `User.Read.All` — Read user profiles and directory (Sprint 7.1)
   - `Directory.Read.All` — Read directory structure (Sprint 7.1)
   - `Mail.ReadWrite` — Read and manage emails
   - `Mail.Send` — Send emails
   - `Calendars.ReadWrite` — Read and manage calendar events
   - `Files.ReadWrite` — Read and manage files on OneDrive
   - `Contacts.ReadWrite` — Read and manage contacts
   - `Tasks.ReadWrite` — Read and manage To Do tasks
   - And others depending on your tool needs
4. Click **Grant admin consent for [Tenant]** (green button)
5. Confirm — all permissions should show green checkmarks

### Enable Public Client Flow

1. In the app menu: **Authentication**
2. Scroll to the bottom: **Advanced settings** → **Allow public client flows** → **Yes**
3. Click **Save**

**Why Device Code Flow?** The MCP server runs as a local process without a browser. Device Code Flow enables authentication via a separate browser tab while the server waits in the background.

## Step 2: Clone and Build Repository

```bash
git clone https://github.com/klapom/ms-mcp.git
cd ms-mcp
pnpm install
pnpm build
```

Verify the build succeeded:

```bash
ls dist/index.js
```

## Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Azure App Registration (required)
AZURE_TENANT_ID=your-tenant-id-here
AZURE_CLIENT_ID=your-client-id-here

# Token cache path (optional, default: ~/.ms-mcp/token-cache.json)
TOKEN_CACHE_PATH=~/.ms-mcp/token-cache.json

# Logging level (optional, default: info)
LOG_LEVEL=info
```

The `.env` file is in `.gitignore` and will not be committed.

## Step 4: Authenticate (One-Time)

Authenticate once in the terminal via the CLI. This is necessary because the MCP server runs as a subprocess of Claude Code/Desktop where interactive authentication is not available.

```bash
pnpm auth login
```

The command starts the Device Code Flow:

1. A link and code appear in the terminal
2. Open the link in your browser
3. Enter the code
4. Sign in with your Microsoft 365 account
5. Approve the permissions

After successful authentication, the CLI shows the logged-in user. The token is stored persistently (default: `~/.ms-mcp/token-cache.json`).

### Additional Auth Commands

```bash
pnpm auth status   # Check authentication status (who is logged in?)
pnpm auth logout   # Delete token and log out
```

**Note:** Authentication is one-time. The refresh token is automatically renewed. Re-authentication is only needed on explicit logout or token expiration (90 days of inactivity).

**Fail-Fast:** The MCP server checks on startup for a valid token. If none exists, it exits immediately with a clear error message and instructions to run `auth login`.

**Change Cache Path:** Set the `TOKEN_CACHE_PATH` environment variable to an alternative path (absolute or with `~/` prefix).

## Step 5: Configure Claude Desktop or Claude Code

### Option A: Claude Desktop

Open the Claude Desktop configuration:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the MCP server:

```json
{
  "mcpServers": {
    "m365": {
      "command": "node",
      "args": ["/absolute/path/to/ms-mcp/dist/index.js"],
      "env": {
        "AZURE_TENANT_ID": "your-tenant-id",
        "AZURE_CLIENT_ID": "your-client-id"
      }
    }
  }
}
```

**Important:** Use the **absolute path** to `dist/index.js`. Relative paths do not work reliably.

Restart Claude Desktop. The server should appear in the Tools list (hammer icon in the bottom left).

### Option B: Claude Code

In Claude Code, you can add the server via MCP configuration or start it directly:

```bash
cd /path/to/ms-mcp
AZURE_TENANT_ID=xxx AZURE_CLIENT_ID=yyy pnpm dev
```

Or use the CLI to add the server:

```bash
claude mcp add m365 node /absolute/path/to/ms-mcp/dist/index.js \
  --env AZURE_TENANT_ID=your-tenant-id \
  --env AZURE_CLIENT_ID=your-client-id
```

Then reconnect the MCP server via `/mcp` in Claude Code.

## Step 6: Try a Quick Example

Once the server is connected, try this prompt in Claude:

> Summarize my unread emails. Categorize them as: urgent, informational, delegatable.

Claude will:
1. Call `list_emails` with the filter for unread emails
2. Call `read_email` for each relevant message
3. Create a structured summary

### More Example Prompts

```
Show me all emails from max.mustermann@example.com from the last week.

Search for emails with the subject "Proposal" that have attachments.

What mail folders do I have and how many unread emails are in each?

Read my most recent email and summarize it.

List my upcoming calendar events for next week.
```

## Troubleshooting

### "AZURE_TENANT_ID is required"

The `.env` file is not found or variables are not set. Check the file path and variable names. If you configure env variables in `claude_desktop_config.json`, make sure they are in the `env` block.

### "Access token has expired"

Token expired. Usually a server restart is sufficient — the persistent cache contains the refresh token, which automatically gets a new access token. If that doesn't help: `pnpm auth logout` then `pnpm auth login`.

### "ErrorAccessDenied" / "Insufficient privileges"

API permissions not granted in Azure or admin consent is missing. Check Step 1 — particularly the "Grant admin consent" section.

### "ECONNREFUSED"

Network issue. Check internet connection and firewall settings. The server needs access to `graph.microsoft.com` and `login.microsoftonline.com`.

### Claude Desktop shows no tools

Check the path in `claude_desktop_config.json`. Must be absolute path to `dist/index.js`. After changes, fully restart Claude Desktop (not just close the window).

### "AADSTS700016: Application not found"

The client ID does not match the app registration. Check `AZURE_CLIENT_ID` against the Overview page in Azure Portal.

### "AADSTS7000218: Request body must contain client_assertion or client_secret"

Public client flow is not enabled. Check Step 1 under "Enable Public Client Flow".

### "Authentication token is invalid" (AuthTokenError)

This typically happens when:
- Azure App Registration permissions have changed
- Admin consent was revoked
- Refresh token expired

**To fix:**
1. Ensure all required API permissions are granted in Azure Portal
2. Grant admin consent (green button in "API permissions" section)
3. Log out and re-authenticate:
   ```bash
   pnpm auth logout
   pnpm auth login
   ```

## Configuration Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `AZURE_TENANT_ID` | Yes | — | Azure AD Tenant ID |
| `AZURE_CLIENT_ID` | Yes | — | App Registration Client ID |
| `TOKEN_CACHE_PATH` | No | `~/.ms-mcp/token-cache.json` | Path to persistent token cache file |
| `LOG_LEVEL` | No | `info` | trace, debug, info, warn, error, fatal |

## Available Tools

For a complete list of all 99 available tools and their required permissions, see `docs/PERMISSIONS.md` and `docs/TOOLS.md`.

**Summary by module:**

- **Mail (20 tools):** Email CRUD, search, attachments, drafts, flags, rules, folders, item/reference attachments
- **Calendar (9 tools):** Events, availability checks, RSVP, scheduling
- **OneDrive (12 tools):** File storage, sharing, search, download/upload, large files, async monitoring
- **Teams (8 tools):** Team/channel messaging, chats, message history
- **SharePoint (8 tools):** Site discovery, document libraries, list management
- **Contacts (7 tools):** Contact management, search, folders
- **To Do (7 tools):** Task lists, tasks, task management
- **User & Directory (7 tools):** User profiles, org chart, group membership, photos
- **Advanced Features (15 tools):** Message signing, meeting rooms, delegate access, advanced sharing

See `docs/TOOLS.md` for complete list of all 99 tools with descriptions.
