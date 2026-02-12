import { afterAll, afterEach, beforeAll } from "vitest";
import { resetTimezoneCache } from "../src/utils/user-settings.js";
import { server } from "./mocks/server.js";

// Start MSW server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
});

// Reset handlers and caches after each test
afterEach(() => {
  server.resetHandlers();
  resetTimezoneCache();
});

// Close MSW server after all tests
afterAll(() => {
  server.close();
});
