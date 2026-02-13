import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const uploadSession = {
  uploadUrl: "https://graph.microsoft.com/upload-session-abc123",
  expirationDateTime: "2026-02-14T12:00:00Z",
};

const uploadedLargeFile = {
  id: "file-large-001",
  name: "video.mp4",
  size: 10485760, // 10 MB
  webUrl: "https://onedrive.example.com/video.mp4",
  file: { mimeType: "video/mp4" },
};

const copiedFile = {
  id: "file-copy-001",
  name: "report-copy.pdf",
  size: 2048,
  webUrl: "https://onedrive.example.com/archive/report-copy.pdf",
};

// ---------------------------------------------------------------------------
// Helper functions to reduce complexity
// ---------------------------------------------------------------------------

function handleItemAttachment(body: Record<string, unknown>) {
  const item = (body.item ?? {}) as Record<string, unknown>;
  const itemOdataType = String(item["@odata.type"] ?? "");

  // Validate item type
  if (
    !itemOdataType.includes("message") &&
    !itemOdataType.includes("event") &&
    !itemOdataType.includes("contact")
  ) {
    return HttpResponse.json(
      {
        error: {
          code: "invalidRequest",
          message: "Invalid item type for itemAttachment",
        },
      },
      { status: 400 },
    );
  }

  const attachmentName = String(body.name ?? "Embedded Item");
  return HttpResponse.json(
    {
      "@odata.type": "#microsoft.graph.itemAttachment",
      id: "attachment-item-001",
      name: attachmentName,
      size: 5120,
      isInline: false,
    },
    { status: 201 },
  );
}

function handleReferenceAttachment(body: Record<string, unknown>) {
  const attachmentName = String(body.name ?? "Shared File");
  const sourceUrl = String(body.sourceUrl ?? "");

  if (!sourceUrl) {
    return HttpResponse.json(
      {
        error: {
          code: "invalidRequest",
          message: "sourceUrl is required for referenceAttachment",
        },
      },
      { status: 400 },
    );
  }

  return HttpResponse.json(
    {
      "@odata.type": "#microsoft.graph.referenceAttachment",
      id: "attachment-ref-001",
      name: attachmentName,
      sourceUrl,
      permission: body.permission ?? "view",
      providerType: body.providerType ?? "oneDriveConsumer",
    },
    { status: 201 },
  );
}

