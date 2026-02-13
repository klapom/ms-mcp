import { http, HttpResponse } from "msw";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

const MOCK_DRAFT_MESSAGE = {
  id: "draft-message-id-123",
  subject: "Draft Subject",
  from: { emailAddress: { name: "Test User", address: "test@example.com" } },
  toRecipients: [{ emailAddress: { name: "Recipient", address: "recipient@example.com" } }],
  ccRecipients: [],
  bodyPreview: "This is a draft message",
  receivedDateTime: "2026-02-12T10:00:00Z",
  isDraft: true,
  isRead: false,
  importance: "normal",
  hasAttachments: false,
};

const MOCK_MAIL_FOLDER = {
  id: "folder-id-123",
  displayName: "New Folder",
  parentFolderId: "inbox",
  childFolderCount: 0,
  totalItemCount: 0,
  unreadItemCount: 0,
};

const MOCK_MAIL_RULES = [
  {
    id: "rule-id-1",
    displayName: "Auto-File Important Emails",
    sequence: 1,
    isEnabled: true,
    hasError: false,
    conditions: {
      importance: "high",
      fromAddresses: [{ emailAddress: { name: "Boss", address: "boss@example.com" } }],
    },
    actions: {
      moveToFolder: "folder-id-important",
      markAsRead: false,
    },
  },
  {
    id: "rule-id-2",
    displayName: "Forward Newsletter",
    sequence: 2,
    isEnabled: true,
    hasError: false,
    conditions: {
      subjectContains: ["newsletter", "digest"],
    },
    actions: {
      forwardTo: [{ emailAddress: { name: "Archive", address: "archive@example.com" } }],
    },
  },
];

export const mailExtensionHandlers = [
  // DELETE /me/messages/{id}
  http.delete(`${GRAPH_BASE_URL}/me/messages/:messageId`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // POST /me/messages (create draft)
  http.post(`${GRAPH_BASE_URL}/me/messages`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...MOCK_DRAFT_MESSAGE,
      subject: body.subject ?? MOCK_DRAFT_MESSAGE.subject,
    });
  }),

  // POST /me/messages/{id}/send (send draft)
  http.post(`${GRAPH_BASE_URL}/me/messages/:messageId/send`, () => {
    return new HttpResponse(null, { status: 202 });
  }),

  // GET /me/messages/{id} (ONLY for send_draft preview with isDraft check)
  // Note: This handler comes AFTER mailHandlers, so mail-read tests use their specific mocks
  http.get(`${GRAPH_BASE_URL}/me/messages/:messageId`, ({ request }) => {
    const url = new URL(request.url);
    const select = url.searchParams.get("$select");

    // Only handle requests that explicitly check for isDraft (send_draft preview)
    if (select?.includes("isDraft")) {
      return HttpResponse.json({
        id: "draft-message-id-123",
        subject: "Draft Subject",
        toRecipients: MOCK_DRAFT_MESSAGE.toRecipients,
        ccRecipients: [],
        isDraft: true,
      });
    }

    // Fallback for other draft-related GET requests
    return HttpResponse.json(MOCK_DRAFT_MESSAGE);
  }),

  // POST /me/messages/{id}/attachments (add attachment)
  http.post(`${GRAPH_BASE_URL}/me/messages/:messageId/attachments`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      "@odata.type": "#microsoft.graph.fileAttachment",
      id: "attachment-id-123",
      name: body.name ?? "attachment.txt",
      contentType: body.contentType ?? "application/octet-stream",
      size: 1024,
      isInline: body.isInline ?? false,
    });
  }),

  // POST /me/mailFolders (create root folder)
  http.post(`${GRAPH_BASE_URL}/me/mailFolders`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...MOCK_MAIL_FOLDER,
      displayName: body.displayName ?? MOCK_MAIL_FOLDER.displayName,
    });
  }),

  // POST /me/mailFolders/{id}/childFolders (create child folder)
  http.post(`${GRAPH_BASE_URL}/me/mailFolders/:parentId/childFolders`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...MOCK_MAIL_FOLDER,
      displayName: body.displayName ?? MOCK_MAIL_FOLDER.displayName,
      parentFolderId: "parent-folder-id",
    });
  }),

  // PATCH /me/messages/{id} (flag email)
  http.patch(`${GRAPH_BASE_URL}/me/messages/:messageId`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...MOCK_DRAFT_MESSAGE,
      flag: body.flag,
    });
  }),

  // GET /me/mailFolders/inbox/messageRules (list mail rules)
  http.get(`${GRAPH_BASE_URL}/me/mailFolders/inbox/messageRules`, () => {
    return HttpResponse.json({
      value: MOCK_MAIL_RULES,
      "@odata.count": MOCK_MAIL_RULES.length,
    });
  }),
];
