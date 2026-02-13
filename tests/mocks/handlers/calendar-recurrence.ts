import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const recurringEvent = {
  id: "evt-recurring-001",
  subject: "Sprint Planning",
  start: { dateTime: "2026-02-15T10:00:00.0000000", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-02-15T11:00:00.0000000", timeZone: "Europe/Berlin" },
  location: { displayName: "Conf Room A" },
  organizer: { emailAddress: { name: "Test User", address: "test@example.com" } },
  isAllDay: false,
  importance: "normal",
  showAs: "busy",
  isOnlineMeeting: false,
  recurrence: {
    pattern: {
      type: "weekly",
      interval: 2,
      daysOfWeek: ["tuesday", "thursday"],
      firstDayOfWeek: "monday",
    },
    range: { type: "numbered", startDate: "2026-02-15", numberOfOccurrences: 10 },
  },
};

const instancesList = {
  value: [
    {
      id: "inst-001",
      subject: "Sprint Planning",
      start: { dateTime: "2026-02-15T10:00:00.0000000", timeZone: "Europe/Berlin" },
      end: { dateTime: "2026-02-15T11:00:00.0000000", timeZone: "Europe/Berlin" },
      location: { displayName: "Conf Room A" },
      isCancelled: false,
      type: "occurrence",
    },
    {
      id: "inst-002",
      subject: "Sprint Planning",
      start: { dateTime: "2026-02-17T10:00:00.0000000", timeZone: "Europe/Berlin" },
      end: { dateTime: "2026-02-17T11:00:00.0000000", timeZone: "Europe/Berlin" },
      location: { displayName: "Conf Room A" },
      isCancelled: false,
      type: "occurrence",
    },
    {
      id: "inst-003",
      subject: "Sprint Planning (Special)",
      start: { dateTime: "2026-03-01T10:00:00.0000000", timeZone: "Europe/Berlin" },
      end: { dateTime: "2026-03-01T11:30:00.0000000", timeZone: "Europe/Berlin" },
      location: { displayName: "Large Room" },
      isCancelled: false,
      type: "exception",
    },
    {
      id: "inst-004",
      subject: "Sprint Planning",
      start: { dateTime: "2026-03-03T10:00:00.0000000", timeZone: "Europe/Berlin" },
      end: { dateTime: "2026-03-03T11:00:00.0000000", timeZone: "Europe/Berlin" },
      location: { displayName: "Conf Room A" },
      isCancelled: true,
      type: "occurrence",
    },
  ],
  "@odata.count": 4,
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const calendarRecurrenceHandlers = [
  // GET /me/events/:id/instances → list instances
  // Must be before generic GET /me/events/:id handlers
  http.get(`${GRAPH_BASE}/me/events/:eventId/instances`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) return;

    if (params.eventId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "ErrorItemNotFound", message: "Event not found." } },
        { status: 404 },
      );
    }

    // Filter by date range if provided
    const startDateTime = url.searchParams.get("startDateTime");
    const endDateTime = url.searchParams.get("endDateTime");
    let filteredInstances = [...instancesList.value];

    if (startDateTime) {
      filteredInstances = filteredInstances.filter((inst) => inst.start.dateTime >= startDateTime);
    }
    if (endDateTime) {
      filteredInstances = filteredInstances.filter((inst) => inst.end.dateTime <= endDateTime);
    }

    return HttpResponse.json({
      value: filteredInstances,
      "@odata.count": filteredInstances.length,
    });
  }),
  // GET/PATCH /me/events/:eventId are handled by existing calendar.ts and calendar-write.ts handlers
];
