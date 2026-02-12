import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const fileItem = {
  id: "file-001",
  name: "report.pdf",
  size: 1048576,
  lastModifiedDateTime: "2026-02-10T14:30:00Z",
  webUrl: "https://onedrive.example.com/report.pdf",
  file: { mimeType: "application/pdf" },
  folder: undefined,
};

const textFileItem = {
  id: "file-002",
  name: "notes.txt",
  size: 256,
  lastModifiedDateTime: "2026-02-11T09:00:00Z",
  webUrl: "https://onedrive.example.com/notes.txt",
  file: { mimeType: "text/plain" },
  folder: undefined,
};

const folderItem = {
  id: "folder-001",
  name: "Documents",
  size: 0,
  lastModifiedDateTime: "2026-02-09T08:00:00Z",
  webUrl: "https://onedrive.example.com/Documents",
  file: undefined,
  folder: { childCount: 5 },
};

const largeFileItem = {
  id: "file-large",
  name: "bigvideo.mp4",
  size: 15 * 1024 * 1024,
  lastModifiedDateTime: "2026-02-08T12:00:00Z",
  webUrl: "https://onedrive.example.com/bigvideo.mp4",
  file: { mimeType: "video/mp4" },
  folder: undefined,
};

const detailItem = {
  id: "file-001",
  name: "report.pdf",
  size: 1048576,
  lastModifiedDateTime: "2026-02-10T14:30:00Z",
  createdDateTime: "2026-02-01T10:00:00Z",
  webUrl: "https://onedrive.example.com/report.pdf",
  file: { mimeType: "application/pdf" },
  folder: undefined,
  parentReference: { path: "/drive/root:/Documents" },
  lastModifiedBy: { user: { displayName: "Alice" } },
  createdBy: { user: { displayName: "Bob" } },
  shared: undefined,
  description: "Monthly report",
};

const sharedItem = {
  ...detailItem,
  id: "file-shared",
  shared: { scope: "organization" },
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const driveHandlers = [
  // ---- list_files: root children ----
  http.get(`${GRAPH_BASE}/me/drive/root/children`, () => {
    return HttpResponse.json({
      value: [fileItem, textFileItem, folderItem],
    });
  }),

  // ---- list_files: folder by ID children ----
  http.get(`${GRAPH_BASE}/me/drive/items/:itemId/children`, ({ params }) => {
    if (params.itemId === "nonexistent-folder") {
      return HttpResponse.json(
        { error: { code: "itemNotFound", message: "Item not found" } },
        { status: 404 },
      );
    }
    return HttpResponse.json({
      value: [textFileItem],
    });
  }),

  // ---- search_files + path-based children ----
  // These URLs contain special characters (parentheses, colons) that MSW
  // can't match with route patterns. We use an unhandled request interceptor
  // pattern: a broad GET handler that checks pathname and returns undefined
  // for non-matching paths. MUST be placed AFTER all specific drive handlers
  // to avoid intercepting them.
  // NOTE: Using http.get with a callback URL resolver
  http.get(/\/v1\.0\/me\/drive\/root[\/:].+/, ({ request }) => {
    const url = new URL(request.url);
    const path = url.pathname;

    // search: /me/drive/root/search(q='...')
    if (path.includes("/search(")) {
      return HttpResponse.json({ value: [fileItem, textFileItem] });
    }

    // path-based children: /me/drive/root:/path:/children
    if (path.includes(":/children")) {
      return HttpResponse.json({ value: [fileItem] });
    }

    return undefined;
  }),

  // ---- get_recent_files ----
  http.get(`${GRAPH_BASE}/me/drive/recent`, () => {
    return HttpResponse.json({
      value: [fileItem, textFileItem],
    });
  }),

  // ---- download_file: content endpoint ----
  http.get(`${GRAPH_BASE}/me/drive/items/:itemId/content`, ({ params }) => {
    const itemId = String(params.itemId);
    if (itemId === "file-002") {
      return new HttpResponse(Buffer.from("Hello, world!"), {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new HttpResponse(Buffer.from([0x25, 0x50, 0x44, 0x46]), {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });
  }),

  // ---- get_file_metadata / download_file: item by ID ----
  http.get(`${GRAPH_BASE}/me/drive/items/:itemId`, ({ params, request }) => {
    const url = new URL(request.url);
    // Don't match /content or /children sub-paths
    if (url.pathname.includes("/content") || url.pathname.includes("/children")) return;

    const itemId = String(params.itemId);
    if (itemId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "itemNotFound", message: "Item not found" } },
        { status: 404 },
      );
    }
    if (itemId === "file-large") {
      return HttpResponse.json(largeFileItem);
    }
    if (itemId === "folder-001") {
      return HttpResponse.json({
        ...folderItem,
        ...detailItem,
        id: "folder-001",
        name: "Documents",
        folder: { childCount: 5 },
        file: undefined,
      });
    }
    if (itemId === "file-shared") {
      return HttpResponse.json(sharedItem);
    }
    if (itemId === "file-002") {
      return HttpResponse.json({
        ...detailItem,
        id: "file-002",
        name: "notes.txt",
        size: 256,
        file: { mimeType: "text/plain" },
      });
    }
    return HttpResponse.json(detailItem);
  }),

  // ---- multi-tenant: /users/:uid/drive/root/children ----
  http.get(`${GRAPH_BASE}/users/:userId/drive/root/children`, () => {
    return HttpResponse.json({
      value: [{ ...fileItem, id: "file-mt-001", name: "mt-report.pdf" }],
    });
  }),

  // ---- multi-tenant: /users/:uid/drive/recent ----
  http.get(`${GRAPH_BASE}/users/:userId/drive/recent`, () => {
    return HttpResponse.json({
      value: [{ ...fileItem, id: "file-mt-recent", name: "mt-recent.pdf" }],
    });
  }),
];
