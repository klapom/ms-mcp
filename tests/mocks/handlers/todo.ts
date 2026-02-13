import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const sampleList = {
  id: "list-001",
  displayName: "My Tasks",
  wellknownListName: "defaultList",
  isOwner: true,
  isShared: false,
};

const sampleList2 = {
  id: "list-002",
  displayName: "Work Projects",
  wellknownListName: "none",
  isOwner: true,
  isShared: true,
};

const sampleTask = {
  id: "task-001",
  title: "Review PR",
  status: "notStarted",
  importance: "high",
  isReminderOn: true,
  reminderDateTime: { dateTime: "2026-02-15T09:00:00.0000000", timeZone: "Europe/Berlin" },
  dueDateTime: { dateTime: "2026-02-15T17:00:00.0000000", timeZone: "Europe/Berlin" },
  startDateTime: null,
  completedDateTime: null,
  body: { content: "<p>Check the code changes</p>", contentType: "html" },
  categories: ["Work"],
  createdDateTime: "2026-02-10T08:00:00Z",
  lastModifiedDateTime: "2026-02-10T08:00:00Z",
};

const sampleTask2 = {
  id: "task-002",
  title: "Buy groceries",
  status: "completed",
  importance: "normal",
  dueDateTime: null,
  completedDateTime: { dateTime: "2026-02-12T10:00:00.0000000", timeZone: "Europe/Berlin" },
};

export const todoHandlers = [
  // GET /me/todo/lists — list all lists
  http.get(`${GRAPH_BASE}/me/todo/lists`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) return;

    return HttpResponse.json({ value: [sampleList, sampleList2] });
  }),

  // GET /me/todo/lists/:id — get single list
  http.get(`${GRAPH_BASE}/me/todo/lists/:listId`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/me/todo/lists/:id = 5 parts, but /me/todo/lists/:id/tasks = 6 parts
    if (pathParts.length !== 5) return;

    if (params.listId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "ErrorItemNotFound", message: "List not found." } },
        { status: 404 },
      );
    }

    return HttpResponse.json({ ...sampleList, id: params.listId });
  }),

  // GET /me/todo/lists/:id/tasks — list tasks
  http.get(`${GRAPH_BASE}/me/todo/lists/:listId/tasks`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 6) return;

    return HttpResponse.json({ value: [sampleTask, sampleTask2] });
  }),

  // GET /me/todo/lists/:id/tasks/:taskId — get single task
  http.get(`${GRAPH_BASE}/me/todo/lists/:listId/tasks/:taskId`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 7) return;

    if (params.taskId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "ErrorItemNotFound", message: "Task not found." } },
        { status: 404 },
      );
    }

    return HttpResponse.json({ ...sampleTask, id: params.taskId });
  }),

  // GET /users/:uid/todo/lists — multi-tenant
  http.get(`${GRAPH_BASE}/users/:uid/todo/lists`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) return;

    return HttpResponse.json({ value: [sampleList] });
  }),

  // POST /me/todo/lists/:id/tasks — create task
  http.post(`${GRAPH_BASE}/me/todo/lists/:listId/tasks`, async ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 6) return;

    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        ...sampleTask,
        id: "task-new-001",
        title: body.title ?? sampleTask.title,
        status: body.status ?? "notStarted",
      },
      { status: 201 },
    );
  }),

  // PATCH /me/todo/lists/:id/tasks/:taskId — update task
  http.patch(`${GRAPH_BASE}/me/todo/lists/:listId/tasks/:taskId`, async ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 7) return;

    if (params.taskId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "ErrorItemNotFound", message: "Task not found." } },
        { status: 404 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...sampleTask, id: params.taskId, ...body });
  }),

  // DELETE /me/todo/lists/:id/tasks/:taskId — delete task
  http.delete(`${GRAPH_BASE}/me/todo/lists/:listId/tasks/:taskId`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 7) return;

    if (params.taskId === "nonexistent") {
      return HttpResponse.json(
        { error: { code: "ErrorItemNotFound", message: "Task not found." } },
        { status: 404 },
      );
    }

    return new HttpResponse(null, { status: 204 });
  }),
];
