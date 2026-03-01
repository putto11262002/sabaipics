import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./src/api/tests/setup.node.ts'],
    include: ['src/api/src/**/*.test.ts'],
  },
});
