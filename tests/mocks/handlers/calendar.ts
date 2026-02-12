import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const defaultCalendar = {
  id: "cal-default",
  name: "Calendar",
  color: "auto",
  hexColor: "#0078D4",
  isDefaultCalendar: true,
  canEdit: true,
  canShare: true,
  owner: { name: "Test User", address: "test@example.com" },
};

const projectCalendar = {
  id: "cal-project",
  name: "Project Calendar",
  color: "lightBlue",
  hexColor: "#00BFFF",
  isDefaultCalendar: false,
  canEdit: true,
  canShare: false,
  owner: { name: "Test User", address: "test@example.com" },
};

const sharedCalendar = {
  id: "cal-shared",
  name: "Team Calendar",
  color: "lightGreen",
  hexColor: "#90EE90",
  isDefaultCalendar: false,
  canEdit: false,
  canShare: false,
  owner: { name: "Team Lead", address: "team@example.com" },
};

const normalEvent = {
  id: "evt-001",
  subject: "Team Meeting",
  start: { dateTime: "2026-02-12T10:00:00.0000000", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-02-12T11:00:00.0000000", timeZone: "Europe/Berlin" },
  location: { displayName: "Conf Room A" },
  organizer: { emailAddress: { name: "Boss", address: "boss@example.com" } },
  isAllDay: false,
  importance: "normal",
  showAs: "busy",
  isCancelled: false,
  isOnlineMeeting: false,
};

const allDayEvent = {
  id: "evt-002",
  subject: "Company Holiday",
  start: { dateTime: "2026-02-14T00:00:00.0000000", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-02-15T00:00:00.0000000", timeZone: "Europe/Berlin" },
  location: { displayName: "" },
  organizer: { emailAddress: { name: "HR", address: "hr@example.com" } },
  isAllDay: true,
  importance: "normal",
  showAs: "free",
  isCancelled: false,
  isOnlineMeeting: false,
};

const cancelledEvent = {
  id: "evt-003",
  subject: "Cancelled Standup",
  start: { dateTime: "2026-02-13T09:00:00.0000000", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-02-13T09:15:00.0000000", timeZone: "Europe/Berlin" },
  location: { displayName: "" },
  organizer: { emailAddress: { name: "PM", address: "pm@example.com" } },
  isAllDay: false,
  importance: "low",
  showAs: "free",
  isCancelled: true,
  isOnlineMeeting: false,
};

const detailEvent = {
  id: "evt-001",
  subject: "Team Meeting",
  body: {
    contentType: "html",
    content: "<html><body><p>Let's discuss the project timeline.</p></body></html>",
  },
  bodyPreview: "Let's discuss the project timeline.",
  start: { dateTime: "2026-02-12T10:00:00.0000000", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-02-12T11:00:00.0000000", timeZone: "Europe/Berlin" },
  location: { displayName: "Conf Room A" },
  locations: [{ displayName: "Conf Room A" }],
  organizer: { emailAddress: { name: "Boss", address: "boss@example.com" } },
  attendees: [
    {
      type: "required",
      status: { response: "accepted", time: "2026-02-10T08:00:00Z" },
      emailAddress: { name: "Alice", address: "alice@example.com" },
    },
    {
      type: "required",
      status: { response: "tentativelyAccepted", time: "2026-02-10T09:00:00Z" },
      emailAddress: { name: "Bob", address: "bob@example.com" },
    },
    {
      type: "optional",
      status: { response: "none", time: "0001-01-01T00:00:00Z" },
      emailAddress: { name: "Charlie", address: "charlie@example.com" },
    },
  ],
  isAllDay: false,
  importance: "normal",
  sensitivity: "normal",
  showAs: "busy",
  isCancelled: false,
  isOrganizer: true,
  isOnlineMeeting: true,
  onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/test123" },
  onlineMeetingUrl: "",
  recurrence: null,
  hasAttachments: false,
  responseStatus: { response: "organizer", time: "0001-01-01T00:00:00Z" },
  webLink: "https://outlook.office365.com/owa/?itemid=evt-001",
  categories: ["Project-X", "Weekly"],
};

const projectEvent = {
  id: "evt-proj-001",
  subject: "Sprint Review",
  start: { dateTime: "2026-02-12T14:00:00.0000000", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-02-12T15:00:00.0000000", timeZone: "Europe/Berlin" },
  location: { displayName: "Virtual" },
  organizer: { emailAddress: { name: "PM", address: "pm@example.com" } },
  isAllDay: false,
  importance: "high",
  showAs: "busy",
  isCancelled: false,
  isOnlineMeeting: true,
};

const recurringOccurrence = {
  id: "evt-rec-001",
  subject: "Daily Standup",
  start: { dateTime: "2026-02-12T09:00:00.0000000", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-02-12T09:15:00.0000000", timeZone: "Europe/Berlin" },
  location: { displayName: "" },
  organizer: { emailAddress: { name: "PM", address: "pm@example.com" } },
  isAllDay: false,
  importance: "normal",
  showAs: "busy",
  isCancelled: false,
  isOnlineMeeting: false,
  type: "occurrence",
  seriesMasterId: "evt-rec-master",
};

// ---------------------------------------------------------------------------
// Handlers
//
// Routing precedence (MSW matches first handler):
// - Specific paths before generic (more path segments first)
// - /me/calendars/:cid/events/:eid  (pathParts=6)
// - /me/calendars/:cid/events       (pathParts=5)
// - /me/calendars/:cid/calendarView (pathParts=5)
// - /me/events/:eid                 (pathParts=4)
// - /me/events                      (pathParts=3)
// - /me/calendars                   (pathParts=3)
// - /me/calendarView                (pathParts=3)
// - /users/:uid/* variants follow same pattern
// ---------------------------------------------------------------------------

export const calendarHandlers = [
  // ---- mailboxSettings (for timezone) ----
  http.get(`${GRAPH_BASE}/me/mailboxSettings`, () => {
    return HttpResponse.json({ timeZone: "Europe/Berlin" });
  }),

  // ---- list_calendars ----

  // GET /me/calendars → 3 calendars
  http.get(`${GRAPH_BASE}/me/calendars`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // Only match /v1.0/me/calendars (pathParts=3), not /me/calendars/:id
    if (pathParts.length !== 3) return;

    return HttpResponse.json({
      value: [defaultCalendar, projectCalendar, sharedCalendar],
    });
  }),

  // GET /users/:userId/calendars → 1 calendar (multi-tenant)
  http.get(`${GRAPH_BASE}/users/:userId/calendars`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/users/:uid/calendars = pathParts=4
    if (pathParts.length !== 4) return;

    return HttpResponse.json({
      value: [
        {
          ...defaultCalendar,
          id: "cal-mt-default",
          owner: { name: "MT User", address: "mt@tenant.com" },
        },
      ],
    });
  }),

  // ---- list_events ----

  // GET /me/events → 3 events
  http.get(`${GRAPH_BASE}/me/events`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/me/events = pathParts=3
    if (pathParts.length !== 3) return;

    return HttpResponse.json({
      value: [normalEvent, allDayEvent, cancelledEvent],
    });
  }),

  // GET /me/events/:eventId → single event detail
  http.get(`${GRAPH_BASE}/me/events/:eventId`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/me/events/:id = pathParts=4
    if (pathParts.length !== 4) return;

    const { eventId } = params;

    if (eventId === "nonexistent") {
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

    return HttpResponse.json(detailEvent);
  }),

  // GET /me/calendars/:calendarId/events → calendar-specific events
  http.get(`${GRAPH_BASE}/me/calendars/:calendarId/events`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/me/calendars/:cid/events = pathParts=5
    if (pathParts.length !== 5) return;

    if (params.calendarId === "nonexistent-cal") {
      return HttpResponse.json(
        {
          error: {
            code: "ErrorItemNotFound",
            message: "The specified calendar was not found.",
          },
        },
        { status: 404 },
      );
    }

    return HttpResponse.json({
      value: [projectEvent, normalEvent],
    });
  }),

  // GET /me/calendars/:calendarId/events/:eventId → calendar-specific single event
  http.get(`${GRAPH_BASE}/me/calendars/:calendarId/events/:eventId`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/me/calendars/:cid/events/:eid = pathParts=6
    if (pathParts.length !== 6) return;

    return HttpResponse.json({
      ...detailEvent,
      id: "evt-cal-specific",
      subject: "Calendar-Specific Event",
    });
  }),

  // GET /users/:userId/events → multi-tenant events
  http.get(`${GRAPH_BASE}/users/:userId/events`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/users/:uid/events = pathParts=4, but also matches /users/:uid/events/:eid
    // Check that it doesn't have an extra segment
    if (pathParts.length !== 4) return;

    return HttpResponse.json({
      value: [{ ...normalEvent, id: "evt-mt-001", subject: "Multi-tenant Meeting" }],
    });
  }),

  // GET /users/:userId/events/:eventId → multi-tenant single event
  http.get(`${GRAPH_BASE}/users/:userId/events/:eventId`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/users/:uid/events/:eid = pathParts=5
    if (pathParts.length !== 5) return;

    return HttpResponse.json({
      ...detailEvent,
      id: `mt-${String(params.eventId)}`,
    });
  }),

  // ---- get_calendar_view ----

  // GET /me/calendarView → 3 events (including recurring occurrence)
  http.get(`${GRAPH_BASE}/me/calendarView`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/me/calendarView = pathParts=3
    if (pathParts.length !== 3) return;

    const startDateTime = url.searchParams.get("startDateTime");
    const endDateTime = url.searchParams.get("endDateTime");

    if (!startDateTime || !endDateTime) {
      return HttpResponse.json(
        {
          error: {
            code: "ErrorInvalidParameter",
            message: "startDateTime and endDateTime are required for calendarView.",
          },
        },
        { status: 400 },
      );
    }

    return HttpResponse.json({
      value: [recurringOccurrence, normalEvent, allDayEvent],
    });
  }),

  // GET /me/calendars/:calendarId/calendarView → calendar-specific view
  http.get(`${GRAPH_BASE}/me/calendars/:calendarId/calendarView`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/me/calendars/:cid/calendarView = pathParts=5
    if (pathParts.length !== 5) return;

    return HttpResponse.json({
      value: [projectEvent],
    });
  }),

  // GET /users/:userId/calendarView → multi-tenant
  http.get(`${GRAPH_BASE}/users/:userId/calendarView`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/users/:uid/calendarView = pathParts=4
    if (pathParts.length !== 4) return;

    const startDateTime = url.searchParams.get("startDateTime");
    if (!startDateTime) {
      return HttpResponse.json(
        { error: { code: "ErrorInvalidParameter", message: "startDateTime required." } },
        { status: 400 },
      );
    }

    return HttpResponse.json({
      value: [{ ...normalEvent, id: "evt-mt-view", subject: "MT Calendar View Event" }],
    });
  }),
];
