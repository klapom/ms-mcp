import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const SAMPLE_VTT = `WEBVTT

NOTE Transcript for Sprint Planning Meeting

00:00:15.000 --> 00:00:32.000
<v John Doe>Welcome everyone to the sprint planning meeting.</v>

00:00:32.000 --> 00:01:05.000
<v Jane Smith>Thanks for joining. Let's review the backlog.</v>

00:01:05.000 --> 00:01:42.000
<v John Doe>First item is the authentication feature. We estimated 8 points.</v>

00:01:42.000 --> 00:02:10.000
<v Jane Smith>I think we should break that down into smaller tasks.</v>`;

const transcript1 = {
  id: "transcript-001",
  language: "en-US",
  createdDateTime: "2026-02-13T14:00:00Z",
};

const transcript2 = {
  id: "transcript-002",
  language: "de-DE",
  createdDateTime: "2026-02-13T14:05:00Z",
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const teamsMeetingsHandlers = [
  // ---- list transcripts ----
  http.get(`${GRAPH_BASE}/me/onlineMeetings/:meetingId/transcripts`, ({ params, request }) => {
    const url = new URL(request.url);
    // Don't match sub-paths like /transcripts/:id/content
    const pathAfterTranscripts = url.pathname.split("/transcripts")[1];
    if (pathAfterTranscripts && pathAfterTranscripts !== "" && pathAfterTranscripts !== "/") return;

    if (params.meetingId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "NotFound", message: "Meeting not found" } },
        { status: 404 },
      );
    }

    if (params.meetingId === "no-transcript") {
      return HttpResponse.json({ value: [] });
    }

    if (params.meetingId === "multi-transcript") {
      return HttpResponse.json({ value: [transcript1, transcript2] });
    }

    return HttpResponse.json({ value: [transcript1] });
  }),

  // ---- get transcript content ----
  http.get(
    `${GRAPH_BASE}/me/onlineMeetings/:meetingId/transcripts/:transcriptId/content`,
    ({ params }) => {
      if (params.meetingId === "nonexistent") {
        return HttpResponse.json(
          { error: { code: "NotFound", message: "Meeting not found" } },
          { status: 404 },
        );
      }

      return HttpResponse.text(SAMPLE_VTT);
    },
  ),
];
