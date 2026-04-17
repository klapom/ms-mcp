#!/usr/bin/env bash
#
# Reproduce the create_draft regression against a running ms-mcp HTTP server.
#
# Usage:
#   MCP_URL=http://localhost:8102/mcp \
#   MCP_TOKEN=<bearer> \
#     bash scripts/repro-create-draft.sh
#
# Expected behaviour before the fix: both POSTs return the same Message ID
# (because CachingMiddleware treated the POST as a GET and cached the
# response under GET:{url}:me).
#
# Expected behaviour after the fix: each POST returns a distinct Message ID
# and a new draft appears in the user's Drafts folder.
#
# NOTE: This script does NOT touch the production process — it only sends
# MCP protocol messages over HTTP. Replace the recipients with values you
# are happy to see show up in your own Drafts folder.

set -euo pipefail

MCP_URL="${MCP_URL:-http://localhost:8102/mcp}"
MCP_TOKEN="${MCP_TOKEN:?MCP_TOKEN must be set to the MCP bearer token}"

call_mcp() {
  local body="$1"
  curl -sS -X POST "${MCP_URL}" \
    -H "Authorization: Bearer ${MCP_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    --data "${body}"
}

# 1. initialize
init_resp="$(call_mcp '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "repro", "version": "0.0.1"}
  }
}')"
printf 'initialize → %s\n\n' "${init_resp}"

# Extract session id if the server sets one (Streamable HTTP transport).
SESSION_ID="$(printf '%s' "${init_resp}" | grep -oE 'Mcp-Session-Id: [A-Za-z0-9-]+' | head -n1 | awk '{print $2}' || true)"

# 2. notifications/initialized
call_mcp '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' >/dev/null

# 3. first create_draft
first_resp="$(call_mcp '{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "create_draft",
    "arguments": {
      "to": [{"address": "klaus.pommer@pommerconsulting.de"}],
      "subject": "repro-first",
      "body": "first body",
      "confirm": true
    }
  }
}')"
printf 'first create_draft → %s\n\n' "${first_resp}"

# 4. second create_draft — different subject/recipient
second_resp="$(call_mcp '{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "create_draft",
    "arguments": {
      "to": [{"address": "klaus.pommer@pommerconsulting.de"}],
      "subject": "repro-second",
      "body": "second body",
      "confirm": true
    }
  }
}')"
printf 'second create_draft → %s\n\n' "${second_resp}"

FIRST_ID="$(printf '%s' "${first_resp}"  | grep -oE 'Message ID: [^\\n"]+' | head -n1 | awk -F': ' '{print $2}' || true)"
SECOND_ID="$(printf '%s' "${second_resp}" | grep -oE 'Message ID: [^\\n"]+' | head -n1 | awk -F': ' '{print $2}' || true)"

printf 'first  id: %s\n' "${FIRST_ID:-<unparsed>}"
printf 'second id: %s\n' "${SECOND_ID:-<unparsed>}"

if [[ -n "${FIRST_ID}" && "${FIRST_ID}" == "${SECOND_ID}" ]]; then
  printf '\nREGRESSION REPRODUCED: both drafts returned the same Message ID.\n'
  exit 1
fi

printf '\nOK: drafts have distinct Message IDs.\n'
