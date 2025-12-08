import { beforeAll } from "vitest";

beforeAll(() => {
  // Validate credentials for integration tests
  if (process.env.INTEGRATION === "true") {
    const required = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(
        `Integration tests require: ${missing.join(", ")}\n` +
          `Set in .dev.vars or environment.`
      );
    }
  }
});
