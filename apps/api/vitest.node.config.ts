import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Include unit tests co-located with source code
    include: ["src/**/*.test.ts"],
    // Exclude workers tests and integration tests (they use separate configs)
    exclude: ["src/**/*.workers.test.ts", "src/**/*.integration.ts"],
    environment: "node",
  },
});
