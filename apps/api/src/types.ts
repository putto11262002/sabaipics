import type { AuthVariables } from "@sabaipics/auth/types";
import type { Database } from "@sabaipics/db";

// Extend CloudflareBindings with secrets not in wrangler.jsonc
export type Bindings = CloudflareBindings;
// I dont think we need this because wrangler types generate thses types for us base on the wrangler.jsonc
// & {
//   ADMIN_API_KEY: string;
//   STRIPE_SECRET_KEY: string;
//   STRIPE_WEBHOOK_SECRET: string;
//   APP_BASE_URL: string;
//   // Image URLs for CF Images transformations and R2 storage
//   CF_DOMAIN: string;
//   R2_BASE_URL: string;
//   // R2 API credentials for presigned URLs (set via wrangler secret put)
//   R2_ACCESS_KEY_ID?: string;
//   R2_SECRET_ACCESS_KEY?: string;
//   CLOUDFLARE_ACCOUNT_ID?: string;
// };

export type Variables = AuthVariables & {
  db: () => Database;
};

export type Env = { Bindings: Bindings; Variables: Variables };

// Image URL env vars (from wrangler.jsonc vars)
export type ImageUrlEnv = {
  CF_DOMAIN: string;
  R2_BASE_URL: string;
};