function handleFileAttachment(body: Record<string, unknown>) {
  return HttpResponse.json(
    {
      "@odata.type": "#microsoft.graph.fileAttachment",
      id: "attachment-file-001",
      name: String(body.name ?? "file.txt"),
      size: 1024,
      contentType: "application/octet-stream",
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const uploadSessionHandlers = [
  // ---- upload_large_file: POST /me/drive/root:/{fileName}:/createUploadSession ----
  http.post(/\/v1\.0\/me\/drive\/root:.+:\/createUploadSession/, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const item = (body.item ?? {}) as Record<string, unknown>;
    const conflictBehavior = String(item["@microsoft.graph.conflictBehavior"] ?? "fail");

    // Simulate conflict error for "fail" behavior with specific filename
    const url = new URL(request.url);
    if (url.pathname.includes("existing-file.pdf") && conflictBehavior === "fail") {
      return HttpResponse.json(
        {
          error: {
            code: "nameAlreadyExists",
            message: "An item with the same name already exists.",
          },
        },
        { status: 409 },
      );
    }

    return HttpResponse.json(uploadSession, { status: 200 });
  }),

  // ---- upload_large_file: POST /me/drive/items/:folderId:/{fileName}:/createUploadSession ----
  http.post(/\/v1\.0\/me\/drive\/items\/[^/]+:.+:\/createUploadSession/, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const item = (body.item ?? {}) as Record<string, unknown>;
    const conflictBehavior = String(item["@microsoft.graph.conflictBehavior"] ?? "fail");

    // Simulate conflict
    const url = new URL(request.url);
    if (url.pathname.includes("existing-file.pdf") && conflictBehavior === "fail") {
      return HttpResponse.json(
        {
          error: {
            code: "nameAlreadyExists",
            message: "An item with the same name already exists.",
          },
        },
        { status: 409 },
      );
    }

    return HttpResponse.json(uploadSession, { status: 200 });
  }),

  // ---- upload_large_file: PUT {uploadUrl} (chunk upload) ----
  // This handler intercepts direct PUT to the upload session URL
  http.put("https://graph.microsoft.com/upload-session-abc123", async ({ request }) => {
    const contentRange = request.headers.get("Content-Range");

    if (!contentRange) {
      return HttpResponse.json(
        { error: { code: "invalidRequest", message: "Content-Range header required" } },
        { status: 400 },
      );
    }

    // Parse Content-Range: bytes 0-5242879/10485760
    const rangeMatch = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/);
    if (!rangeMatch) {
      return HttpResponse.json(
        { error: { code: "invalidRequest", message: "Invalid Content-Range format" } },
        { status: 400 },
      );
    }

    const endByte = Number.parseInt(rangeMatch[2], 10);
    const totalSize = Number.parseInt(rangeMatch[3], 10);

    // Check if this is the final chunk
    if (endByte === totalSize - 1) {
      // Return driveItem on final chunk
      return HttpResponse.json(uploadedLargeFile, { status: 201 });
    }

    // Return intermediate response for non-final chunks
    const nextExpectedStart = endByte + 1;
    return HttpResponse.json(
      {
        expirationDateTime: uploadSession.expirationDateTime,
        nextExpectedRanges: [`${nextExpectedStart}-`],
      },
      { status: 202 },
    );
  }),

  // ---- attach_item: POST /me/messages/:id/attachments (itemAttachment) ----
  http.post(`${GRAPH_BASE}/me/messages/:messageId/attachments`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const odataType = String(body["@odata.type"] ?? "");

    if (odataType === "#microsoft.graph.itemAttachment") {
      return handleItemAttachment(body);
    }

    if (odataType === "#microsoft.graph.referenceAttachment") {
      return handleReferenceAttachment(body);
    }

    // Default: fileAttachment
    return handleFileAttachment(body);
  }),

  // NOTE: attach_item relies on existing GET handlers in mail.ts, calendar.ts, contacts.ts
  // for fetching source items. No duplicate handlers needed here.

  // ---- attach_reference: POST /me/drive/items/:id/createLink (create sharing link) ----
  http.post(`${GRAPH_BASE}/me/drive/items/:fileId/createLink`, async ({ request, params }) => {
    const fileId = String(params.fileId);
    const body = (await request.json()) as Record<string, unknown>;
    const type = String(body.type ?? "view");
    const scope = String(body.scope ?? "organization");

    if (fileId === "not-found") {
      return HttpResponse.json(
        { error: { code: "itemNotFound", message: "File not found" } },
        { status: 404 },
      );
    }

    return HttpResponse.json(
      {
        id: "link-001",
        link: {
          type,
          scope,
          webUrl: `https://onedrive.example.com/share/${fileId}?permission=${type}`,
        },
      },
      { status: 201 },
    );
  }),

  // ---- poll_copy_status: GET {monitorUrl} ----
  // Monitor URL path: /me/drive/items/:id/copy?$monitor
  http.get(`${GRAPH_BASE}/me/drive/items/:itemId/copy`, ({ request }) => {
    const url = new URL(request.url);
    const isMonitor = url.searchParams.has("$monitor");

    if (!isMonitor) {
      // Regular copy request (handled by drive-write.ts)
      return;
    }

    // Simulate different status based on query parameter
    const status = url.searchParams.get("status") ?? "inProgress";
    const percentage = Number.parseInt(url.searchParams.get("percentage") ?? "50", 10);

    if (status === "completed") {
      return HttpResponse.json(
        {
          status: "completed",
          percentageComplete: 100,
          ...copiedFile,
        },
        { status: 200 },
      );
    }

    if (status === "failed") {
      return HttpResponse.json(
        {
          status: "failed",
          percentageComplete: percentage,
          error: {
            code: "copyFailed",
            message: "Copy operation failed due to insufficient storage",
          },
        },
        { status: 200 },
      );
    }

    // In progress
    return HttpResponse.json(
      {
        status: "inProgress",
        percentageComplete: percentage,
      },
      { status: 200 },
    );
  }),
];
