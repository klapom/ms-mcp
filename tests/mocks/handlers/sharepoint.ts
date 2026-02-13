import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const site1 = {
  id: "site-001",
  displayName: "Engineering Site",
  description: "Engineering team site",
  webUrl: "https://contoso.sharepoint.com/sites/engineering",
  createdDateTime: "2025-01-01T00:00:00Z",
  lastModifiedDateTime: "2026-02-13T00:00:00Z",
};

const site2 = {
  id: "site-002",
  displayName: "Marketing Site",
  description: null,
  webUrl: "https://contoso.sharepoint.com/sites/marketing",
  createdDateTime: "2025-06-01T00:00:00Z",
  lastModifiedDateTime: "2026-02-12T00:00:00Z",
};

const drive1 = {
  id: "drive-001",
  name: "Documents",
  driveType: "documentLibrary",
  webUrl: "https://contoso.sharepoint.com/sites/engineering/Documents",
};

const drive2 = {
  id: "drive-002",
  name: "Shared Documents",
  driveType: "documentLibrary",
  webUrl: "https://contoso.sharepoint.com/sites/engineering/Shared Documents",
};

export const sharepointHandlers = [
  // ---- search_sites ----
  http.get(`${GRAPH_BASE}/sites`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("search");
    // Don't match /sites/:id or /sites/:host:
    const pathAfterSites = url.pathname.replace(/^\/v1\.0\/sites/, "");
    if (pathAfterSites && pathAfterSites !== "" && pathAfterSites !== "/") return;

    if (!search) {
      return HttpResponse.json({ value: [] });
    }
    if (search === "nonexistent") {
      return HttpResponse.json({ value: [] });
    }
    return HttpResponse.json({ value: [site1, site2] });
  }),

  // ---- get_site by ID ----
  http.get(`${GRAPH_BASE}/sites/:siteId`, ({ params, request }) => {
    const url = new URL(request.url);
    // Don't match /sites/:id/drives or /sites/:id/lists
    const pathAfterSiteId = url.pathname.split(`/sites/${String(params.siteId)}`)[1];
    if (pathAfterSiteId && pathAfterSiteId !== "" && pathAfterSiteId !== "/") return;

    const siteId = String(params.siteId);
    if (siteId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "itemNotFound", message: "Site not found" } },
        { status: 404 },
      );
    }
    return HttpResponse.json(site1);
  }),

  // ---- list_site_drives ----
  http.get(`${GRAPH_BASE}/sites/:siteId/drives`, ({ params }) => {
    if (params.siteId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "itemNotFound", message: "Site not found" } },
        { status: 404 },
      );
    }
    return HttpResponse.json({ value: [drive1, drive2] });
  }),
];
