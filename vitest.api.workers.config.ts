import path from 'path';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./src/api/tests/setup.ts'],
    include: ['src/api/tests/**/*.workers.test.ts'],
    poolOptions: {
      workers: {
        remoteBindings: false,
        wrangler: {
          configPath: './wrangler.api.jsonc',
        },
        main: './src/api/src/durable-objects/rate-limiter.ts',
        isolatedStorage: true,
      },
    },
  },
});
