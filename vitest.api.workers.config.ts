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
        miniflare: {
          bindings: {
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
            CF_ZONE: 'example.com',
            CF_ACCOUNT_ID: 'test-account-id',
            PHOTO_BUCKET_NAME: 'framefast-photos-test',
            PHOTO_R2_BASE_URL: 'https://photos.example.com',
            R2_ACCESS_KEY_ID: 'test-r2-access-key',
            R2_SECRET_ACCESS_KEY: 'test-r2-secret-key',
            RECOGNITION_ENDPOINT: 'https://example.com/recognition',
            POSTHOG_API_KEY: '',
            SENTRY_DSN: '',
            MODAL_KEY: 'test-modal-key',
            MODAL_SECRET: 'test-modal-secret',
          },
        },
        main: './src/api/tests/workers-entry.ts',
        isolatedStorage: true,
      },
    },
  },
});
