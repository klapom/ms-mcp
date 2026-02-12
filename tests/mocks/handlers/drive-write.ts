import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const uploadedFile = {
  id: "file-uploaded-001",
  name: "report.pdf",
  size: 1024,
  webUrl: "https://onedrive.example.com/report.pdf",
  file: { mimeType: "application/pdf" },
};

const createdFolder = {
  id: "folder-new-001",
  name: "New Folder",
  webUrl: "https://onedrive.example.com/New%20Folder",
  folder: { childCount: 0 },
};

const movedItem = {
  id: "file-001",
  name: "report.pdf",
  webUrl: "https://onedrive.example.com/archive/report.pdf",
};

const sharingLink = {
  id: "link-001",
  link: {
    type: "view",
    scope: "organization",
    webUrl: "https://onedrive.example.com/share/abc123",
  },
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const driveWriteHandlers = [
  // ---- upload_file: PUT /me/drive/root:/path:/content ----
  http.put(/\/v1\.0\/me\/drive\/root:.+:\/content/, () => {
    return HttpResponse.json(uploadedFile, { status: 201 });
  }),

  // ---- create_folder: POST /me/drive/root/children ----
  http.post(`${GRAPH_BASE}/me/drive/root/children`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name ?? "New Folder");

    if (name === "existing-folder") {
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

    return HttpResponse.json({ ...createdFolder, name }, { status: 201 });
  }),

  // ---- create_folder: POST /me/drive/items/:parentId/children ----
  http.post(`${GRAPH_BASE}/me/drive/items/:parentId/children`, async ({ request }) => {
    const url = new URL(request.url);
    // Don't match /copy sub-path
    if (url.pathname.includes("/copy")) return;

    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name ?? "New Folder");
    return HttpResponse.json({ ...createdFolder, name }, { status: 201 });
  }),

  // ---- move_file: PATCH /me/drive/items/:itemId ----
  http.patch(`${GRAPH_BASE}/me/drive/items/:itemId`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name : "report.pdf";
    return HttpResponse.json({ ...movedItem, id: String(params.itemId), name });
  }),

  // ---- copy_file: POST /me/drive/items/:itemId/copy ----
  http.post(`${GRAPH_BASE}/me/drive/items/:itemId/copy`, () => {
    return new HttpResponse(null, {
      status: 202,
      headers: { Location: "https://graph.microsoft.com/v1.0/monitor/copy-operation" },
    });
  }),

  // ---- share_file: POST /me/drive/items/:itemId/createLink ----
  http.post(`${GRAPH_BASE}/me/drive/items/:itemId/createLink`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...sharingLink,
      link: {
        ...sharingLink.link,
        type: String(body.type ?? "view"),
        scope: String(body.scope ?? "organization"),
      },
    });
  }),
];
