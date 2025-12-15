import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Include tests that run in Node.js (AWS mocks, unit tests)
    include: ["tests/**/*.test.ts"],
    // Exclude workers tests (they use separate config)
    exclude: ["tests/**/*.workers.test.ts", "tests/**/*.integration.ts"],
    environment: "node",
  },
});
