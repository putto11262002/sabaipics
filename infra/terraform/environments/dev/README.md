# Dev Environment

Fully managed dev infrastructure including worker deployment.

## Quick Start

```bash
# Deploy everything
infisical run --env=dev --path="/terraform" -- tofu apply

# Update worker code
cd ../../modules/dev-notification-proxy/worker
pnpm build
cd -
infisical run --env=dev --path="/terraform" -- tofu apply

# Update webhook URL
vim terraform.tfvars  # Change webhook_url
infisical run --env=dev --path="/terraform" -- tofu apply
```

## Managed Resources

- R2 bucket: `framefast-photos-dev`
- Queues: processing, upload, logo, rekognition (+ DLQs)
- Queue: `r2-notification-proxy` (dev testing)
- R2 event notifications → `r2-notification-proxy`
- Worker: `r2-notification-proxy` (source in `modules/dev-notification-proxy/worker/`)

## Configuration

`terraform.tfvars` - Non-secret configuration (safe to commit)

Secrets injected via Infisical from `/terraform` path.
