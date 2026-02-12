import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const mailMoveHandlers = [
  // POST /me/messages/{id}/move — Success (200 with moved message)
  http.post(`${GRAPH_BASE}/me/messages/:messageId/move`, async ({ params, request }) => {
    const { messageId } = params;

    if (messageId === "nonexistent") {
      return HttpResponse.json(
        {
          error: {
            code: "ErrorItemNotFound",
            message: "The specified object was not found in the store.",
          },
        },
        { status: 404 },
      );
    }

    if (messageId === "forbidden-msg") {
      return HttpResponse.json(
        {
          error: {
            code: "ErrorAccessDenied",
            message: "Access is denied. Check credentials and try again.",
          },
        },
        { status: 403 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const destinationId = String(body.destinationId ?? "");

    if (destinationId === "invalid-folder") {
      return HttpResponse.json(
        {
          error: {
            code: "ErrorInvalidParameter",
            message: "The destination folder was not found.",
          },
        },
        { status: 400 },
      );
    }

    return HttpResponse.json({
      id: `new-${String(messageId)}`,
      subject: "Default Test Email",
      parentFolderId: destinationId || "target-folder-id",
      from: { emailAddress: { name: "Default Sender", address: "default@example.com" } },
    });
  }),

  // GET /me/mailFolders/{id} — Single folder by ID (for move preview folder name resolution).
  // This does NOT overlap with mail.ts handlers which only have:
  //   GET /me/mailFolders (collection, pathParts=3)
  //   GET /me/mailFolders/:id/childFolders (pathParts=5)
  // This handler matches pathParts=4 exactly: /v1.0/me/mailFolders/:id
  http.get(`${GRAPH_BASE}/me/mailFolders/:folderId`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) {
      return;
    }

    const { folderId } = params;

    const folderNames: Record<string, string> = {
      "inbox-folder-id": "Inbox",
      "sent-folder-id": "Sent Items",
      inbox: "Inbox",
      sentitems: "Sent Items",
      drafts: "Drafts",
      deleteditems: "Deleted Items",
      archive: "Archive",
      "target-folder-id": "Archive",
    };

    const displayName = folderNames[String(folderId)];
    if (!displayName) {
      return HttpResponse.json(
        {
          error: {
            code: "ErrorItemNotFound",
            message: "The specified folder was not found.",
          },
        },
        { status: 404 },
      );
    }

    return HttpResponse.json({
      id: folderId,
      displayName,
    });
  }),

  // POST /users/{userId}/messages/{id}/move — Multi-tenant (200)
  http.post(`${GRAPH_BASE}/users/:userId/messages/:messageId/move`, async ({ params }) => {
    const { messageId } = params;
    return HttpResponse.json({
      id: `new-${String(messageId)}`,
      subject: "Multi-tenant Email",
      parentFolderId: "target-folder-id",
    });
  }),

  // GET /users/{userId}/mailFolders/{id} — Multi-tenant single folder by ID.
  // pathParts=5: /v1.0/users/:uid/mailFolders/:id
  http.get(`${GRAPH_BASE}/users/:userId/mailFolders/:folderId`, ({ params, request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) {
      return;
    }

    return HttpResponse.json({
      id: params.folderId,
      displayName: "Inbox",
    });
  }),
];
