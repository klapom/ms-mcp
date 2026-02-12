import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const createdEvent = {
  id: "evt-new-001",
  subject: "New Event",
  start: { dateTime: "2026-02-15T10:00:00.0000000", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-02-15T11:00:00.0000000", timeZone: "Europe/Berlin" },
  location: { displayName: "Office" },
  organizer: { emailAddress: { name: "Test User", address: "test@example.com" } },
  isAllDay: false,
  importance: "normal",
  showAs: "busy",
  isOnlineMeeting: false,
};

const scheduleResponse = {
  value: [
    {
      scheduleId: "alice@example.com",
      availabilityView: "0012200",
      scheduleItems: [
        {
          status: "busy",
          subject: "Meeting",
          start: { dateTime: "2026-02-15T10:00:00.0000000", timeZone: "Europe/Berlin" },
          end: { dateTime: "2026-02-15T11:00:00.0000000", timeZone: "Europe/Berlin" },
        },
      ],
    },
    {
      scheduleId: "bob@example.com",
      availabilityView: "0000000",
      scheduleItems: [],
    },
  ],
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const calendarWriteHandlers = [
  // ---- create_event ----

  // POST /me/events → 201 created event
  http.post(`${GRAPH_BASE}/me/events`, async ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/me/events = pathParts=3
    if (pathParts.length !== 3) return;

    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { ...createdEvent, subject: body.subject ?? createdEvent.subject },
      { status: 201 },
    );
  }),

  // POST /me/calendars/:calId/events → 201
  http.post(`${GRAPH_BASE}/me/calendars/:calId/events`, async ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) return;

    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { ...createdEvent, id: "evt-cal-new", subject: body.subject ?? createdEvent.subject },
      { status: 201 },
    );
  }),

  // POST /users/:uid/events → 201 (multi-tenant)
  http.post(`${GRAPH_BASE}/users/:uid/events`, async ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) return;

    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { ...createdEvent, id: "evt-mt-new", subject: body.subject ?? createdEvent.subject },
      { status: 201 },
    );
  }),

  // ---- update_event ----

  // PATCH /me/events/:id → 200 merged event
  http.patch(`${GRAPH_BASE}/me/events/:eventId`, async ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) return;

    if (params.eventId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "ErrorItemNotFound", message: "Event not found." } },
        { status: 404 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...createdEvent,
      id: params.eventId,
      ...body,
    });
  }),

  // ---- delete_event ----

  // DELETE /me/events/:id → 204
  http.delete(`${GRAPH_BASE}/me/events/:eventId`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) return;

    if (params.eventId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "ErrorItemNotFound", message: "Event not found." } },
        { status: 404 },
      );
    }

    return new HttpResponse(null, { status: 204 });
  }),

  // ---- respond_to_event ----

  // POST /me/events/:id/accept → 202
  http.post(`${GRAPH_BASE}/me/events/:eventId/accept`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) return;

    if (params.eventId === "organizer-evt") {
      return HttpResponse.json(
        { error: { code: "ErrorAccessDenied", message: "Organizer cannot respond." } },
        { status: 403 },
      );
    }

    return new HttpResponse(null, { status: 202 });
  }),

  // POST /me/events/:id/decline → 202
  http.post(`${GRAPH_BASE}/me/events/:eventId/decline`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) return;

    return new HttpResponse(null, { status: 202 });
  }),

  // POST /me/events/:id/tentativelyAccept → 202
  http.post(`${GRAPH_BASE}/me/events/:eventId/tentativelyAccept`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) return;

    return new HttpResponse(null, { status: 202 });
  }),

  // ---- check_availability ----

  // POST /me/calendar/getSchedule → 200
  http.post(`${GRAPH_BASE}/me/calendar/getSchedule`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) return;

    return HttpResponse.json(scheduleResponse);
  }),

  // POST /users/:uid/calendar/getSchedule → 200 (multi-tenant)
  http.post(`${GRAPH_BASE}/users/:uid/calendar/getSchedule`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) return;

    return HttpResponse.json(scheduleResponse);
  }),
];
