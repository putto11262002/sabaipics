import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Only include Workers tests (tests/**/*.workers.test.ts)
    // Co-located tests (src/**/*.test.ts) run with regular Node vitest
    include: ["tests/**/*.workers.test.ts"],
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "./wrangler.jsonc",
        },
        // Use DO class directly instead of main entry (avoids AWS SDK load)
        // Note: SELF.fetch() requires main entry, but app.request() works fine
        main: "./src/durable-objects/rate-limiter.ts",
        isolatedStorage: true,
      },
    },
  },
});
