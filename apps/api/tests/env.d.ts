/// <reference path="../src/worker-configuration.d.ts" />

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Cloudflare.Env {
    // Secrets from .dev.vars (not in wrangler.jsonc, so not auto-generated)
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
  }
}
