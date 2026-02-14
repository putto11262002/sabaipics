# FrameFast Infrastructure (OpenTofu)

Manages Cloudflare infrastructure via OpenTofu (Terraform-compatible).

## Environments

```
environments/
├── dev/           # Development environment (fully managed)
├── staging/       # Staging environment
└── production/    # Production environment
```

## Modules

### `cloudflare-infra`
Core infrastructure for all environments:
- R2 buckets (photos storage)
- R2 custom domains
- R2 CORS configuration
- Queues (photo processing, upload processing, etc.)

### `dev-notification-proxy` (dev only)
Dev-only infrastructure for local testing:
- Queue: `r2-notification-proxy`
- R2 event notifications (uploads/, logos/)
- Worker: `r2-notification-proxy` (source in `./worker/`, forwards events to ngrok)

## Usage

### Deploy Infrastructure

```bash
cd environments/dev
infisical run --env=dev --path="/terraform" -- tofu apply
```

### Update Dev Notification Proxy Worker

```bash
# 1. Build worker
cd modules/dev-notification-proxy/worker
pnpm build

# 2. Apply changes
cd ../../environments/dev
infisical run --env=dev --path="/terraform" -- tofu apply
```

### Update Dev Webhook URL

```bash
cd environments/dev
vim terraform.tfvars  # Update webhook_url
infisical run --env=dev --path="/terraform" -- tofu apply
```

## Requirements

- OpenTofu >= 1.0
- Infisical CLI (for secrets management)
- Environment variables:
  - `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID`
  - `INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET`

## State Backend

S3-compatible backend (R2) configured via Infisical secrets.
