import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const mailHandlers = [
  // GET /me/messages – List emails
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
];
