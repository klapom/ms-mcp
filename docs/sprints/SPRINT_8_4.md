# Sprint 8.4 — Teams Advanced & Notifications

**Phase:** 8 (Advanced Features)
**Goal:** Implement 5 advanced Teams tools for activity feeds, mentions, and meeting transcripts
**Status:** PLANNED
**Test-Delta:** ~1015 → ~1060 (+45 tests)

---

## New Permissions Required

| Scope | Reason |
|---|---|
| `TeamsActivity.Read` | Read Teams activity feed and notifications |
| `OnlineMeetings.Read` | Access meeting transcripts and recordings |
| `Channel.Create` | Create new Teams channels |
| `TeamMember.Read.All` | List team members and roles |

---

## Features to Implement

### F-8.4.1: `list_activity_feed` (Safe)

**Graph API:** GET /me/teamwork/installedApps (activity notifications via beta endpoint)
**Classification:** safe (read-only)
**Permission:** TeamsActivity.Read

**Functionality:**
- List Teams activity feed notifications
- Shows: mentions, replies, reactions, channel activity
- Filter by activity type (mention, reply, reaction, channelActivity)
- Returns notification details: actor, action, timestamp, link to content
- Pagination support

**Schema:** `src/schemas/teams-activity.ts` → `ListActivityFeedParams` (extends ListParams)
```typescript
ListActivityFeedParams = ListParams.extend({
  activity_type: z.enum(["mention", "reply", "reaction", "channelActivity", "all"]).default("all")
    .describe("Filter by activity type"),
  unread_only: z.boolean().default(false).describe("Show only unread notifications"),
});
```

**Key Implementation Details:**
- GET /me/teamwork/activityHistory (requires TeamsActivity.Read)
- $filter: activityType eq 'mention' or isRead eq false
- $select: id, activityType, actor, timestamp, isRead, previewText, webUrl
- Format: "[Mention] John Doe mentioned you in 'Marketing Channel' - 'Can you review...' (2h ago)"
- Pagination: top/skip, @odata.nextLink
- Note: This uses beta endpoint in Graph API, may change

---

### F-8.4.2: `list_mentions` (Safe)

**Graph API:** GET /me/chats/getAllMessages or GET /me/teamwork/activityHistory
**Classification:** safe (read-only)
**Permission:** ChannelMessage.Read.All, Chat.Read

**Functionality:**
- List all messages where current user was mentioned (@mentioned)
- Search across channels and chats
- Returns: message content, sender, channel/chat context, timestamp
- Pagination support
- Direct link to message in Teams

**Schema:** `src/schemas/teams-activity.ts` → `ListMentionsParams` (extends ListParams)
```typescript
ListMentionsParams = ListParams.extend({
  source: z.enum(["channels", "chats", "all"]).default("all")
    .describe("Search mentions in channels, chats, or both"),
  unread_only: z.boolean().default(false).describe("Show only unread mentions"),
});
```

**Key Implementation Details:**
- GET /me/chats/getAllMessages?$filter=mentions/any(m: m/mentioned/user/id eq '{userId}')
- Alternative: GET /me/teamwork/activityHistory with activityType filter
- $select: id, from, body, createdDateTime, channelIdentity/chatIdentity, webUrl
- Format: "@Mention: John Doe in 'Project Team > General' - 'Can you review the proposal...' (1d ago)"
- Show channel or chat context
- Pagination: top/skip

---

### F-8.4.3: `create_channel` (Destructive)

**Graph API:** POST /teams/{id}/channels
**Classification:** destructive
**Permission:** Channel.Create

**Functionality:**
- Create new channel in a Teams team
- Set channel name, description, membership type (standard/private)
- Optional: add initial members for private channels
- Returns: channel ID, web URL
- Destructive safety: confirm + idempotency + preview

**Schema:** `src/schemas/teams-write.ts` → `CreateChannelParams` (extends WriteParams)
```typescript
CreateChannelParams = WriteParams.extend({
  team_id: z.string().min(1).describe("Team ID where channel will be created"),
  display_name: z.string().min(1).max(50).describe("Channel name"),
  description: z.string().max(1024).optional().describe("Channel description"),
  membership_type: z.enum(["standard", "private"]).default("standard")
    .describe("Channel membership type"),
  owner_user_id: z.string().optional()
    .describe("User ID of channel owner (required for private channels)"),
});
```

**Key Implementation Details:**
- POST /teams/{id}/channels
- Body: `{ displayName, description, membershipType }`
- Private channels require owner in @microsoft.graph.user format
- Preview: "Create channel 'Q1 Planning' in team 'Marketing' (Type: standard)"
- Returns: channel ID, webUrl
- Idempotency: cache key includes team_id + display_name
- Error: 409 Conflict if channel name already exists

