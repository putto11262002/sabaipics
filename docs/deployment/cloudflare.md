# Cloudflare Resources

All Cloudflare infrastructure is defined in `apps/api/wrangler.jsonc` and provisioned via `scripts/infra/cloudflare-provision.sh`.

## Resources by Environment

### Workers

| Environment | Worker Name             | Route                     |
| ----------- | ----------------------- | ------------------------- |
| Development | `api`                   | localhost:8081            |
| Staging     | `api` (env: staging)    | api-staging.sabaipics.com |
| Production  | `api` (env: production) | api.sabaipics.com         |

### Pages Projects

| Project     | Staging Branch                        | Production Branch          |
| ----------- | ------------------------------------- | -------------------------- |
| `dashboard` | staging → app-staging.sabaipics.com   | main → app.sabaipics.com   |
| `event`     | staging → event-staging.sabaipics.com | main → event.sabaipics.com |

### R2 Buckets

| Environment | Bucket Name                | Custom Domain                |
| ----------- | -------------------------- | ---------------------------- |
| Development | `sabaipics-photos-dev`     | devphotos.sabaipics.com      |
| Staging     | `sabaipics-photos-staging` | photos-staging.sabaipics.com |
| Production  | `sabaipics-photos`         | photo.sabaipics.com          |

### Queues

Staging/production have 8 queues (4 primary + 4 DLQs). Dev only provisions `r2-notification-proxy` (all other queues are locally simulated by wrangler dev).

| Queue                           | Purpose                                                |
| ------------------------------- | ------------------------------------------------------ |
| `photo-processing[-env]`        | Face detection on uploaded photos                      |
| `photo-processing-dlq[-env]`    | Dead letter queue for failed photo jobs                |
| `rekognition-cleanup[-env]`     | Cleanup AWS Rekognition collections                    |
| `rekognition-cleanup-dlq[-env]` | Dead letter queue for failed cleanup jobs              |
| `upload-processing[-env]`       | R2 upload notifications for photos (`uploads/` prefix) |
| `upload-processing-dlq[-env]`   | Dead letter queue for failed upload jobs               |
| `logo-processing[-env]`         | R2 upload notifications for logos (`logos/` prefix)    |
| `logo-processing-dlq[-env]`     | Dead letter queue for failed logo jobs                 |
| `r2-notification-proxy`         | Dev only — forwards R2 events to local dev via ngrok   |

### Durable Objects

| Name                           | Class                    | Purpose                          |
| ------------------------------ | ------------------------ | -------------------------------- |
| `AWS_REKOGNITION_RATE_LIMITER` | `RekognitionRateLimiter` | Rate limit Rekognition API calls |

### Rate Limiters

| Binding                 | Limit   | Purpose                 |
| ----------------------- | ------- | ----------------------- |
| `DOWNLOAD_RATE_LIMITER` | 100/60s | Photo download endpoint |
| `SEARCH_RATE_LIMITER`   | 200/10s | Face search endpoint    |

### Images API

The `IMAGES` binding provides Cloudflare Images transformation:

- Resize photos on-the-fly
- WebP/AVIF conversion
- Configured in each environment's `images` block

## Provisioning Infrastructure

The provisioning script creates all Cloudflare resources for an environment:

```bash
# Staging
bash scripts/infra/cloudflare-provision.sh staging

# Production
bash scripts/infra/cloudflare-provision.sh production

# With R2 custom domain (requires R2_ZONE_ID)
R2_ZONE_ID=<zone-id> bash scripts/infra/cloudflare-provision.sh production --with-domains
```

### What it creates:

1. **Queues** - All queues for the environment (idempotent, skips existing). Dev only creates `r2-notification-proxy`; staging/prod create 8 queues.
2. **R2 Bucket** - Photo storage bucket
3. **R2 CORS** - Configures CORS from `scripts/infra/r2-cors.json`
4. **R2 Notifications**:
   - `uploads/` prefix → upload queue (dev: `r2-notification-proxy`, staging/prod: `upload-processing-{env}`)
   - `logos/` prefix → logo queue (dev: `r2-notification-proxy`, staging/prod: `logo-processing-{env}`)
5. **R2 Custom Domain** - (optional, with `--with-domains`)

## wrangler.jsonc Structure

```jsonc
{
  // Default (development) config
  "name": "api",
  "vars": { ... },
  "r2_buckets": [...],
  "queues": { "producers": [...], "consumers": [...] },
  "durable_objects": { ... },
  "images": { "binding": "IMAGES" },

  "env": {
    // Staging overrides
    "staging": {
      "images": { "binding": "IMAGES" },
      "vars": { ... },
      "routes": [{ "pattern": "api-staging.sabaipics.com", ... }],
      "r2_buckets": [...],
      "queues": { ... },
      ...
    },

    // Production overrides
    "production": {
      "images": { "binding": "IMAGES" },
      "vars": { ... },
      "routes": [{ "pattern": "api.sabaipics.com", ... }],
      ...
    }
  }
}
```

**Note**: Top-level bindings (like `images`) are NOT inherited by environments. Each env must explicitly define them.

## Worker Types

Cloudflare Worker types are generated via:

```bash
pnpm --filter=@sabaipics/api cf-typegen
# or
cd apps/api && pnpm wrangler types --env-interface CloudflareBindings
```

This generates `apps/api/worker-configuration.d.ts` which includes:

- Environment variables from `wrangler.jsonc`
- Secrets from `.dev.vars` (local only)
- Binding types (R2, Queues, DO, etc.)

**Important**: The generated file is committed to git so CI can use it. Regenerate locally when bindings change.

## DNS Records

All domains use Cloudflare DNS (proxied):

| Record                         | Type             | Target            |
| ------------------------------ | ---------------- | ----------------- |
| `api.sabaipics.com`            | Worker Route     | (auto-configured) |
| `api-staging.sabaipics.com`    | Worker Route     | (auto-configured) |
| `app.sabaipics.com`            | CNAME            | Pages             |
| `app-staging.sabaipics.com`    | CNAME            | Pages             |
| `event.sabaipics.com`          | CNAME            | Pages             |
| `event-staging.sabaipics.com`  | CNAME            | Pages             |
| `photo.sabaipics.com`          | R2 Custom Domain | (auto-configured) |
| `photos-staging.sabaipics.com` | R2 Custom Domain | (auto-configured) |
