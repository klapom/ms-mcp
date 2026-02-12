import type { HttpHandler } from "msw";
import { calendarWriteHandlers } from "./calendar-write.js";
import { calendarHandlers } from "./calendar.js";
import { mailAttachmentHandlers } from "./mail-attachments.js";
import { mailForwardHandlers } from "./mail-forward.js";
import { mailMoveHandlers } from "./mail-move.js";
import { mailReplyHandlers } from "./mail-reply.js";
import { mailSendHandlers } from "./mail-send.js";
import { mailHandlers } from "./mail.js";

/**
 * MSW handler order matters: more specific routes must come before generic ones.
 * - Calendar write handlers: POST/PATCH/DELETE before GET
 * - Attachment handlers: /messages/:id/attachments/:aid before /messages/:id
 * - Move handlers: POST /messages/:id/move before generic GET /messages/:id
 * - mailHandlers: read-only GET handlers (list, read, search, folders)
 * - mail*Handlers: write POST handlers (send, reply, forward)
 */
export const handlers: HttpHandler[] = [
  ...calendarWriteHandlers,
  ...calendarHandlers,
  ...mailAttachmentHandlers,
  ...mailMoveHandlers,
  ...mailHandlers,
  ...mailSendHandlers,
  ...mailReplyHandlers,
  ...mailForwardHandlers,
];
