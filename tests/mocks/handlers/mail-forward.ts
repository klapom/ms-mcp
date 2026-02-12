import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const mailForwardHandlers = [
  // POST /me/messages/{id}/forward — Success (202 Accepted)
  http.post(`${GRAPH_BASE}/me/messages/:messageId/forward`, async ({ params, request }) => {
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

    // Trigger 400 when toRecipients contains a trigger address
    const body = (await request.json()) as Record<string, unknown>;
    const recipients = body.toRecipients as Array<Record<string, unknown>> | undefined;
    if (recipients) {
      for (const r of recipients) {
        const emailAddr = r.emailAddress as Record<string, unknown> | undefined;
        if (emailAddr?.address === "trigger_400@example.com") {
          return HttpResponse.json(
            {
              error: {
                code: "ErrorInvalidRecipients",
                message: "At least one recipient is not valid.",
              },
            },
            { status: 400 },
          );
        }
      }
    }

    return new HttpResponse(null, { status: 202 });
  }),

  // POST /users/{userId}/messages/{id}/forward — Multi-tenant (202 Accepted)
  http.post(`${GRAPH_BASE}/users/:userId/messages/:messageId/forward`, () => {
    return new HttpResponse(null, { status: 202 });
  }),
];
