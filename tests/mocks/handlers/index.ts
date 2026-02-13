import type { HttpHandler } from "msw";
import { calendarWriteHandlers } from "./calendar-write.js";
import { calendarHandlers } from "./calendar.js";
import { chatHandlers } from "./chats.js";
import { contactHandlers } from "./contacts.js";
import { driveWriteHandlers } from "./drive-write.js";
import { driveHandlers } from "./drive.js";
import { mailAttachmentHandlers } from "./mail-attachments.js";
import { mailForwardHandlers } from "./mail-forward.js";
import { mailMoveHandlers } from "./mail-move.js";
import { mailReplyHandlers } from "./mail-reply.js";
import { mailSendHandlers } from "./mail-send.js";
import { mailHandlers } from "./mail.js";
import { sharepointListHandlers } from "./sharepoint-lists.js";
import { sharepointHandlers } from "./sharepoint.js";
import { teamsHandlers } from "./teams.js";
import { todoHandlers } from "./todo.js";
import { userHandlers } from "./user.js";

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
  ...driveWriteHandlers,
  ...driveHandlers,
  ...mailAttachmentHandlers,
  ...mailMoveHandlers,
  ...mailHandlers,
  ...mailSendHandlers,
  ...mailReplyHandlers,
  ...mailForwardHandlers,
  ...teamsHandlers,
  ...chatHandlers,
  ...sharepointListHandlers,
  ...sharepointHandlers,
  ...contactHandlers,
  ...todoHandlers,
  ...userHandlers,
];
