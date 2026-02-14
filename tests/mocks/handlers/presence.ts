/**
 * MSW Handlers for Presence Tools (Sprint 9.4)
 */

import { http, HttpResponse } from "msw";
import type { PathParams } from "msw";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

/**
 * Mock presence data
 */
const mockPresence = {
  id: "user1@example.com",
  availability: "Available",
  activity: "Available",
  statusMessage: {
    message: {
      content: "Working from home",
      contentType: "text",
    },
    expiresAt: "2026-02-20T17:00:00Z",
  },
};

const mockPresenceNoStatus = {
  id: "user2@example.com",
  availability: "Busy",
  activity: "InACall",
};

/**
 * MSW Handlers for Presence endpoints
 */
export const presenceHandlers = [
  // GET /me/presence
  http.get(`${GRAPH_BASE_URL}/me/presence`, () => {
    return HttpResponse.json(mockPresence);
  }),

  // GET /users/:userId/presence
  http.get<PathParams<"userId">>(`${GRAPH_BASE_URL}/users/:userId/presence`, ({ params }) => {
    const { userId } = params;

    if (userId === "notfound@example.com") {
      return HttpResponse.json(
        {
          error: {
            code: "ResourceNotFound",
            message: "User not found",
          },
        },
        { status: 404 },
      );
    }

    if (userId === "user2@example.com") {
      return HttpResponse.json(mockPresenceNoStatus);
    }

    return HttpResponse.json(mockPresence);
  }),

  // POST /me/presence/setStatusMessage
  http.post(`${GRAPH_BASE_URL}/me/presence/setStatusMessage`, async () => {
    // Graph API returns 200 with null body for setStatusMessage
    return HttpResponse.json(null, { status: 200 });
  }),
];
