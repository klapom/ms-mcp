import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const list1 = {
  id: "list-001",
  displayName: "Tasks",
  description: "Team tasks",
  webUrl: "https://contoso.sharepoint.com/sites/eng/Lists/Tasks",
  list: { hidden: false },
};

const list2 = {
  id: "list-002",
  displayName: "Hidden List",
  description: null,
  webUrl: "https://contoso.sharepoint.com/sites/eng/Lists/Hidden",
  list: { hidden: true },
};

const listItem1 = {
  id: "item-001",
  fields: {
    Title: "Task 1",
    Status: "Active",
    Priority: "High",
  },
};

const listItem2 = {
  id: "item-002",
  fields: {
    Title: "Task 2",
    Status: "Completed",
    Priority: "Low",
  },
};

export const sharepointListHandlers = [
  // ---- create_list_item ----
  http.post(`${GRAPH_BASE}/sites/:siteId/lists/:listId/items`, ({ params }) => {
    if (params.listId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "itemNotFound", message: "List not found" } },
        { status: 404 },
      );
    }
    return HttpResponse.json({ id: "new-item-001" }, { status: 201 });
  }),

  // ---- delete_list_item ----
  http.delete(`${GRAPH_BASE}/sites/:siteId/lists/:listId/items/:itemId`, ({ params }) => {
    if (params.itemId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "itemNotFound", message: "Item not found" } },
        { status: 404 },
      );
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- update_list_item fields ----
  http.patch(`${GRAPH_BASE}/sites/:siteId/lists/:listId/items/:itemId/fields`, ({ params }) => {
    if (params.itemId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "itemNotFound", message: "Item not found" } },
        { status: 404 },
      );
    }
    return HttpResponse.json({ Title: "Updated", Status: "Done" });
  }),

  // ---- list_site_lists ----
  http.get(`${GRAPH_BASE}/sites/:siteId/lists`, ({ params, request }) => {
    const url = new URL(request.url);
    // Don't match /lists/:listId/items
    const pathAfterLists = url.pathname.split("/lists")[1];
    if (pathAfterLists && pathAfterLists !== "" && pathAfterLists !== "/") return;

    if (params.siteId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "itemNotFound", message: "Site not found" } },
        { status: 404 },
      );
    }
    // Always return all lists; tool filters hidden ones client-side
    return HttpResponse.json({ value: [list1, list2] });
  }),

  // ---- list_list_items ----
  http.get(`${GRAPH_BASE}/sites/:siteId/lists/:listId/items`, ({ params }) => {
    if (params.listId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "itemNotFound", message: "List not found" } },
        { status: 404 },
      );
    }
    return HttpResponse.json({ value: [listItem1, listItem2] });
  }),
];
