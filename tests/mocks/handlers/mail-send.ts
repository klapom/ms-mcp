import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const mailSendHandlers = [
  // POST /me/sendMail — Success (202 Accepted, empty body)
  http.post(`${GRAPH_BASE}/me/sendMail`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const message = body.message as Record<string, unknown> | undefined;

    // Trigger 403 when subject contains "trigger_403"
    if (message?.subject === "trigger_403") {
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

    // Trigger 400 when subject contains "trigger_400"
    if (message?.subject === "trigger_400") {
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

    // Trigger 429 when subject contains "trigger_429"
    if (message?.subject === "trigger_429") {
      return HttpResponse.json(
        {
          error: {
            code: "TooManyRequests",
            message: "Too many requests.",
          },
        },
        { status: 429, headers: { "Retry-After": "30" } },
      );
    }

    // Trigger 413 when subject contains "trigger_413"
    if (message?.subject === "trigger_413") {
      return HttpResponse.json(
        {
          error: {
            code: "RequestEntityTooLarge",
            message: "The request payload is too large.",
          },
        },
        { status: 413 },
      );
    }

    // Default: 202 Accepted with empty body
    return new HttpResponse(null, { status: 202 });
  }),

  // POST /users/{userId}/sendMail — Multi-tenant (202 Accepted)
  http.post(`${GRAPH_BASE}/users/:userId/sendMail`, () => {
    return new HttpResponse(null, { status: 202 });
  }),
];
