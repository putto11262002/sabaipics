import { defineConfig } from "vitest/config";
import { readFileSync, existsSync } from "fs";

// Load .dev.vars for integration tests
function loadDevVars() {
  const devVarsPath = "./.dev.vars";
  if (existsSync(devVarsPath)) {
    const content = readFileSync(devVarsPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          process.env[key] = valueParts.join("=");
        }
      }
    }
  }
}

loadDevVars();

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./tests/setup.integration.ts"],
    include: ["tests/**/*.integration.ts"],
    exclude: ["tests/setup.integration.ts"],
    environment: "node",
  },
});
