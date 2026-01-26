# Cloudflare Infra Provisioning

## Context

Cloudflare infra for the API includes Queues + R2 buckets + R2 CORS + R2 event notifications.

Previously this lived in multiple scripts under `scripts/infra/*` and an API-local queue script.

---

## Provisioning Script

- Script: `scripts/infra/cloudflare-provision.sh`
- Provisions per environment (`dev`, `staging`, `production`):
  - Cloudflare Queues (including DLQs)
  - R2 photos bucket
  - R2 CORS rules (from `scripts/infra/r2-cors.json`)
  - R2 event notifications for `uploads/`
    - `dev` delivers to `r2-notification-proxy`
    - `staging`/`production` deliver to `upload-processing*`
  - Optional R2 custom domain wiring with `--with-domains` and `R2_ZONE_ID`

Run locally:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...

bash scripts/infra/cloudflare-provision.sh staging
```

Optional custom domain setup:

```bash
export R2_ZONE_ID=...
bash scripts/infra/cloudflare-provision.sh staging --with-domains
```
