import type { HttpHandler } from "msw";

// Import and combine handlers from all modules as they are implemented
// import { mailHandlers } from "./mail.js";
// import { calendarHandlers } from "./calendar.js";

export const handlers: HttpHandler[] = [
  // ...mailHandlers,
  // ...calendarHandlers,
];
