import { http, HttpResponse } from "msw";

interface BatchRequestItem {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

interface BatchResponseItem {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function checkErrorSimulation(id: string, url: string): BatchResponseItem | null {
  if (url.includes("not-found") || url.includes("nonexistent")) {
    return {
      id,
      status: 404,
      body: { error: { code: "ErrorItemNotFound", message: "Item not found" } },
    };
  }
  if (url.includes("forbidden")) {
    return {
      id,
      status: 403,
      body: { error: { code: "ErrorAccessDenied", message: "Access denied" } },
    };
  }
  if (url.includes("conflict")) {
    return {
      id,
      status: 409,
      body: { error: { code: "ErrorConflict", message: "Conflict detected" } },
    };
  }
  return null;
}

function processPatch(
  id: string,
  url: string,
  body: Record<string, unknown> | undefined,
): BatchResponseItem {
  const resourceId = url.split("/").pop() ?? "";
  if (body && "parentFolderId" in body) {
    return { id, status: 200, body: { id: resourceId, parentFolderId: body.parentFolderId } };
  }
  if (body && "flag" in body) {
    return { id, status: 200, body: { id: resourceId, flag: body.flag } };
  }
  if (body && "parentReference" in body) {
    return { id, status: 200, body: { id: resourceId, parentReference: body.parentReference } };
  }
  return { id, status: 200, body: {} };
}

function processRequest(req: BatchRequestItem): BatchResponseItem {
  const errorResponse = checkErrorSimulation(req.id, req.url);
  if (errorResponse) return errorResponse;

  if (req.method === "DELETE") {
    return { id: req.id, status: 204 };
  }
  if (req.method === "PATCH") {
    return processPatch(req.id, req.url, req.body);
  }
  return { id: req.id, status: 200, body: {} };
}

export const batchHandlers = [
  http.post("https://graph.microsoft.com/v1.0/\\$batch", async ({ request }) => {
    const payload = (await request.json()) as { requests: BatchRequestItem[] };

    if (!payload.requests || payload.requests.length > 20) {
      return HttpResponse.json(
        { error: { code: "BadRequest", message: "Max 20 requests per batch" } },
        { status: 400 },
      );
    }

    const responses: BatchResponseItem[] = payload.requests.map(processRequest);
    return HttpResponse.json({ responses });
  }),
];
