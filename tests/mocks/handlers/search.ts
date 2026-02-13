import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function makeSearchHitsContainer(entityType: string, queryString: string) {
  if (entityType === "message") {
    return {
      hits: [
        {
          hitId: "msg-001",
          rank: 1,
          summary: `Match for "${queryString}"`,
          resource: {
            "@odata.type": "#microsoft.graph.message",
            id: "msg-001",
            subject: "Quarterly Report Q1",
            from: { emailAddress: { name: "John Doe", address: "john@example.com" } },
            receivedDateTime: "2026-02-10T09:00:00Z",
            bodyPreview: "Here is the quarterly report...",
          },
        },
        {
          hitId: "msg-002",
          rank: 2,
          summary: "Second match",
          resource: {
            "@odata.type": "#microsoft.graph.message",
            id: "msg-002",
            subject: "Budget Update",
            from: { emailAddress: { name: "Jane Smith", address: "jane@example.com" } },
            receivedDateTime: "2026-02-09T14:30:00Z",
            bodyPreview: "Budget details attached",
          },
        },
      ],
      total: 2,
      moreResultsAvailable: false,
    };
  }

  if (entityType === "event") {
    return {
      hits: [
        {
          hitId: "evt-001",
          rank: 1,
          resource: {
            "@odata.type": "#microsoft.graph.event",
            id: "evt-001",
            subject: "Sprint Planning",
            location: { displayName: "Conference Room A" },
            start: { dateTime: "2026-02-15T10:00:00", timeZone: "UTC" },
            end: { dateTime: "2026-02-15T11:00:00", timeZone: "UTC" },
          },
        },
      ],
      total: 1,
      moreResultsAvailable: false,
    };
  }

  if (entityType === "person") {
    return {
      hits: [
        {
          hitId: "person-001",
          rank: 1,
          resource: {
            "@odata.type": "#microsoft.graph.person",
            displayName: "John Developer",
            scoredEmailAddresses: [{ address: "john@example.com" }],
            companyName: "Pommer IT",
            jobTitle: "Senior Engineer",
          },
        },
      ],
      total: 1,
      moreResultsAvailable: false,
    };
  }

  if (entityType === "chatMessage") {
    return {
      hits: [
        {
          hitId: "chat-001",
          rank: 1,
          summary: "budget discussion",
          resource: {
            "@odata.type": "#microsoft.graph.chatMessage",
            id: "chat-001",
            from: { user: { displayName: "Admin User" } },
            bodyPreview: "Let's discuss the budget",
            createdDateTime: "2026-02-10T15:00:00Z",
            chatId: "chat-abc-123",
          },
        },
      ],
      total: 1,
      moreResultsAvailable: false,
    };
  }

  if (entityType === "driveItem") {
    return {
      hits: [
        {
          hitId: "file-001",
          rank: 1,
          resource: {
            "@odata.type": "#microsoft.graph.driveItem",
            id: "file-001",
            name: "Budget-2026.xlsx",
            size: 45000,
            lastModifiedDateTime: "2026-02-08T12:00:00Z",
          },
        },
      ],
      total: 1,
      moreResultsAvailable: false,
    };
  }

  return { hits: [], total: 0, moreResultsAvailable: false };
}

export const searchHandlers = [
  // POST /search/query
  http.post(`${GRAPH_BASE}/search/query`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const requests = body.requests as Array<Record<string, unknown>>;

    if (!Array.isArray(requests) || requests.length === 0) {
      return HttpResponse.json(
        { error: { code: "BadRequest", message: "Invalid search request" } },
        { status: 400 },
      );
    }

    const results = requests.map((req) => {
      const entityTypes = req.entityTypes as string[];
      const query = req.query as Record<string, unknown>;
      const queryString = String(query?.queryString ?? "");

      // Simulate error for specific test queries
      if (queryString === "INVALID_KQL_SYNTAX!!!") {
        return null; // Will trigger 400 below
      }

      const entityType = entityTypes[0];
      return makeSearchHitsContainer(entityType, queryString);
    });

    // If any request produced null, return 400
    if (results.includes(null)) {
      return HttpResponse.json(
        { error: { code: "BadRequest", message: "Invalid KQL query syntax" } },
        { status: 400 },
      );
    }

    return HttpResponse.json({ value: results });
  }),

  // GET /me/drive/root/delta (initial sync)
  http.get(`${GRAPH_BASE}/me/drive/root/delta`, ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (token === "expired-token") {
      return HttpResponse.json(
        { error: { code: "resyncRequired", message: "Delta token expired" } },
        { status: 410 },
      );
    }

    if (token) {
      // Incremental sync: return changes only
      return HttpResponse.json({
        value: [
          {
            id: "delta-new-001",
            name: "new-document.docx",
            size: 12345,
            lastModifiedDateTime: "2026-02-12T10:00:00Z",
          },
          {
            id: "delta-del-001",
            name: "removed-file.txt",
            deleted: { state: "deleted" },
          },
        ],
        "@odata.deltaLink": `${GRAPH_BASE}/me/drive/root/delta?token=new-delta-token-456`,
      });
    }

    // Initial sync: return all items
    return HttpResponse.json({
      value: [
        {
          id: "item-001",
          name: "Documents",
          folder: { childCount: 3 },
          lastModifiedDateTime: "2026-02-01T08:00:00Z",
        },
        {
          id: "item-002",
          name: "report.pdf",
          size: 250000,
          lastModifiedDateTime: "2026-02-10T14:00:00Z",
        },
        {
          id: "item-003",
          name: "notes.txt",
          size: 1024,
          lastModifiedDateTime: "2026-02-11T09:30:00Z",
        },
      ],
      "@odata.deltaLink": `${GRAPH_BASE}/me/drive/root/delta?token=initial-delta-token-123`,
    });
  }),

  // GET /me/drive/items/:folderId/delta
  http.get(new RegExp(`${GRAPH_BASE}/me/drive/items/[^/]+/delta`), ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (token) {
      return HttpResponse.json({
        value: [
          {
            id: "folder-delta-001",
            name: "updated-in-folder.docx",
            size: 5000,
            lastModifiedDateTime: "2026-02-12T11:00:00Z",
          },
        ],
        "@odata.deltaLink": `${GRAPH_BASE}/me/drive/items/folder-123/delta?token=folder-token-456`,
      });
    }

    return HttpResponse.json({
      value: [
        {
          id: "folder-item-001",
          name: "file-in-folder.txt",
          size: 2048,
          lastModifiedDateTime: "2026-02-09T16:00:00Z",
        },
      ],
      "@odata.deltaLink": `${GRAPH_BASE}/me/drive/items/folder-123/delta?token=folder-token-123`,
    });
  }),
];
