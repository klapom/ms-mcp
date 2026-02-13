import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const activity1 = {
  id: "act-001",
  activityType: "mention",
  actor: { user: { displayName: "John Doe" } },
  createdDateTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  isRead: false,
  previewText: { content: "Can you review the budget proposal?" },
  resourceLink: "https://teams.microsoft.com/l/message/1",
};

const activity2 = {
  id: "act-002",
  activityType: "reply",
  actor: { user: { displayName: "Jane Smith" } },
  createdDateTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  isRead: true,
  previewText: { content: "I agree with the approach" },
  resourceLink: "https://teams.microsoft.com/l/message/2",
};

const activity3 = {
  id: "act-003",
  activityType: "reaction",
  actor: { user: { displayName: "Bob Wilson" } },
  createdDateTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  isRead: false,
  previewText: { content: "Liked your message" },
  resourceLink: null,
};

const chatMention1 = {
  id: "chat-msg-001",
  from: { user: { displayName: "Alice Cooper" } },
  body: { content: "Hey, can you check this?" },
  createdDateTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  channelIdentity: null,
  webUrl: "https://teams.microsoft.com/l/chat/1",
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const teamsActivityHandlers = [
  // ---- activity feed ----
  http.get(`${GRAPH_BASE}/me/teamwork/activityHistory`, ({ request }) => {
    const url = new URL(request.url);
    const filter = url.searchParams.get("$filter") ?? "";

    let items = [activity1, activity2, activity3];

    if (filter.includes("activityType eq 'mention'")) {
      items = items.filter((a) => a.activityType === "mention");
    }
    if (filter.includes("isRead eq false")) {
      items = items.filter((a) => !a.isRead);
    }

    const top = url.searchParams.get("$top");
    if (top) {
      items = items.slice(0, Number.parseInt(top, 10));
    }

    return HttpResponse.json({ value: items });
  }),

  // ---- multi-tenant activity feed ----
  http.get(`${GRAPH_BASE}/users/:userId/teamwork/activityHistory`, () => {
    return HttpResponse.json({ value: [activity1] });
  }),

  // ---- chat mentions (getAllMessages) ----
  http.get(`${GRAPH_BASE}/me/chats/getAllMessages`, () => {
    return HttpResponse.json({ value: [chatMention1] });
  }),

  // ---- multi-tenant chat mentions ----
  http.get(`${GRAPH_BASE}/users/:userId/chats/getAllMessages`, () => {
    return HttpResponse.json({ value: [] });
  }),

  // ---- team members ----
  http.get(`${GRAPH_BASE}/teams/:teamId/members`, ({ params, request }) => {
    const url = new URL(request.url);
    // Don't match sub-paths
    const pathAfterMembers = url.pathname.split("/members")[1];
    if (pathAfterMembers && pathAfterMembers !== "" && pathAfterMembers !== "/") return;

    if (params.teamId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "NotFound", message: "Team not found" } },
        { status: 404 },
      );
    }

    return HttpResponse.json({
      value: [
        {
          id: "member-001",
          displayName: "Alice Admin",
          email: "alice@example.com",
          roles: ["owner"],
          userId: "user-001",
        },
        {
          id: "member-002",
          displayName: "Bob Builder",
          email: "bob@example.com",
          roles: [],
          userId: "user-002",
        },
        {
          id: "member-003",
          displayName: "Guest User",
          email: "guest@external.com",
          roles: ["guest"],
          userId: "user-003",
        },
      ],
    });
  }),

  // ---- create_channel ----
  http.post(`${GRAPH_BASE}/teams/:teamId/channels`, async ({ params, request }) => {
    const url = new URL(request.url);
    // Don't match sub-paths like /channels/:id/messages
    const pathAfterChannels = url.pathname.split("/channels")[1];
    if (pathAfterChannels && pathAfterChannels !== "" && pathAfterChannels !== "/") return;

    if (params.teamId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "BadRequest", message: "Invalid team ID" } },
        { status: 400 },
      );
    }

    if (params.teamId === "forbidden") {
      return HttpResponse.json(
        { error: { code: "Forbidden", message: "Insufficient permissions" } },
        { status: 403 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (body.displayName === "Existing Channel") {
      return HttpResponse.json(
        { error: { code: "Conflict", message: "Channel name already exists" } },
        { status: 409 },
      );
    }

    return HttpResponse.json(
      {
        id: "new-channel-001",
        displayName: body.displayName,
        description: body.description ?? null,
        membershipType: body.membershipType ?? "standard",
        webUrl: "https://teams.example.com/channels/new-channel-001",
      },
      { status: 201 },
    );
  }),
];
