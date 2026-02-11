import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const mailHandlers = [
  // GET /me/mailFolders/inbox/messages – List emails (default folder)
  http.get(`${GRAPH_BASE}/me/mailFolders/inbox/messages`, ({ request }) => {
    const url = new URL(request.url);

    // Trigger 401 when a special filter is passed
    if (url.searchParams.get("$filter") === "trigger_401") {
      return HttpResponse.json(
        {
          error: {
            code: "InvalidAuthenticationToken",
            message: "Access token has expired.",
          },
        },
        { status: 401 },
      );
    }

    return HttpResponse.json({
      "@odata.context":
        "https://graph.microsoft.com/v1.0/$metadata#users('me')/mailFolders('inbox')/messages",
      "@odata.count": 2,
      value: [
        {
          id: "msg-001",
          subject: "Test Email 1",
          from: {
            emailAddress: {
              name: "Max Mustermann",
              address: "max@example.com",
            },
          },
          receivedDateTime: "2026-02-11T10:00:00Z",
          bodyPreview: "This is a test email preview.",
          isRead: false,
          importance: "normal",
        },
        {
          id: "msg-002",
          subject: "Test Email 2",
          from: {
            emailAddress: {
              name: "Erika Muster",
              address: "erika@example.com",
            },
          },
          receivedDateTime: "2026-02-11T09:00:00Z",
          bodyPreview: "Another test email preview.",
          isRead: true,
          importance: "high",
        },
      ],
    });
  }),

  // GET /me/messages – Legacy path (kept for backward compatibility)
  http.get(`${GRAPH_BASE}/me/messages`, () => {
    return HttpResponse.json({
      "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users('me')/messages",
      "@odata.count": 2,
      value: [
        {
          id: "msg-001",
          subject: "Test Email 1",
          from: {
            emailAddress: {
              name: "Max Mustermann",
              address: "max@example.com",
            },
          },
          receivedDateTime: "2026-02-11T10:00:00Z",
          bodyPreview: "This is a test email preview.",
          isRead: false,
          importance: "normal",
        },
        {
          id: "msg-002",
          subject: "Test Email 2",
          from: {
            emailAddress: {
              name: "Erika Muster",
              address: "erika@example.com",
            },
          },
          receivedDateTime: "2026-02-11T09:00:00Z",
          bodyPreview: "Another test email preview.",
          isRead: true,
          importance: "high",
        },
      ],
    });
  }),

  // 404 Not Found for non-existent folder
  http.get(`${GRAPH_BASE}/me/mailFolders/nonexistent/messages`, () => {
    return HttpResponse.json(
      {
        error: {
          code: "ErrorItemNotFound",
          message: "The specified folder was not found.",
        },
      },
      { status: 404 },
    );
  }),

  // 429 Too Many Requests
  http.get(`${GRAPH_BASE}/me/mailFolders/rate-limited/messages`, () => {
    return HttpResponse.json(
      {
        error: {
          code: "TooManyRequests",
          message: "Too many requests.",
        },
      },
      { status: 429, headers: { "Retry-After": "5" } },
    );
  }),

  // Pagination response (page 1 with nextLink)
  http.get(`${GRAPH_BASE}/me/mailFolders/paginated/messages`, () => {
    return HttpResponse.json({
      "@odata.context":
        "https://graph.microsoft.com/v1.0/$metadata#users('me')/mailFolders('paginated')/messages",
      "@odata.count": 50,
      "@odata.nextLink": `${GRAPH_BASE}/me/mailFolders/paginated/messages?$skip=25`,
      value: [
        {
          id: "page1-msg-001",
          subject: "Page 1 Email",
          from: {
            emailAddress: {
              name: "Test User",
              address: "test@example.com",
            },
          },
          receivedDateTime: "2026-02-11T10:00:00Z",
          bodyPreview: "Page 1 preview",
          isRead: false,
          importance: "normal",
        },
      ],
    });
  }),

  // GET /me/messages/{id} — Read single email
  http.get(`${GRAPH_BASE}/me/messages/:messageId`, ({ params }) => {
    const { messageId } = params;

    if (messageId === "nonexistent-msg") {
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

    if (messageId === "html-msg") {
      return HttpResponse.json({
        id: "html-msg",
        subject: "HTML Email",
        from: { emailAddress: { name: "Sender", address: "sender@example.com" } },
        toRecipients: [{ emailAddress: { name: "Recipient", address: "recipient@example.com" } }],
        ccRecipients: [],
        bccRecipients: [],
        body: {
          contentType: "html",
          content:
            '<html><body><h1>Hello</h1><p>This is a <a href="https://example.com">link</a> and a paragraph.</p><table><tr><td>Cell 1</td><td>Cell 2</td></tr></table></body></html>',
        },
        receivedDateTime: "2026-02-11T10:00:00Z",
        sentDateTime: "2026-02-11T09:59:00Z",
        hasAttachments: false,
        importance: "normal",
        isRead: true,
        conversationId: "conv-001",
        internetMessageId: "<msg001@example.com>",
        replyTo: [],
        parentFolderId: "inbox-folder-id",
      });
    }

    if (messageId === "text-msg") {
      return HttpResponse.json({
        id: "text-msg",
        subject: "Plain Text Email",
        from: { emailAddress: { name: "Text Sender", address: "text@example.com" } },
        toRecipients: [{ emailAddress: { name: "Me", address: "me@example.com" } }],
        ccRecipients: [{ emailAddress: { name: "CC Person", address: "cc@example.com" } }],
        bccRecipients: [],
        body: {
          contentType: "text",
          content: "This is a plain text email body.",
        },
        receivedDateTime: "2026-02-11T08:00:00Z",
        sentDateTime: "2026-02-11T07:59:00Z",
        hasAttachments: true,
        importance: "high",
        isRead: false,
        conversationId: "conv-002",
        internetMessageId: "<msg002@example.com>",
        replyTo: [{ emailAddress: { name: "Reply To", address: "reply@example.com" } }],
        parentFolderId: "inbox-folder-id",
      });
    }

    if (messageId === "empty-body-msg") {
      return HttpResponse.json({
        id: "empty-body-msg",
        subject: "Empty Body",
        from: { emailAddress: { name: "Sender", address: "sender@example.com" } },
        toRecipients: [],
        ccRecipients: [],
        bccRecipients: [],
        body: { contentType: "text", content: "" },
        receivedDateTime: "2026-02-11T06:00:00Z",
        sentDateTime: "2026-02-11T05:59:00Z",
        hasAttachments: false,
        importance: "normal",
        isRead: true,
        conversationId: "conv-003",
        internetMessageId: "<msg003@example.com>",
        replyTo: [],
        parentFolderId: "inbox-folder-id",
      });
    }

    if (messageId === "headers-msg") {
      return HttpResponse.json({
        id: "headers-msg",
        subject: "With Headers",
        from: { emailAddress: { name: "Sender", address: "sender@example.com" } },
        toRecipients: [{ emailAddress: { name: "Me", address: "me@example.com" } }],
        ccRecipients: [],
        bccRecipients: [],
        body: { contentType: "text", content: "Test body." },
        receivedDateTime: "2026-02-11T07:00:00Z",
        sentDateTime: "2026-02-11T06:59:00Z",
        hasAttachments: false,
        importance: "normal",
        isRead: true,
        conversationId: "conv-004",
        internetMessageId: "<msg004@example.com>",
        replyTo: [],
        parentFolderId: "inbox-folder-id",
        internetMessageHeaders: [
          { name: "Message-ID", value: "<msg004@example.com>" },
          { name: "In-Reply-To", value: "<parent@example.com>" },
          { name: "References", value: "<parent@example.com> <grandparent@example.com>" },
        ],
      });
    }

    if (messageId === "long-body-msg") {
      return HttpResponse.json({
        id: "long-body-msg",
        subject: "Long Body",
        from: { emailAddress: { name: "Sender", address: "sender@example.com" } },
        toRecipients: [],
        ccRecipients: [],
        bccRecipients: [],
        body: { contentType: "text", content: "A".repeat(10000) },
        receivedDateTime: "2026-02-11T05:00:00Z",
        sentDateTime: "2026-02-11T04:59:00Z",
        hasAttachments: false,
        importance: "normal",
        isRead: true,
        conversationId: "conv-005",
        internetMessageId: "<msg005@example.com>",
        replyTo: [],
        parentFolderId: "inbox-folder-id",
      });
    }

    // Default message
    return HttpResponse.json({
      id: messageId,
      subject: "Default Test Email",
      from: { emailAddress: { name: "Default Sender", address: "default@example.com" } },
      toRecipients: [{ emailAddress: { name: "Me", address: "me@example.com" } }],
      ccRecipients: [],
      bccRecipients: [],
      body: { contentType: "text", content: "Default body content." },
      receivedDateTime: "2026-02-11T10:00:00Z",
      sentDateTime: "2026-02-11T09:59:00Z",
      hasAttachments: false,
      importance: "normal",
      isRead: false,
      conversationId: "conv-default",
      internetMessageId: `<${String(messageId)}@example.com>`,
      replyTo: [],
      parentFolderId: "inbox-folder-id",
    });
  }),

  // GET /users/{userId}/messages/{messageId} — Multi-tenant read
  http.get(`${GRAPH_BASE}/users/:userId/messages/:messageId`, ({ params }) => {
    const { userId, messageId } = params;
    return HttpResponse.json({
      id: messageId,
      subject: `Multi-tenant Email for ${String(userId)}`,
      from: { emailAddress: { name: "MT Sender", address: "mt@example.com" } },
      toRecipients: [{ emailAddress: { name: String(userId), address: String(userId) } }],
      ccRecipients: [],
      bccRecipients: [],
      body: { contentType: "text", content: "Multi-tenant body." },
      receivedDateTime: "2026-02-11T10:00:00Z",
      sentDateTime: "2026-02-11T09:59:00Z",
      hasAttachments: false,
      importance: "normal",
      isRead: true,
      conversationId: "conv-mt",
      internetMessageId: `<${String(messageId)}@mt.example.com>`,
      replyTo: [],
      parentFolderId: "inbox-folder-id",
    });
  }),

  // -----------------------------------------------------------------------
  // Mail Folders handlers
  // -----------------------------------------------------------------------

  // GET /me/mailFolders — List mail folders
  http.get(`${GRAPH_BASE}/me/mailFolders`, ({ request }) => {
    const url = new URL(request.url);

    // Only match the exact /me/mailFolders path (not /me/mailFolders/xxx/...)
    // MSW routes /me/mailFolders/:folderId/... via other handlers
    const path = url.pathname;
    if (path !== "/v1.0/me/mailFolders") {
      return;
    }

    const top = url.searchParams.get("$top");

    const allFolders = [
      {
        id: "AAMkInbox",
        displayName: "Inbox",
        parentFolderId: "AAMkRoot",
        childFolderCount: 2,
        totalItemCount: 142,
        unreadItemCount: 5,
      },
      {
        id: "AAMkSent",
        displayName: "Sent Items",
        parentFolderId: "AAMkRoot",
        childFolderCount: 0,
        totalItemCount: 89,
        unreadItemCount: 0,
      },
      {
        id: "AAMkDrafts",
        displayName: "Drafts",
        parentFolderId: "AAMkRoot",
        childFolderCount: 0,
        totalItemCount: 3,
        unreadItemCount: 0,
      },
      {
        id: "AAMkDeleted",
        displayName: "Deleted Items",
        parentFolderId: "AAMkRoot",
        childFolderCount: 0,
        totalItemCount: 25,
        unreadItemCount: 0,
      },
      {
        id: "AAMkJunk",
        displayName: "Junk Email",
        parentFolderId: "AAMkRoot",
        childFolderCount: 0,
        totalItemCount: 12,
        unreadItemCount: 12,
      },
      {
        id: "AAMkArchive",
        displayName: "Archive",
        parentFolderId: "AAMkRoot",
        childFolderCount: 1,
        totalItemCount: 500,
        unreadItemCount: 0,
      },
    ];

    // Handle pagination
    if (top) {
      const topNum = Number.parseInt(top, 10);
      const limited = allFolders.slice(0, topNum);
      return HttpResponse.json({
        "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#me/mailFolders",
        "@odata.count": allFolders.length,
        "@odata.nextLink":
          topNum < allFolders.length
            ? `${GRAPH_BASE}/me/mailFolders?$skip=${topNum}&$top=${topNum}`
            : undefined,
        value: limited,
      });
    }

    return HttpResponse.json({
      "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#me/mailFolders",
      "@odata.count": allFolders.length,
      value: allFolders,
    });
  }),

  // GET /me/mailFolders/{id}/childFolders — Child folders
  http.get(`${GRAPH_BASE}/me/mailFolders/:folderId/childFolders`, ({ params }) => {
    const { folderId } = params;

    if (folderId === "AAMkInbox") {
      return HttpResponse.json({
        "@odata.context": "...",
        "@odata.count": 2,
        value: [
          {
            id: "AAMkInboxChild1",
            displayName: "Important",
            parentFolderId: "AAMkInbox",
            childFolderCount: 0,
            totalItemCount: 10,
            unreadItemCount: 2,
          },
          {
            id: "AAMkInboxChild2",
            displayName: "Newsletters",
            parentFolderId: "AAMkInbox",
            childFolderCount: 0,
            totalItemCount: 45,
            unreadItemCount: 15,
          },
        ],
      });
    }

    if (folderId === "AAMkArchive") {
      return HttpResponse.json({
        "@odata.context": "...",
        "@odata.count": 1,
        value: [
          {
            id: "AAMkArchiveChild1",
            displayName: "2024",
            parentFolderId: "AAMkArchive",
            childFolderCount: 0,
            totalItemCount: 200,
            unreadItemCount: 0,
          },
        ],
      });
    }

    return HttpResponse.json({
      "@odata.context": "...",
      "@odata.count": 0,
      value: [],
    });
  }),

  // GET /users/{userId}/mailFolders — Multi-tenant
  http.get(`${GRAPH_BASE}/users/:userId/mailFolders`, ({ request }) => {
    const url = new URL(request.url);
    // Only match exact /users/:userId/mailFolders path
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4) {
      return;
    }

    return HttpResponse.json({
      "@odata.context": "...",
      "@odata.count": 2,
      value: [
        {
          id: "MTInbox",
          displayName: "Inbox",
          parentFolderId: "MTRoot",
          childFolderCount: 0,
          totalItemCount: 50,
          unreadItemCount: 3,
        },
        {
          id: "MTSent",
          displayName: "Sent Items",
          parentFolderId: "MTRoot",
          childFolderCount: 0,
          totalItemCount: 20,
          unreadItemCount: 0,
        },
      ],
    });
  }),

  // -----------------------------------------------------------------------
  // Search handlers
  // -----------------------------------------------------------------------

  // Search within folder
  http.get(`${GRAPH_BASE}/me/mailFolders/:folderId/messages`, ({ request, params }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("$search");
    const { folderId } = params;

    // Only handle search requests for non-existing specific handlers
    if (!search) {
      return;
    }

    // Handle folder-scoped search
    if (folderId === "sentitems") {
      return HttpResponse.json({
        "@odata.context": "...",
        value: [
          {
            id: "search-sent-001",
            subject: "Sent search result",
            from: {
              emailAddress: { name: "Me", address: "me@example.com" },
            },
            receivedDateTime: "2026-02-11T09:00:00Z",
            bodyPreview: "Sent search preview",
            isRead: true,
            importance: "normal",
          },
        ],
      });
    }

    return HttpResponse.json({
      "@odata.context": "...",
      value: [],
    });
  }),

  // GET /users/{userId}/messages (with $search) — Multi-tenant search
  http.get(`${GRAPH_BASE}/users/:userId/messages`, ({ request }) => {
    return HttpResponse.json({
      "@odata.context": "...",
      value: [
        {
          id: "mt-search-001",
          subject: "Multi-tenant search result",
          from: {
            emailAddress: { name: "MT User", address: "mt@example.com" },
          },
          receivedDateTime: "2026-02-11T10:00:00Z",
          bodyPreview: "MT search preview",
          isRead: false,
          importance: "normal",
        },
      ],
    });
  }),
];
