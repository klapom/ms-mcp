import type { HttpHandler } from "msw";
import { mailForwardHandlers } from "./mail-forward.js";
import { mailReplyHandlers } from "./mail-reply.js";
import { mailSendHandlers } from "./mail-send.js";
import { mailHandlers } from "./mail.js";

/**
 * MSW handler order matters: more specific routes must come before generic ones.
 * - mailHandlers: read-only GET handlers (list, read, search, folders)
 * - mail*Handlers: write POST handlers (send, reply, forward)
 * Within each group, message-action handlers (/messages/:id/reply) are matched
 * before generic message handlers (/messages/:id) by MSW's path specificity.
 */
export const handlers: HttpHandler[] = [
  ...mailHandlers,
  ...mailSendHandlers,
  ...mailReplyHandlers,
  ...mailForwardHandlers,
];
