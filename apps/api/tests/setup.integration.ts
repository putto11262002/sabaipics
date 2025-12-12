/**
 * Setup for integration tests (real AWS calls)
 */

import { beforeAll } from "vitest";
import { z } from "zod";

const envSchema = z.object({
  AWS_ACCESS_KEY_ID: z.string().min(1, "AWS_ACCESS_KEY_ID is required"),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, "AWS_SECRET_ACCESS_KEY is required"),
  AWS_REGION: z.string().min(1, "AWS_REGION is required"),
});

beforeAll(() => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Integration tests require AWS credentials.\n${errors}\n\nSet in .dev.vars or environment.`
    );
  }
});
