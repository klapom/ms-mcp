import { http, HttpResponse } from "msw";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const TEXT_CONTENT_BASE64 = Buffer.from("Hello World").toString("base64");
const CSV_CONTENT_BASE64 = Buffer.from("name,age\nAlice,30\nBob,25").toString("base64");
const JSON_CONTENT_BASE64 = Buffer.from('{"key":"value"}').toString("base64");

const attachmentsList = [
  {
    id: "aid-pdf",
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: "Dokument.pdf",
    contentType: "application/pdf",
    size: 245760,
    isInline: false,
    lastModifiedDateTime: "2026-02-11T10:00:00Z",
  },
  {
    id: "aid-large",
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: "Huge.zip",
    contentType: "application/zip",
    size: 6291456, // 6 MB
    isInline: false,
    lastModifiedDateTime: "2026-02-11T09:00:00Z",
  },
  {
    id: "aid-inline",
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: "Logo.png",
    contentType: "image/png",
    size: 46080,
    isInline: true,
    lastModifiedDateTime: "2026-02-11T08:00:00Z",
  },
  {
    id: "aid-item",
    "@odata.type": "#microsoft.graph.itemAttachment",
    name: "Forwarded Message.eml",
    contentType: "message/rfc822",
    size: 102400,
    isInline: false,
    lastModifiedDateTime: "2026-02-11T07:00:00Z",
  },
];

function getAttachmentById(aid: string): Record<string, unknown> | null {
  const map: Record<string, Record<string, unknown>> = {
    "aid-pdf": {
      id: "aid-pdf",
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "Dokument.pdf",
      contentType: "application/pdf",
      size: 245760,
      isInline: false,
      contentId: null,
      contentBytes: Buffer.from("fake-pdf-content").toString("base64"),
    },
    "aid-txt": {
      id: "aid-txt",
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "readme.txt",
      contentType: "text/plain",
      size: 11,
      isInline: false,
      contentId: null,
      contentBytes: TEXT_CONTENT_BASE64,
    },
    "aid-csv": {
      id: "aid-csv",
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "data.csv",
      contentType: "text/csv",
      size: 25,
      isInline: false,
      contentId: null,
      contentBytes: CSV_CONTENT_BASE64,
    },
    "aid-json": {
      id: "aid-json",
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "config.json",
      contentType: "application/json",
      size: 15,
      isInline: false,
      contentId: null,
      contentBytes: JSON_CONTENT_BASE64,
    },
    "aid-large": {
      id: "aid-large",
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "BigFile.bin",
      contentType: "application/octet-stream",
      size: 5242880, // 5 MB
      isInline: false,
      contentId: null,
      contentBytes: Buffer.from("large-content").toString("base64"),
    },
    "aid-huge": {
      id: "aid-huge",
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "Enormous.bin",
      contentType: "application/octet-stream",
      size: 11534336, // 11 MB
      isInline: false,
      contentId: null,
      contentBytes: "",
    },
    "aid-item": {
      id: "aid-item",
      "@odata.type": "#microsoft.graph.itemAttachment",
      name: "Forwarded Message.eml",
      contentType: "message/rfc822",
      size: 102400,
      isInline: false,
    },
    "aid-ref": {
      id: "aid-ref",
      "@odata.type": "#microsoft.graph.referenceAttachment",
      name: "SharedDoc.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 0,
      isInline: false,
      sourceUrl: "https://tenant.sharepoint.com/shared/doc.docx",
    },
    "aid-inline": {
      id: "aid-inline",
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "Logo.png",
      contentType: "image/png",
      size: 46080,
      isInline: true,
      contentId: "<logo@embedded>",
      contentBytes: Buffer.from("fake-png-content").toString("base64"),
    },
    "aid-zero": {
      id: "aid-zero",
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "empty.txt",
      contentType: "text/plain",
      size: 0,
      isInline: false,
      contentId: null,
      contentBytes: "",
    },
    "aid-exact4mb": {
      id: "aid-exact4mb",
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "Exact4MB.bin",
      contentType: "application/octet-stream",
      size: 4194304, // exactly 4 MB
      isInline: false,
      contentId: null,
      contentBytes: Buffer.from("4mb-content").toString("base64"),
    },
  };
  return map[aid] ?? null;
}

export const mailAttachmentHandlers = [
  // GET /me/messages/{id}/attachments — List attachments
  http.get(`${GRAPH_BASE}/me/messages/:messageId/attachments`, ({ params, request }) => {
    const { messageId } = params;
    const url = new URL(request.url);

    // Only match the list endpoint (not /attachments/:aid)
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 5) {
      return;
    }

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

    if (messageId === "no-attachments-msg") {
      return HttpResponse.json({ value: [] });
    }

    return HttpResponse.json({ value: attachmentsList });
  }),

  // GET /me/messages/{id}/attachments/{aid} — Single attachment
  http.get(`${GRAPH_BASE}/me/messages/:messageId/attachments/:attachmentId`, ({ params }) => {
    const { messageId, attachmentId } = params;

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

    const attachment = getAttachmentById(String(attachmentId));
    if (!attachment) {
      return HttpResponse.json(
        {
          error: {
            code: "ErrorItemNotFound",
            message: "The specified attachment was not found.",
          },
        },
        { status: 404 },
      );
    }

    return HttpResponse.json(attachment);
  }),

  // GET /users/{userId}/messages/{id}/attachments — Multi-tenant list
  http.get(`${GRAPH_BASE}/users/:userId/messages/:messageId/attachments`, ({ request }) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // /v1.0/users/:uid/messages/:mid/attachments = 6 parts
    if (pathParts.length !== 6) {
      return;
    }

    return HttpResponse.json({
      value: [
        {
          id: "mt-aid-001",
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: "MT-Doc.pdf",
          contentType: "application/pdf",
          size: 1024,
          isInline: false,
          lastModifiedDateTime: "2026-02-11T10:00:00Z",
        },
      ],
    });
  }),

  // GET /users/{userId}/messages/{id}/attachments/{aid} — Multi-tenant single
  http.get(
    `${GRAPH_BASE}/users/:userId/messages/:messageId/attachments/:attachmentId`,
    ({ params }) => {
      return HttpResponse.json({
        id: params.attachmentId,
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: "MT-Doc.pdf",
        contentType: "application/pdf",
        size: 1024,
        isInline: false,
        contentId: null,
        contentBytes: Buffer.from("mt-pdf-content").toString("base64"),
      });
    },
  ),
];
