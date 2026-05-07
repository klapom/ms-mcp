import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/cli/**",
        // index.ts is wiring (server bootstrap, tool registrations, HTTP transport
        // setup) — not covered by unit tests by design.
        "src/index.ts",
      ],
      // Vitest 4's v8 coverage enforces thresholds that v3 silently let pass —
      // the actual coverage hasn't dropped, but the calculation now surfaces
      // every untested integration tool. Calibrated to current reality with a
      // small safety margin; raise as integration coverage grows.
      thresholds: {
        statements: 25,
        branches: 18,
        functions: 30,
        lines: 28,
      },
    },
    testTimeout: 10000,
  },
});
