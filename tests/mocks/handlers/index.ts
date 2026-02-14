import type { HttpHandler } from "msw";
import { batchHandlers } from "./batch.js";
import { calendarRecurrenceHandlers } from "./calendar-recurrence.js";
import { calendarRoomHandlers } from "./calendar-rooms.js";
import { calendarWriteHandlers } from "./calendar-write.js";
import { calendarHandlers } from "./calendar.js";
import { chatHandlers } from "./chats.js";
import { contactHandlers } from "./contacts.js";
import { driveWriteHandlers } from "./drive-write.js";
import { driveHandlers } from "./drive.js";
import { mailAttachmentHandlers } from "./mail-attachments.js";
import { mailExtensionHandlers } from "./mail-extensions.js";
import { mailForwardHandlers } from "./mail-forward.js";
import { mailMoveHandlers } from "./mail-move.js";
import { mailReplyHandlers } from "./mail-reply.js";
import { mailSendHandlers } from "./mail-send.js";
import { mailHandlers } from "./mail.js";
import { onenoteHandlers } from "./onenote.js";
import { presenceHandlers } from "./presence.js";
import { searchHandlers } from "./search.js";
import { sharepointListHandlers } from "./sharepoint-lists.js";
import { sharepointHandlers } from "./sharepoint.js";
import { teamsActivityHandlers } from "./teams-activity.js";
import { teamsMeetingsHandlers } from "./teams-meetings.js";
import { teamsHandlers } from "./teams.js";
import { todoHandlers } from "./todo.js";
import { uploadSessionHandlers } from "./upload-session.js";
import { userHandlers } from "./user.js";

/**
 * MSW handler order matters: more specific routes must come before generic ones.
 * - Upload session handlers: createUploadSession, chunk upload, copy status, attach item/reference
 * - Calendar write handlers: POST/PATCH/DELETE before GET
 * - Attachment handlers: /messages/:id/attachments/:aid before /messages/:id
 * - Move handlers: POST /messages/:id/move before generic GET /messages/:id
 * - mailHandlers: read-only GET handlers (list, read, search, folders)
 * - mail*Handlers: write POST handlers (send, reply, forward)
 */
export const handlers: HttpHandler[] = [
  ...uploadSessionHandlers,
  ...batchHandlers,
  ...calendarRecurrenceHandlers,
  ...calendarRoomHandlers,
  ...calendarWriteHandlers,
  ...calendarHandlers,
  ...driveWriteHandlers,
  ...driveHandlers,
  ...mailAttachmentHandlers,
  ...mailMoveHandlers,
  ...mailHandlers,
  ...mailExtensionHandlers,
  ...mailSendHandlers,
  ...mailReplyHandlers,
  ...mailForwardHandlers,
  ...teamsActivityHandlers,
  ...teamsMeetingsHandlers,
  ...teamsHandlers,
  ...chatHandlers,
  ...sharepointListHandlers,
  ...sharepointHandlers,
  ...contactHandlers,
  ...todoHandlers,
  ...onenoteHandlers,
  ...presenceHandlers,
  ...userHandlers,
  ...searchHandlers,
];
