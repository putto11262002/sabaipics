# Neon Preview Branches + Split Staging Deploys

## Goals

- Let devs ship slices fast without stepping on a shared staging DB.
- Make staging deploys component-scoped: `api+db` independent from `dashboard`.

---

## PR Workflow (Neon Preview DB)

- GitHub Action: `.github/workflows/ci.yml`
- Triggers on PR open/reopen/sync and PR close.
- On PR updates:
  - Runs build + unit tests
  - Creates a Neon preview branch `preview/pr-<num>-<branch>` (if `NEON_*` configured)
  - Runs Drizzle migrations against the preview branch
- On PR close:
  - Deletes the preview branch

Neon setup (via Neon GitHub integration or manual):

- `secrets.NEON_API_KEY`
- `vars.NEON_PROJECT_ID`

---

## Staging Deploy (Split)

### API + DB

- Workflow: `.github/workflows/deploy-staging-api.yml`
- Trigger: `master` push (paths: `apps/api/**`, `packages/db/**`, `packages/auth/**`)
- Steps:
  - Run API unit tests
  - Run DB migrations (staging `DATABASE_URL`)
  - Set Worker secrets
  - Deploy API to Workers (`--env staging`)

### Dashboard

- Workflow: `.github/workflows/deploy-staging-dashboard.yml`
- Trigger: `master` push (paths: `apps/dashboard/**`, shared UI packages)
- Steps:
  - Create dashboard `.env.staging`
  - Deploy to Cloudflare Pages (`--branch=staging`)

---

## Legacy

- `.github/workflows/deploy-staging.yml` is removed.

---

## Infra Provisioning

- Cloudflare Queues provisioning is separated from deploy.
- Run locally:
  - `pnpm --filter=@sabaipics/api infra:staging`
  - `pnpm --filter=@sabaipics/api infra:prod`
