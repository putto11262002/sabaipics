import { defineConfig, mergeConfig } from 'vite';
import { baseConfig } from '../../vite.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: __dirname,
    build: { outDir: 'dist' },
    server: { port: 5174 },
  }),
);
