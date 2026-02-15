import path from "path";
import { defineConfig, mergeConfig } from "vite";
import { baseConfig } from "./vite.base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: path.resolve(__dirname, "src/event"),
    build: { outDir: "dist" },
    server: { port: 5174 },
  })
);
