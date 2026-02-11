import type { HttpHandler } from "msw";
import { mailHandlers } from "./mail.js";

export const handlers: HttpHandler[] = [...mailHandlers];
