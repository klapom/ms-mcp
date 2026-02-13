import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const team1 = {
  id: "team-001",
  displayName: "Engineering",
  description: "Engineering team",
  isArchived: false,
  webUrl: "https://teams.example.com/engineering",
};

const team2 = {
  id: "team-002",
  displayName: "Marketing",
  description: "Marketing team",
  isArchived: true,
  webUrl: "https://teams.example.com/marketing",
};

const channel1 = {
  id: "channel-001",
  displayName: "General",
  description: "General discussion",
  webUrl: "https://teams.example.com/engineering/general",
  membershipType: "standard",
};

const channel2 = {
  id: "channel-002",
  displayName: "Random",
  description: null,
  webUrl: "https://teams.example.com/engineering/random",
  membershipType: "private",
};

const message1 = {
  id: "msg-001",
  createdDateTime: "2026-02-13T10:00:00Z",
  from: { user: { displayName: "Alice" } },
  body: { contentType: "html", content: "<p>Hello team!</p>" },
  importance: "normal",
};

const message2 = {
  id: "msg-002",
  createdDateTime: "2026-02-13T10:05:00Z",
  from: { user: { displayName: "Bob" } },
  body: { contentType: "text", content: "Important update" },
  importance: "high",
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const teamsHandlers = [
  // ---- list_teams ----
  http.get(`${GRAPH_BASE}/me/joinedTeams`, () => {
    return HttpResponse.json({ value: [team1, team2] });
  }),

  // ---- multi-tenant list_teams ----
  http.get(`${GRAPH_BASE}/users/:userId/joinedTeams`, () => {
    return HttpResponse.json({
      value: [{ ...team1, id: "team-mt-001", displayName: "MT Team" }],
    });
  }),

  // ---- send_channel_message ----
  http.post(
    `${GRAPH_BASE}/teams/:teamId/channels/:channelId/messages`,
    async ({ params, request }) => {
      const url = new URL(request.url);
      // Only match direct messages, not /messages/:id/replies
      if (url.pathname.includes("/replies")) return;

      if (params.teamId === "nonexistent") {
        return HttpResponse.json(
          { error: { code: "NotFound", message: "Team not found" } },
          { status: 404 },
        );
      }
      return HttpResponse.json(
        { id: "new-msg-001", createdDateTime: "2026-02-13T12:00:00Z" },
        { status: 201 },
      );
    },
  ),

  // ---- reply_to_channel_message ----
  http.post(
    `${GRAPH_BASE}/teams/:teamId/channels/:channelId/messages/:messageId/replies`,
    async ({ params }) => {
      if (params.messageId === "nonexistent") {
        return HttpResponse.json(
          { error: { code: "NotFound", message: "Message not found" } },
          { status: 404 },
        );
      }
      return HttpResponse.json(
        { id: "reply-001", createdDateTime: "2026-02-13T12:05:00Z" },
        { status: 201 },
      );
    },
  ),

  // ---- list_channels ----
  http.get(`${GRAPH_BASE}/teams/:teamId/channels`, ({ params, request }) => {
    const url = new URL(request.url);
    // Don't match sub-paths like /channels/:id/messages
    const pathAfterChannels = url.pathname.split("/channels")[1];
    if (pathAfterChannels && pathAfterChannels !== "" && pathAfterChannels !== "/") return;

    if (params.teamId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "NotFound", message: "Team not found" } },
        { status: 404 },
      );
    }
    return HttpResponse.json({ value: [channel1, channel2] });
  }),

  // ---- list_channel_messages ----
  http.get(`${GRAPH_BASE}/teams/:teamId/channels/:channelId/messages`, ({ params, request }) => {
    const url = new URL(request.url);
    // Don't match /messages/:id/replies
    const pathAfterMessages = url.pathname.split("/messages")[1];
    if (pathAfterMessages && pathAfterMessages !== "" && pathAfterMessages !== "/") return;

    if (params.channelId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "NotFound", message: "Channel not found" } },
        { status: 404 },
      );
    }
    return HttpResponse.json({ value: [message1, message2] });
  }),
];
