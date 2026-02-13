import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const chat1 = {
  id: "chat-001",
  chatType: "oneOnOne",
  topic: null,
  lastUpdatedDateTime: "2026-02-13T09:00:00Z",
  webUrl: "https://teams.example.com/chat/001",
};

const chat2 = {
  id: "chat-002",
  chatType: "group",
  topic: "Project Alpha",
  lastUpdatedDateTime: "2026-02-13T10:00:00Z",
  webUrl: "https://teams.example.com/chat/002",
};

const chatMessage1 = {
  id: "cmsg-001",
  createdDateTime: "2026-02-13T09:30:00Z",
  from: { user: { displayName: "Alice" } },
  body: { contentType: "text", content: "Hello!" },
};

const chatMessage2 = {
  id: "cmsg-002",
  createdDateTime: "2026-02-13T09:35:00Z",
  from: { user: { displayName: "Bob" } },
  body: { contentType: "html", content: "<p>Hi there!</p>" },
};

export const chatHandlers = [
  // ---- list_chats ----
  http.get(`${GRAPH_BASE}/me/chats`, ({ request }) => {
    const url = new URL(request.url);
    // Don't match /chats/:id/messages
    const pathAfterChats = url.pathname.replace(/^\/v1\.0\/me\/chats/, "");
    if (pathAfterChats && pathAfterChats !== "" && pathAfterChats !== "/") return;

    const filter = url.searchParams.get("$filter");
    if (filter?.includes("oneOnOne")) {
      return HttpResponse.json({ value: [chat1] });
    }
    return HttpResponse.json({ value: [chat1, chat2] });
  }),

  // ---- send_chat_message ----
  http.post(`${GRAPH_BASE}/me/chats/:chatId/messages`, ({ params }) => {
    if (params.chatId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "NotFound", message: "Chat not found" } },
        { status: 404 },
      );
    }
    return HttpResponse.json(
      { id: "new-cmsg-001", createdDateTime: "2026-02-13T12:00:00Z" },
      { status: 201 },
    );
  }),

  // ---- list_chat_messages ----
  http.get(`${GRAPH_BASE}/me/chats/:chatId/messages`, ({ params }) => {
    if (params.chatId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "NotFound", message: "Chat not found" } },
        { status: 404 },
      );
    }
    return HttpResponse.json({ value: [chatMessage1, chatMessage2] });
  }),
];
