import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const mailHandlers = [
  // GET /me/mailFolders/inbox/messages – List emails (default folder)
  http.get(`${GRAPH_BASE}/me/mailFolders/inbox/messages`, ({ request }) => {
    const url = new URL(request.url);

    // Trigger 401 when a special filter is passed
    if (url.searchParams.get("$filter") === "trigger_401") {
      return HttpResponse.json(
        {
          error: {
            code: "InvalidAuthenticationToken",
            message: "Access token has expired.",
          },
        },
        { status: 401 },
      );
    }

    return HttpResponse.json({
      "@odata.context":
        "https://graph.microsoft.com/v1.0/$metadata#users('me')/mailFolders('inbox')/messages",
      "@odata.count": 2,
      value: [
        {
          id: "msg-001",
          subject: "Test Email 1",
          from: {
            emailAddress: {
              name: "Max Mustermann",
              address: "max@example.com",
            },
          },
          receivedDateTime: "2026-02-11T10:00:00Z",
          bodyPreview: "This is a test email preview.",
          isRead: false,
          importance: "normal",
        },
        {
          id: "msg-002",
          subject: "Test Email 2",
          from: {
            emailAddress: {
              name: "Erika Muster",
              address: "erika@example.com",
            },
          },
          receivedDateTime: "2026-02-11T09:00:00Z",
          bodyPreview: "Another test email preview.",
          isRead: true,
          importance: "high",
        },
      ],
    });
  }),

  // GET /me/messages – Legacy path (kept for backward compatibility)
  http.get(`${GRAPH_BASE}/me/messages`, () => {
    return HttpResponse.json({
      "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users('me')/messages",
      "@odata.count": 2,
      value: [
        {
          id: "msg-001",
          subject: "Test Email 1",
          from: {
            emailAddress: {
              name: "Max Mustermann",
              address: "max@example.com",
            },
          },
          receivedDateTime: "2026-02-11T10:00:00Z",
          bodyPreview: "This is a test email preview.",
          isRead: false,
          importance: "normal",
        },
        {
          id: "msg-002",
          subject: "Test Email 2",
          from: {
            emailAddress: {
              name: "Erika Muster",
              address: "erika@example.com",
            },
          },
          receivedDateTime: "2026-02-11T09:00:00Z",
          bodyPreview: "Another test email preview.",
          isRead: true,
          importance: "high",
        },
      ],
    });
  }),

  // 404 Not Found for non-existent folder
  http.get(`${GRAPH_BASE}/me/mailFolders/nonexistent/messages`, () => {
    return HttpResponse.json(
      {
        error: {
          code: "ErrorItemNotFound",
          message: "The specified folder was not found.",
        },
      },
      { status: 404 },
    );
  }),

  // 429 Too Many Requests
  http.get(`${GRAPH_BASE}/me/mailFolders/rate-limited/messages`, () => {
    return HttpResponse.json(
      {
        error: {
          code: "TooManyRequests",
          message: "Too many requests.",
        },
      },
      { status: 429, headers: { "Retry-After": "5" } },
    );
  }),

  // Pagination response (page 1 with nextLink)
  http.get(`${GRAPH_BASE}/me/mailFolders/paginated/messages`, () => {
    return HttpResponse.json({
      "@odata.context":
        "https://graph.microsoft.com/v1.0/$metadata#users('me')/mailFolders('paginated')/messages",
      "@odata.count": 50,
      "@odata.nextLink": `${GRAPH_BASE}/me/mailFolders/paginated/messages?$skip=25`,
      value: [
        {
          id: "page1-msg-001",
          subject: "Page 1 Email",
          from: {
            emailAddress: {
              name: "Test User",
              address: "test@example.com",
            },
          },
          receivedDateTime: "2026-02-11T10:00:00Z",
          bodyPreview: "Page 1 preview",
          isRead: false,
          importance: "normal",
        },
      ],
    });
  }),
];