---

### F-8.4.4: `list_team_members` (Safe)

**Graph API:** GET /teams/{id}/members
**Classification:** safe (read-only)
**Permission:** TeamMember.Read.All

**Functionality:**
- List all members of a Teams team
- Shows: display name, email, role (owner, member, guest)
- Filter by role
- Returns user details and membership info
- Pagination support

**Schema:** `src/schemas/teams-members.ts` → `ListTeamMembersParams` (extends ListParams)
```typescript
ListTeamMembersParams = ListParams.extend({
  team_id: z.string().min(1).describe("Team ID"),
  role: z.enum(["owner", "member", "guest", "all"]).default("all")
    .describe("Filter by member role"),
});
```

**Key Implementation Details:**
- GET /teams/{id}/members
- $select: id, displayName, email, roles, userId
- roles[] array: contains "owner" for owners, empty for members
- Format: "John Doe (john@example.com) - Owner" or "Jane Smith (jane@example.com) - Member"
- Client-side filtering by role (Graph API doesn't support $filter on roles)
- Pagination: top/skip

---

### F-8.4.5: `get_meeting_transcript` (Safe)

**Graph API:** GET /me/onlineMeetings/{id}/transcripts
**Classification:** safe (read-only)
**Permission:** OnlineMeetings.Read

**Functionality:**
- Retrieve meeting transcript content (VTT format)
- Parse transcript: extract speaker, timestamp, text
- Support multiple transcripts per meeting (different languages)
- Returns: formatted transcript with speakers and timestamps
- Optional: download raw VTT file as base64

**Schema:** `src/schemas/teams-meetings.ts` → `GetMeetingTranscriptParams` (extends BaseParams)
```typescript
GetMeetingTranscriptParams = BaseParams.extend({
  meeting_id: z.string().min(1).describe("Online meeting ID or joinWebUrl"),
  transcript_id: z.string().optional()
    .describe("Specific transcript ID (if multiple available)"),
  format: z.enum(["text", "vtt"]).default("text")
    .describe("Output format: text (parsed) or vtt (raw file)"),
});
```

**Key Implementation Details:**
- GET /me/onlineMeetings/{id}/transcripts → list available transcripts
- GET /me/onlineMeetings/{id}/transcripts/{transcriptId}/content → VTT file content
- VTT parser utility in `src/utils/vtt-parser.ts`
- Format (text mode):
  ```
  [00:00:15] John Doe: Welcome everyone to the sprint planning meeting.
  [00:00:32] Jane Smith: Thanks for joining. Let's review the backlog.
  [00:01:05] John Doe: First item is the authentication feature...
  ```
- Format (vtt mode): return raw VTT as base64 or plain text
- Note: Transcripts may not be immediately available after meeting (processing delay)

---

## New Files to Create

| File | Purpose | Estimated LOC |
|---|---|---|
| `src/schemas/teams-activity.ts` | 2 activity feed schemas | ~50 |
| `src/schemas/teams-write.ts` | CreateChannelParams schema | ~40 |
| `src/schemas/teams-members.ts` | ListTeamMembersParams schema | ~30 |
| `src/schemas/teams-meetings.ts` | GetMeetingTranscriptParams schema | ~40 |
| `src/utils/vtt-parser.ts` | VTT transcript parser utility | ~120 |
| `src/tools/teams-activity.ts` | list_activity_feed, list_mentions | ~150 |
| `src/tools/teams-channels-write.ts` | create_channel handler | ~100 |
| `src/tools/teams-members.ts` | list_team_members handler | ~80 |
| `src/tools/teams-meetings.ts` | get_meeting_transcript handler + VTT parsing | ~120 |
| `tests/teams-activity.test.ts` | ~10 tests (activity + mentions) | ~150 |
| `tests/teams-channels-write.test.ts` | ~10 tests | ~150 |
| `tests/teams-members.test.ts` | ~8 tests | ~120 |
| `tests/teams-meetings.test.ts` | ~10 tests | ~150 |
| `tests/vtt-parser.test.ts` | Unit tests for VTT parser | ~7 tests (~105 LOC) |
| `tests/mocks/handlers/teams-activity.ts` | MSW handlers for activity endpoints | ~100 |
| `tests/mocks/handlers/teams-meetings.ts` | MSW handlers for meetings/transcripts | ~80 |

---

## Modified Files

| File | Changes |
|---|---|
| `src/index.ts` | Register 5 new Teams tools |
| `tests/mocks/handlers/index.ts` | Spread teamsActivityHandlers, teamsMeetingsHandlers |

---

## VTT Parser Utility

Create `src/utils/vtt-parser.ts`:

```typescript
export interface VttCue {
  startTime: string;  // "00:01:23.456"
  endTime: string;
  speaker: string;    // Extracted from cue text or previous cue
  text: string;       // Clean cue text without speaker prefix
}

export interface ParsedTranscript {
  cues: VttCue[];
  language?: string;
  duration?: string;
}

export function parseVtt(vttContent: string): ParsedTranscript {
  const lines = vttContent.split('\n');
  const cues: VttCue[] = [];
  let currentSpeaker = 'Unknown';

  // VTT format:
  // WEBVTT
  //
  // 00:00:15.000 --> 00:00:32.000
  // <v John Doe>Welcome everyone to the sprint planning meeting.</v>
  //
  // 00:00:32.000 --> 00:01:05.000
  // <v Jane Smith>Thanks for joining. Let's review the backlog.</v>

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip WEBVTT header and empty lines
    if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE')) {
      continue;
    }

    // Check for timestamp line
    if (line.includes('-->')) {
      const [startTime, endTime] = line.split('-->').map(t => t.trim());
      const textLine = lines[i + 1]?.trim() || '';

      // Extract speaker and text from <v Speaker>Text</v>
      const speakerMatch = textLine.match(/<v\s+([^>]+)>(.+?)<\/v>/);
      if (speakerMatch) {
        currentSpeaker = speakerMatch[1];
        const text = speakerMatch[2];
        cues.push({ startTime, endTime, speaker: currentSpeaker, text });
      } else {
        // No speaker tag, use previous speaker
        cues.push({ startTime, endTime, speaker: currentSpeaker, text: textLine });
      }

      i++; // Skip text line
    }
  }

  return { cues };
}

export function formatTranscriptText(parsed: ParsedTranscript): string {
  return parsed.cues
    .map(cue => `[${cue.startTime.substring(0, 8)}] ${cue.speaker}: ${cue.text}`)
    .join('\n');
}
```

---

## MSW Handlers

### GET /me/teamwork/activityHistory
- Return activity notifications array
- Support $filter by activityType, isRead
- Pagination: top/skip

### GET /me/chats/getAllMessages
- Return messages with mentions
- Filter by mentions/any(...)
- Include channel/chat context

### POST /teams/{id}/channels
- Accept: displayName, description, membershipType
- Return: { id, displayName, webUrl, membershipType }
- Error 409: channel name already exists

### GET /teams/{id}/members
- Return members array with roles
- Support pagination

### GET /me/onlineMeetings/{id}/transcripts
- Return transcripts array (metadata)
- Each: { id, language, createdDateTime, contentUrl }

### GET /me/onlineMeetings/{id}/transcripts/{transcriptId}/content
- Return VTT file content as string
- Mock VTT format with sample transcript

---

## Tests Summary

**Total:** ~45 new tests across 5 test files

### teams-activity.test.ts (~10 tests)

**list_activity_feed:**
1. Schema: activity_type enum, unread_only boolean
2. API: list all activities
3. Filter: by activity_type (mention only)
4. Filter: unread_only=true
5. Format: activity summary with actor, action, timestamp
6. Pagination: top/skip
7. Empty: no activities

**list_mentions:**
8. Schema: source enum (channels/chats/all)
9. API: list all mentions
10. Filter: channels only, chats only

### teams-channels-write.test.ts (~10 tests)
1. Schema: team_id, display_name required
2. Schema: membership_type enum (standard/private)
3. Preview: shows channel name, team, type
4. API: create standard channel
5. API: create private channel (with owner)
6. Idempotency: cached after creation
7. Returns: channel ID, webUrl
8. Error: 409 channel name exists
9. Error: 400 invalid team_id
10. Error: 403 insufficient permission

### teams-members.test.ts (~8 tests)
1. Schema: team_id required
2. API: list all members
3. Filter: owners only
4. Filter: members only
5. Filter: guests only
6. Format: name, email, role
7. Pagination: top/skip
8. Error: 404 team not found

### teams-meetings.test.ts (~10 tests)
1. Schema: meeting_id required, format enum
2. API: list transcripts for meeting
3. API: get specific transcript (transcript_id)
4. Format: text mode (parsed with speakers/timestamps)
5. Format: vtt mode (raw VTT content)
6. VTT parsing: extract speakers
7. VTT parsing: extract timestamps
8. VTT parsing: format text output
9. Empty: no transcripts available (processing)
10. Error: 404 meeting not found

### vtt-parser.test.ts (~7 tests)
1. Parse simple VTT: single cue
2. Parse multiple cues: speaker changes
3. Parse speaker tags: <v Speaker>Text</v>
4. Parse without speaker tags: use previous
5. Format transcript text: [timestamp] Speaker: text
6. Handle empty VTT
7. Handle malformed VTT (skip invalid lines)

---

## Build + Test Verification

- [ ] `pnpm build` — all new files compile
- [ ] `pnpm typecheck` — strict mode clean
- [ ] `pnpm lint` — Biome clean (extract helpers if complexity >15)
- [ ] `pnpm test` — 1015 → 1060 (+45 tests)
- [ ] No regressions in existing tools
- [ ] All 5 tools registered in index.ts
- [ ] VTT parser utility unit tested
- [ ] New scopes added to README/SETUP docs

---

## Reused Utilities

| Utility | File | Used By |
|---|---|---|
| `BaseParams`, `ListParams`, `WriteParams` | `src/schemas/common.ts` | All 5 tools |
| `checkConfirmation()` | `src/utils/confirmation.ts` | create_channel |
| `idempotencyCache` | `src/utils/idempotency.ts` | create_channel |
| `encodeGraphId()` | `src/utils/graph-id.ts` | All tools |
| `fetchPage()` | `src/utils/pagination.ts` | List tools |
| `createLogger()` | `src/utils/logger.ts` | All tools |

---

## Acceptance Criteria

- [ ] All 5 advanced Teams tools fully implemented + tested
- [ ] VTT parser correctly extracts speakers, timestamps, text
- [ ] Activity feed shows mentions, replies, reactions
- [ ] Channel creation works for standard and private channels
- [ ] Meeting transcripts parsed and formatted correctly
- [ ] 45 new tests covering happy path + errors + edge cases
- [ ] No regressions in existing tools
- [ ] New scopes (TeamsActivity.Read, OnlineMeetings.Read, Channel.Create, TeamMember.Read.All) documented
- [ ] E2E tests: list_mentions, create_channel, get_meeting_transcript

---

## Known Limitations & Future Work

1. **Activity Feed Beta Endpoint:** TeamsActivity.Read uses beta Graph API endpoint, may change.
2. **Transcript Availability:** Transcripts not immediately available after meeting (processing delay, typically 1-2 hours).
3. **Transcript Languages:** get_meeting_transcript returns first available transcript. Multi-language selection deferred.
4. **Private Channel Members:** Adding initial members to private channel requires additional API call (not included in MVP).
5. **Activity Marking as Read:** Marking notifications as read requires separate tool (Phase 9 candidate).
6. **Meeting Recordings:** Downloading meeting recordings requires separate tool + OnlineMeetings.Read scope (Phase 9).
7. **Channel Management:** Updating/deleting channels requires separate tools (Phase 9).

---

## Implementation Notes

### VTT Format Example

```
WEBVTT

NOTE Transcript for Sprint Planning Meeting

00:00:15.000 --> 00:00:32.000
<v John Doe>Welcome everyone to the sprint planning meeting.</v>

00:00:32.000 --> 00:01:05.000
<v Jane Smith>Thanks for joining. Let's review the backlog.</v>

00:01:05.000 --> 00:01:42.000
<v John Doe>First item is the authentication feature. We estimated 8 points.</v>

00:01:42.000 --> 00:02:10.000
<v Jane Smith>I think we should break that down into smaller tasks.</v>
```

### Parsed Output (text format)

```
[00:00:15] John Doe: Welcome everyone to the sprint planning meeting.
[00:00:32] Jane Smith: Thanks for joining. Let's review the backlog.
[00:01:05] John Doe: First item is the authentication feature. We estimated 8 points.
[00:01:42] Jane Smith: I think we should break that down into smaller tasks.
```

### Activity Feed Entry Format

```
[Mention] John Doe mentioned you in 'Marketing > General'
  "Can you review the budget proposal when you get a chance?"
  2 hours ago
  Link: https://teams.microsoft.com/l/message/...
```

### Team Member Roles

- **Owner:** Full admin rights (create/delete channels, manage members)
- **Member:** Standard participant (post messages, join channels)
- **Guest:** External user with limited access

---

## Post-Sprint Notes

Sprint 8.4 completes Phase 8 by adding Teams activity monitoring and meeting transcript access. The VTT parser utility is designed to handle Microsoft Teams transcript format specifically, which uses `<v Speaker>` tags.

Key insight: Activity feed and mentions provide crucial context for users working across multiple teams and channels. The combination of list_activity_feed and list_mentions gives comprehensive notification coverage.

Performance note: Meeting transcripts can be large (>1 MB for long meetings). Consider truncation or summary for context-constrained scenarios.

**Phase 8 Complete:**
- Total new tools: 22 (Sprint 8.1: 6, Sprint 8.2: 5, Sprint 8.3: 6, Sprint 8.4: 5)
- Total new tests: ~210
- Projected after Phase 8: 67 tools, ~1060 tests
