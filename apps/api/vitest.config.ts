import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Only include tests that need workerd runtime (DO, R2, Queue)
    include: ["tests/**/*.workers.test.ts"],
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "./wrangler.jsonc",
        },
        // Use DO class directly instead of main entry (avoids AWS SDK load)
        main: "./src/durable-objects/rate-limiter.ts",
        isolatedStorage: true,
      },
    },
  },
});
