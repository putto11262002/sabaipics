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

1. Validate required secrets (fail-fast)
2. Run database migrations
3. Set Worker secrets via `wrangler secret put`
4. Deploy Worker via `wrangler deploy --env staging`

### Staging Dashboard/Event (`deploy-staging-*.yml`)

Triggers: Push to `master` with changes in respective app/package paths

Steps:

1. Create `.env.staging` with `VITE_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY`
2. Build API (for TypeScript types)
3. Build app with `--mode staging`
4. Deploy to Pages with `--branch=staging`

### Production Workflows

Same as staging but:

- **Trigger**: Manual `workflow_dispatch` only
- **Environment**: `production` (can require approvals)
- **Branch**: `--branch=main` for Pages

## Secrets

All secrets are stored in GitHub repository settings under Environments (`staging`, `production`).

### Required Secrets

| Secret                         | Used By               | Description              |
| ------------------------------ | --------------------- | ------------------------ |
| `CLOUDFLARE_API_TOKEN`         | All                   | CF API access            |
| `CLOUDFLARE_ACCOUNT_ID`        | All                   | CF account               |
| `DATABASE_URL`                 | API                   | Neon connection string   |
| `CLERK_SECRET_KEY`             | API                   | Clerk backend key        |
| `CLERK_PUBLISHABLE_KEY`        | API, Dashboard, Event | Clerk frontend key       |
| `CLERK_JWT_KEY`                | API                   | JWT verification         |
| `CLERK_WEBHOOK_SIGNING_SECRET` | API                   | Webhook validation       |
| `AWS_ACCESS_KEY_ID`            | API                   | Rekognition access       |
| `AWS_SECRET_ACCESS_KEY`        | API                   | Rekognition secret       |
| `STRIPE_SECRET_KEY`            | API                   | Stripe backend key       |
| `STRIPE_WEBHOOK_SECRET`        | API                   | Webhook validation       |
| `R2_ACCESS_KEY_ID`             | API                   | R2 S3-compatible access  |
| `R2_SECRET_ACCESS_KEY`         | API                   | R2 S3-compatible secret  |
| `ADMIN_API_KEY`                | API                   | Internal admin endpoints |
| `FTP_JWT_SECRET`               | API                   | FTP token signing key    |
| `FTP_PASSWORD_ENCRYPTION_KEY`  | API                   | FTP password encryption  |

### Optional Secrets

| Secret                      | Description                         |
| --------------------------- | ----------------------------------- |
| `LINE_CHANNEL_SECRET`       | LINE integration (warns if missing) |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE integration (warns if missing) |
| `NEON_PROJECT_ID`           | Enables PR preview databases        |
| `NEON_API_KEY`              | Enables PR preview databases        |

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
