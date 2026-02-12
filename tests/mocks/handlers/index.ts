import type { HttpHandler } from "msw";
import { mailAttachmentHandlers } from "./mail-attachments.js";
import { mailForwardHandlers } from "./mail-forward.js";
import { mailMoveHandlers } from "./mail-move.js";
import { mailReplyHandlers } from "./mail-reply.js";
import { mailSendHandlers } from "./mail-send.js";
import { mailHandlers } from "./mail.js";

/**
 * MSW handler order matters: more specific routes must come before generic ones.
 * - Attachment handlers: /messages/:id/attachments/:aid before /messages/:id
 * - Move handlers: POST /messages/:id/move before generic GET /messages/:id
 * - mailHandlers: read-only GET handlers (list, read, search, folders)
 * - mail*Handlers: write POST handlers (send, reply, forward)
 */
export const handlers: HttpHandler[] = [
  ...mailAttachmentHandlers,
  ...mailMoveHandlers,
  ...mailHandlers,
  ...mailSendHandlers,
  ...mailReplyHandlers,
  ...mailForwardHandlers,
];
