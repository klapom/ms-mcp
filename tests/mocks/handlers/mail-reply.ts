import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const mailReplyHandlers = [
  // POST /me/messages/{id}/reply — Success (202 Accepted)
  http.post(`${GRAPH_BASE}/me/messages/:messageId/reply`, ({ params }) => {
    const { messageId } = params;

    if (messageId === "nonexistent") {
      return HttpResponse.json(
        {
          error: {
            code: "ErrorItemNotFound",
            message: "The specified object was not found in the store.",
          },
        },
        { status: 404 },
      );
    }

    if (messageId === "forbidden-msg") {
      return HttpResponse.json(
        {
          error: {
            code: "ErrorAccessDenied",
            message: "Access is denied. Check credentials and try again.",
          },
        },
        { status: 403 },
      );
    }

    return new HttpResponse(null, { status: 202 });
  }),

  // POST /me/messages/{id}/replyAll — Success (202 Accepted)
  http.post(`${GRAPH_BASE}/me/messages/:messageId/replyAll`, ({ params }) => {
    const { messageId } = params;

    if (messageId === "nonexistent") {
      return HttpResponse.json(
        {
          error: {
            code: "ErrorItemNotFound",
            message: "The specified object was not found in the store.",
          },
        },
        { status: 404 },
      );
    }

    return new HttpResponse(null, { status: 202 });
  }),

  // POST /users/{userId}/messages/{id}/reply — Multi-tenant (202 Accepted)
  http.post(`${GRAPH_BASE}/users/:userId/messages/:messageId/reply`, () => {
    return new HttpResponse(null, { status: 202 });
  }),

  // POST /users/{userId}/messages/{id}/replyAll — Multi-tenant (202 Accepted)
  http.post(`${GRAPH_BASE}/users/:userId/messages/:messageId/replyAll`, () => {
    return new HttpResponse(null, { status: 202 });
  }),
];
