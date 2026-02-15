/**
 * Setup for integration tests (real AWS calls, Neon DB)
 */

import { beforeAll } from "vitest";
import { z } from "zod";

const envSchema = z.object({
  AWS_ACCESS_KEY_ID: z.string().min(1, "AWS_ACCESS_KEY_ID is required"),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, "AWS_SECRET_ACCESS_KEY is required"),
  AWS_REGION: z.string().min(1, "AWS_REGION is required"),
  STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

beforeAll(() => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Integration tests require credentials.\n${errors}\n\nSet in .dev.vars or environment.`
    );
  }
});
