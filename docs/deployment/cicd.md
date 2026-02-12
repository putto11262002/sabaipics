# CI/CD Workflows

GitHub Actions handles all CI/CD. Workflows live in `.github/workflows/`.

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Pull Request                                    │
│                                                                              │
│   ┌──────────────┐                                                          │
│   │  ci.yml      │  Build, lint, test + Neon preview branch (if configured) │
│   │  (PR Checks) │                                                          │
│   └──────────────┘                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ merge to master
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Staging (Auto-deploy)                                │
│                                                                              │
│   ┌────────────────────────┐  Path: apps/api/**, packages/db/**,            │
│   │ deploy-staging-api.yml │        packages/auth/**                        │
│   └────────────────────────┘                                                │
│                                                                              │
│   ┌──────────────────────────────┐  Path: apps/dashboard/**,                │
│   │ deploy-staging-dashboard.yml │        packages/ui/**, packages/uiv2/**  │
│   └──────────────────────────────┘                                          │
│                                                                              │
│   ┌──────────────────────────┐  Path: apps/event/**,                        │
│   │ deploy-staging-event.yml │        packages/ui/**, packages/uiv2/**      │
│   └──────────────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ manual trigger
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Production (Manual dispatch)                            │
│                                                                              │
│   ┌─────────────────────────┐                                               │
│   │ deploy-production-api.yml │  workflow_dispatch only                     │
│   └─────────────────────────┘                                               │
│                                                                              │
│   ┌───────────────────────────────┐                                         │
│   │ deploy-production-dashboard.yml │  workflow_dispatch only               │
│   └───────────────────────────────┘                                         │
│                                                                              │
│   ┌───────────────────────────┐                                             │
│   │ deploy-production-event.yml │  workflow_dispatch only                   │
│   └───────────────────────────┘                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Workflow Details

### PR Checks (`ci.yml`)

Runs on every pull request:

1. **Build** - `pnpm build` (turbo, all packages)
2. **Lint** - ESLint across codebase
3. **Test** - Vitest unit tests
4. **Neon Preview** - Creates preview DB branch per PR (if `NEON_PROJECT_ID` configured)

### Staging API (`deploy-staging-api.yml`)

Triggers: Push to `master` with changes in `apps/api/**`, `packages/db/**`, `packages/auth/**`

Steps:

1. Inject secrets from Infisical (`staging` env)
2. Run database migrations
3. Deploy Worker via `wrangler deploy --env staging`

Worker secrets are managed by Terraform (`infra/terraform/modules/cloudflare-worker-secrets`), not CI.

### Staging Dashboard/Event (`deploy-staging-*.yml`)

Triggers: Push to `master` with changes in respective app/package paths

Steps:

1. Inject secrets from Infisical (`staging` env)
2. Create `.env.staging` with `VITE_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY`
3. Build API (for TypeScript types)
4. Build app with `--mode staging`
5. Deploy to Pages with `--branch=staging`

### Production Workflows

Same as staging but:

- **Trigger**: Manual `workflow_dispatch` only
- **Environment**: `production` (can require approvals)
- **Infisical env**: `prod`
- **Branch**: `--branch=main` for Pages

## Secrets Management

Secrets are managed via **Infisical** (project: `frame-fast-pu-xi`) and **Terraform**.

### How it works

1. **External secrets** (DATABASE_URL, Clerk, Stripe, AWS, etc.) are stored in Infisical
2. **Terraform** reads from Infisical, generates internal secrets (R2 tokens, random passwords), and pushes all Worker secrets via the Cloudflare API
3. **CI workflows** use `Infisical/secrets-action` to inject env vars at deploy time (for migrations, wrangler auth, build-time env vars)

### Terraform-managed secrets (pushed to Worker)

| Secret                         | Source     | Description                          |
| ------------------------------ | ---------- | ------------------------------------ |
| `DATABASE_URL`                 | Infisical  | Neon connection string               |
| `CLERK_SECRET_KEY`             | Infisical  | Clerk backend key                    |
| `CLERK_PUBLISHABLE_KEY`        | Infisical  | Clerk frontend key                   |
| `CLERK_JWT_KEY`                | Infisical  | JWT verification                     |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Infisical  | Webhook validation                   |
| `AWS_ACCESS_KEY_ID`            | Infisical  | Rekognition access                   |
| `AWS_SECRET_ACCESS_KEY`        | Infisical  | Rekognition secret                   |
| `STRIPE_SECRET_KEY`            | Infisical  | Stripe backend key                   |
| `STRIPE_WEBHOOK_SECRET`        | Infisical  | Webhook validation                   |
| `R2_ACCESS_KEY_ID`             | Terraform  | R2 S3-compatible access (generated)  |
| `R2_SECRET_ACCESS_KEY`         | Terraform  | R2 S3-compatible secret (generated)  |
| `ADMIN_API_KEY`                | Terraform  | Internal admin endpoints (generated) |
| `FTP_JWT_SECRET`               | Terraform  | FTP token signing key (generated)    |
| `FTP_PASSWORD_ENCRYPTION_KEY`  | Terraform  | FTP password encryption (generated)  |
| `DESKTOP_ACCESS_JWT_SECRET`    | Terraform  | Desktop access JWT (generated)       |
| `DESKTOP_REFRESH_TOKEN_PEPPER` | Terraform  | Desktop refresh hashing (generated)  |

### GitHub secrets (minimal)

Only bootstrap secrets remain in GitHub:

| Secret                    | Environment       | Description                    |
| ------------------------- | ----------------- | ------------------------------ |
| `INFISICAL_CLIENT_ID`     | staging/production | Infisical Machine Identity ID  |
| `INFISICAL_CLIENT_SECRET` | staging/production | Infisical Machine Identity key |
| `NEON_API_KEY`             | (repo-level)      | Neon preview branches in CI    |

### Optional secrets (Infisical)

| Secret                      | Description                         |
| --------------------------- | ----------------------------------- |
| `LINE_CHANNEL_SECRET`       | LINE integration (skipped if empty) |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE integration (skipped if empty) |

### Running Terraform locally

```bash
# Staging
cd infra/terraform/environments/staging
infisical run --env=staging -- terraform plan
infisical run --env=staging -- terraform apply

# Production
cd infra/terraform/environments/production
infisical run --env=prod -- terraform plan
infisical run --env=prod -- terraform apply
```

## Triggering Deploys

### Staging

Automatic on push to `master`. Can also manually trigger:

```bash
gh workflow run "Deploy Staging API" --ref master
gh workflow run "Deploy Staging Dashboard" --ref master
gh workflow run "Deploy Staging Event" --ref master
```

### Production

Manual only:

```bash
gh workflow run "Deploy Production API" --ref master
gh workflow run "Deploy Production Dashboard" --ref master
gh workflow run "Deploy Production Event" --ref master
```

## Monitoring Deploys

```bash
# List recent runs
gh run list --limit 10

# Watch a specific run
gh run watch <run-id>

# View failed run logs
gh run view <run-id> --log-failed
```
