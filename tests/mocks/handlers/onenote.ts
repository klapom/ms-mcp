import { http, HttpResponse } from "msw";

const BASE_URL = "https://graph.microsoft.com/v1.0";

export const onenoteHandlers = [
  // GET /me/onenote/notebooks
  http.get(`${BASE_URL}/me/onenote/notebooks`, ({ request }) => {
    const url = new URL(request.url);
    const top = Number.parseInt(url.searchParams.get("$top") || "10", 10);
    const skip = Number.parseInt(url.searchParams.get("$skip") || "0", 10);

    const allNotebooks = [
      {
        id: "notebook-1",
        displayName: "Personal Notes",
        createdDateTime: "2024-01-15T10:00:00Z",
        lastModifiedDateTime: "2024-02-15T14:30:00Z",
        isDefault: true,
      },
      {
        id: "notebook-2",
        displayName: "Work Notes",
        createdDateTime: "2024-01-20T09:00:00Z",
        lastModifiedDateTime: "2024-02-10T16:45:00Z",
        isDefault: false,
      },
      {
        id: "notebook-3",
        displayName: "Meeting Notes",
        createdDateTime: "2024-02-01T11:00:00Z",
        lastModifiedDateTime: "2024-02-14T10:15:00Z",
        isDefault: false,
      },
    ];

    const paginatedNotebooks = allNotebooks.slice(skip, skip + top);
    const hasMore = skip + top < allNotebooks.length;

    return HttpResponse.json({
      value: paginatedNotebooks,
      ...(hasMore && {
        "@odata.nextLink": `${BASE_URL}/me/onenote/notebooks?$top=${top}&$skip=${skip + top}`,
      }),
    });
  }),

  // GET /me/onenote/notebooks/:notebookId/sections
  http.get(`${BASE_URL}/me/onenote/notebooks/:notebookId/sections`, ({ request, params }) => {
    const url = new URL(request.url);
    const top = Number.parseInt(url.searchParams.get("$top") || "10", 10);
    const skip = Number.parseInt(url.searchParams.get("$skip") || "0", 10);
    const { notebookId } = params;

    if (notebookId === "not-found-notebook") {
      return new HttpResponse(null, { status: 404 });
    }

    const allSections = [
      {
        id: "section-1",
        displayName: "Quick Notes",
        createdDateTime: "2024-01-15T10:30:00Z",
        lastModifiedDateTime: "2024-02-15T15:00:00Z",
      },
      {
        id: "section-2",
        displayName: "Project Ideas",
        createdDateTime: "2024-01-16T11:00:00Z",
        lastModifiedDateTime: "2024-02-14T13:20:00Z",
      },
    ];

    const paginatedSections = allSections.slice(skip, skip + top);
    const hasMore = skip + top < allSections.length;

    return HttpResponse.json({
      value: paginatedSections,
      ...(hasMore && {
        "@odata.nextLink": `${BASE_URL}/me/onenote/notebooks/${notebookId}/sections?$top=${top}&$skip=${skip + top}`,
      }),
    });
  }),

  // GET /me/onenote/sections/:sectionId/pages
  http.get(`${BASE_URL}/me/onenote/sections/:sectionId/pages`, ({ request, params }) => {
    const url = new URL(request.url);
    const top = Number.parseInt(url.searchParams.get("$top") || "10", 10);
    const skip = Number.parseInt(url.searchParams.get("$skip") || "0", 10);
    const { sectionId } = params;

    if (sectionId === "not-found-section") {
      return new HttpResponse(null, { status: 404 });
    }

    const allPages = [
      {
        id: "page-1",
        title: "Meeting Notes 2024-02-15",
        createdDateTime: "2024-02-15T09:00:00Z",
        lastModifiedDateTime: "2024-02-15T16:30:00Z",
        contentUrl: `${BASE_URL}/me/onenote/pages/page-1/content`,
      },
      {
        id: "page-2",
        title: "Project Brainstorming",
        createdDateTime: "2024-02-14T10:00:00Z",
        lastModifiedDateTime: "2024-02-14T17:45:00Z",
        contentUrl: `${BASE_URL}/me/onenote/pages/page-2/content`,
      },
      {
        id: "page-3",
        title: "Weekly Review",
        createdDateTime: "2024-02-13T11:00:00Z",
        lastModifiedDateTime: "2024-02-13T14:20:00Z",
        contentUrl: `${BASE_URL}/me/onenote/pages/page-3/content`,
      },
    ];

    const paginatedPages = allPages.slice(skip, skip + top);
    const hasMore = skip + top < allPages.length;

    return HttpResponse.json({
      value: paginatedPages,
      ...(hasMore && {
        "@odata.nextLink": `${BASE_URL}/me/onenote/sections/${sectionId}/pages?$top=${top}&$skip=${skip + top}`,
      }),
    });
  }),

  // GET /me/onenote/pages/:pageId/content
  http.get(`${BASE_URL}/me/onenote/pages/:pageId/content`, ({ params }) => {
    const { pageId } = params;

    if (pageId === "not-found-page") {
      return new HttpResponse(null, { status: 404 });
    }

    const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <title>Meeting Notes 2024-02-15</title>
  </head>
  <body>
    <h1>Meeting Notes</h1>
    <p>Attendees: Alice, Bob, Carol</p>
    <h2>Action Items</h2>
    <ul>
      <li>Review Q1 metrics</li>
      <li>Prepare presentation for stakeholders</li>
      <li>Schedule follow-up meeting</li>
    </ul>
    <p>Next meeting: February 22, 2024</p>
  </body>
</html>`;

    return new HttpResponse(htmlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    });
  }),

  // POST /me/onenote/sections/:sectionId/pages
  http.post(`${BASE_URL}/me/onenote/sections/:sectionId/pages`, async ({ request, params }) => {
    const { sectionId } = params;

    if (sectionId === "not-found-section") {
      return new HttpResponse(null, { status: 404 });
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("text/html")) {
      return HttpResponse.json(
        {
          error: {
            code: "InvalidRequest",
            message: "Content-Type must be text/html for OneNote page creation",
          },
        },
        { status: 400 },
      );
    }

    const htmlContent = await request.text();

    // Extract title from HTML (simple regex for test purposes)
    const titleMatch = /<title>(.*?)<\/title>/i.exec(htmlContent);
    const title = titleMatch ? titleMatch[1] : "Untitled";

    const newPage = {
      id: "new-page-123",
      title: title,
      createdDateTime: new Date().toISOString(),
      lastModifiedDateTime: new Date().toISOString(),
      contentUrl: `${BASE_URL}/me/onenote/pages/new-page-123/content`,
    };

    return HttpResponse.json(newPage, { status: 201 });
  }),

  // GET /me/onenote/pages?$search={query}
  http.get(`${BASE_URL}/me/onenote/pages`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("$search");
    const top = Number.parseInt(url.searchParams.get("$top") || "10", 10);
    const skip = Number.parseInt(url.searchParams.get("$skip") || "0", 10);

    if (!search) {
      return HttpResponse.json(
        {
          error: {
            code: "InvalidRequest",
            message: "$search parameter is required",
          },
        },
        { status: 400 },
      );
    }

    const allPages = [
      {
        id: "search-page-1",
        title: "Meeting Notes with action items",
        createdDateTime: "2024-02-15T09:00:00Z",
        lastModifiedDateTime: "2024-02-15T16:30:00Z",
        contentUrl: `${BASE_URL}/me/onenote/pages/search-page-1/content`,
      },
      {
        id: "search-page-2",
        title: "Project meeting summary",
        createdDateTime: "2024-02-14T10:00:00Z",
        lastModifiedDateTime: "2024-02-14T17:45:00Z",
        contentUrl: `${BASE_URL}/me/onenote/pages/search-page-2/content`,
      },
    ];

    const paginatedPages = allPages.slice(skip, skip + top);
    const hasMore = skip + top < allPages.length;

    return HttpResponse.json({
      value: paginatedPages,
      ...(hasMore && {
        "@odata.nextLink": `${BASE_URL}/me/onenote/pages?$search=${encodeURIComponent(search)}&$top=${top}&$skip=${skip + top}`,
      }),
    });
  }),
];
