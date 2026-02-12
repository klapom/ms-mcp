import type { HttpHandler } from "msw";
import { mailForwardHandlers } from "./mail-forward.js";
import { mailReplyHandlers } from "./mail-reply.js";
import { mailSendHandlers } from "./mail-send.js";
import { mailHandlers } from "./mail.js";

export const handlers: HttpHandler[] = [
  ...mailHandlers,
  ...mailSendHandlers,
  ...mailReplyHandlers,
  ...mailForwardHandlers,
];
