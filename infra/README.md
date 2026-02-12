# Infrastructure

Terraform-managed Cloudflare infrastructure and secrets for FrameFast.

## Design

### Two-module architecture

```
infra/terraform/
├── modules/
│   ├── cloudflare-infra/           # R2 buckets, queues, CORS, custom domains, event notifications
│   └── cloudflare-worker-secrets/  # Reads Infisical → generates R2 tokens + random passwords → pushes to Worker
├── environments/
│   ├── dev/
│   ├── staging/
│   └── production/
```

Each environment instantiates both modules with environment-specific values.

### Secrets flow

Infisical secrets are organized into **folder paths** to separate concerns:

```
Infisical project: frame-fast-pu-xi
├── / (root)                         # Application secrets
│   ├── DATABASE_URL                 ├── /terraform              # IaC secrets
│   ├── CLERK_*                      │   ├── CLOUDFLARE_API_TOKEN
│   ├── AWS_* (Rekognition)          │   ├── AWS_ACCESS_KEY_ID   (R2 backend)
│   ├── STRIPE_*                     │   └── AWS_SECRET_ACCESS_KEY (R2 backend)
│   └── LINE_* (optional)            │
│                                    │
│   Terraform-generated              │
│   ├── R2_ACCESS_KEY_ID             │
│   ├── R2_SECRET_ACCESS_KEY         │
│   ├── ADMIN_API_KEY                │
│   ├── FTP_JWT_SECRET               │
│   ├── FTP_PASSWORD_ENCRYPTION_KEY  │
│   ├── DESKTOP_ACCESS_JWT_SECRET    │
│   └── DESKTOP_REFRESH_TOKEN_PEPPER │
│             │                      │
│             ▼                      │
│   Cloudflare Workers Secrets API   │
│   (PUT per secret, tracked in TF)  │
│                                    │
└────────────────────────────────────┘
```

- **`/` (root)** — App secrets read by Terraform's `infisical_secrets` data source and CI/CD workflows.
- **`/terraform`** — IaC credentials injected via `infisical run --path="/terraform"` at plan/apply time. These never reach the Worker.

External secrets live in Infisical and are never stored in Terraform state as plaintext — they pass through `data.infisical_secrets` at plan/apply time. Generated secrets (random passwords, R2 tokens) are in state.

### What Terraform manages vs. what it doesn't

| Managed by Terraform | NOT managed by Terraform |
|---|---|
| R2 buckets, CORS, custom domains | Worker scripts (deployed by wrangler via CI) |
| Queues + event notifications | DNS records (Cloudflare dashboard) |
| Worker secrets (pushed via API) | Pages projects (deployed by wrangler via CI) |
| R2 API tokens | FTP server (Docker/SSH, separate workflow) |

### CI integration

CI workflows use `Infisical/secrets-action` to inject env vars (CLOUDFLARE_API_TOKEN, DATABASE_URL, etc.) at deploy time. Worker secrets are **not** set by CI — Terraform owns them.

Only two GitHub secrets are needed per environment:
- `INFISICAL_CLIENT_ID` — Infisical Machine Identity
- `INFISICAL_CLIENT_SECRET` — Infisical Machine Identity

## Governance

### State

State is stored remotely in the `framefast-tf-state` R2 bucket using Terraform's S3-compatible backend. Each environment has a separate state key:

| Environment | Key |
|---|---|
| dev | `cloudflare/dev.tfstate` |
| staging | `cloudflare/staging.tfstate` |
| production | `cloudflare/production.tfstate` |

R2 does not support state locking — avoid concurrent `terraform apply` runs.

### Who runs Terraform

Terraform is run **manually** from a developer machine. There is no CI-driven plan/apply yet.

```bash
cd infra/terraform/environments/production

# /terraform path injects CLOUDFLARE_API_TOKEN + AWS_ACCESS_KEY_ID/SECRET (R2 backend)
# INFISICAL_UNIVERSAL_AUTH_* must be set separately (chicken-and-egg)
export INFISICAL_UNIVERSAL_AUTH_CLIENT_ID=...
export INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET=...

infisical run --env=prod --path="/terraform" -- terraform plan
infisical run --env=prod --path="/terraform" -- terraform apply
```

### Adding a new secret

1. Add the secret value to Infisical (in the appropriate environment)
2. If it's an **external secret**: add it to `local.external_secrets` in `modules/cloudflare-worker-secrets/main.tf`
3. If it's a **generated secret**: add a `random_password` resource and add it to `local.generated_secrets`
4. Run `terraform apply` for each environment (staging, then production)

### Adding new infra (bucket, queue, etc.)

1. Add the resource to `modules/cloudflare-infra/main.tf`
2. Expose any needed variables/outputs
3. Wire it up in each environment's `main.tf`
4. Run `terraform plan` to verify, then `terraform apply`

### Destroying resources

Never run `terraform destroy` without understanding the blast radius. Prefer targeted removal:

```bash
terraform state rm 'module.cloudflare_infra.cloudflare_queue.queues["some_queue"]'
```
