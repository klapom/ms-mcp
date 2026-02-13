import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const rooms = [
  {
    id: "room-001",
    displayName: "Conference Room A",
    emailAddress: "confrooma@example.com",
    capacity: 12,
    building: "Building 1",
    floorNumber: 3,
    audioDeviceName: "Phone",
    videoDeviceName: "Projector",
    displayDeviceName: "",
  },
  {
    id: "room-002",
    displayName: "Meeting Room B",
    emailAddress: "meetingroomb@example.com",
    capacity: 6,
    building: "Building 1",
    floorNumber: 2,
    audioDeviceName: "Phone",
    videoDeviceName: "",
    displayDeviceName: "Whiteboard",
  },
  {
    id: "room-003",
    displayName: "Large Hall C",
    emailAddress: "largehallc@example.com",
    capacity: 50,
    building: "Building 2",
    floorNumber: 1,
    audioDeviceName: "Phone",
    videoDeviceName: "Projector",
    displayDeviceName: "Whiteboard",
  },
];

const calendarPermission = {
  id: "perm-001",
  emailAddress: { address: "john@example.com", name: "John Doe" },
  role: "read",
  isInsideOrganization: true,
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const calendarRoomHandlers = [
  // GET /places/microsoft.graph.room → list rooms
  http.get(`${GRAPH_BASE}/places/microsoft.graph.room`, ({ request }) => {
    const url = new URL(request.url);

    // Check for permission error simulation
    if (url.searchParams.get("$filter") === "forbidden") {
      return HttpResponse.json(
        { error: { code: "Authorization_RequestDenied", message: "Insufficient privileges." } },
        { status: 403 },
      );
    }

    return HttpResponse.json({
      value: rooms,
      "@odata.count": rooms.length,
    });
  }),

  // POST /me/calendar/calendarPermissions → share calendar
  http.post(`${GRAPH_BASE}/me/calendar/calendarPermissions`, async ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) return;

    const body = (await request.json()) as Record<string, unknown>;
    const emailAddress = body.emailAddress as Record<string, unknown> | undefined;
    const address = emailAddress?.address ?? "unknown@example.com";
    const role = typeof body.role === "string" ? body.role : "read";

    if (address === "invalid@") {
      return HttpResponse.json(
        { error: { code: "ErrorInvalidRequest", message: "Invalid email address." } },
        { status: 400 },
      );
    }

    return HttpResponse.json(
      {
        ...calendarPermission,
        emailAddress: { address, name: String(address) },
        role,
      },
      { status: 201 },
    );
  }),

  // POST /users/:uid/calendar/calendarPermissions → share calendar (multi-tenant)
  http.post(`${GRAPH_BASE}/users/:uid/calendar/calendarPermissions`, async ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) return;

    const body = (await request.json()) as Record<string, unknown>;
    const role = typeof body.role === "string" ? body.role : "read";

    return HttpResponse.json({ ...calendarPermission, role }, { status: 201 });
  }),
];
