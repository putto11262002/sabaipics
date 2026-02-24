# Multi-Environment CI/CD

## Environment Matrix

| Environment | API Domain                | Dashboard Domain          | Neon Branch | Git Trigger           |
| ----------- | ------------------------- | ------------------------- | ----------- | --------------------- |
| Development | localhost:8081            | localhost:5173            | `dev`       | local                 |
| Staging     | api-staging.sabaipics.com | app-staging.sabaipics.com | `staging`   | Auto on `master` push |
| Production  | api.sabaipics.com         | app.sabaipics.com         | `main`      | Manual dispatch       |

---

## GitHub Actions Workflows

### deploy-staging.yml

- Triggers on `master` push
- Uses GitHub Environment: `stage`
- Steps:
  1. Checkout + setup Node/pnpm
  2. Run database migrations
  3. Create `.env.staging` from secrets
  4. Build all packages
  5. Deploy API to Workers (`--env staging`)
  6. Set API secrets via wrangler
  7. Deploy Dashboard to Pages (`--branch=staging`)

### deploy-production.yml

- Triggers on `workflow_dispatch` (manual)
- Uses GitHub Environment: `production`
- Same steps as staging but with `--env production`

---

## GitHub Environment Secrets

### Environment: `stage`

| Secret                         | Description                      |
| ------------------------------ | -------------------------------- |
| `CLOUDFLARE_API_TOKEN`         | Wrangler deploy token            |
| `CLOUDFLARE_ACCOUNT_ID`        | Account ID                       |
| `DATABASE_URL`                 | Neon staging connection string   |
| `CLERK_SECRET_KEY`             | Dev/staging Clerk secret         |
| `CLERK_PUBLISHABLE_KEY`        | Dev/staging Clerk publishable    |
| `CLERK_JWT_KEY`                | Dev/staging JWT public key (PEM) |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Staging webhook secret           |

### Environment: `production`

- Same secrets with production values
- Enable "Required reviewers" protection rule

---

## Wrangler Configuration

### API (apps/api/wrangler.jsonc)

```jsonc
{
  "env": {
    "staging": {
      "vars": {
        "CORS_ORIGIN": "https://app-staging.sabaipics.com",
        "AUTHORIZED_PARTIES": "https://app-staging.sabaipics.com",
      },
      "routes": [
        {
          "pattern": "api-staging.sabaipics.com",
          "zone_name": "sabaipics.com",
          "custom_domain": true,
        },
      ],
    },
    "production": {
      "vars": {
        "CORS_ORIGIN": "https://app.sabaipics.com",
        "AUTHORIZED_PARTIES": "https://app.sabaipics.com",
      },
      "routes": [
        {
          "pattern": "api.sabaipics.com",
          "zone_name": "sabaipics.com",
          "custom_domain": true,
        },
      ],
    },
  },
}
```

### Dashboard Deploy Scripts

```json
{
  "deploy:staging": "pnpm build:staging && wrangler pages deploy dist --project-name=dashboard --branch=staging",
  "deploy:prod": "pnpm build:prod && wrangler pages deploy dist --project-name=dashboard --branch=main"
}
```

---

## Custom Domains Setup

### API (Workers) - Automatic

Custom domains configured in `wrangler.jsonc`, created on first deploy.

### Dashboard (Pages) - Manual

1. Cloudflare Dashboard → Workers & Pages → `dashboard`
2. Custom domains → Add domain
3. `app-staging.sabaipics.com` → CNAME to `staging.dashboard.pages.dev`
4. `app.sabaipics.com` → CNAME to `dashboard.pages.dev`

---

## Vite Build Modes

Dashboard uses `--mode` flag to load correct env file:

```bash
vite build --mode staging     # Uses .env.staging
vite build --mode production  # Uses .env.production
```

Env files created from secrets during CI (not committed):

```yaml
- name: Create Dashboard Env
  run: |
    echo "VITE_API_URL=https://api-staging.sabaipics.com" >> apps/dashboard/.env.staging
    echo "VITE_CLERK_PUBLISHABLE_KEY=${{ secrets.CLERK_PUBLISHABLE_KEY }}" >> apps/dashboard/.env.staging
```

---

## Deploy Commands

```bash
# Manual staging deploy (normally auto on push)
gh workflow run deploy-staging.yml

# Manual production deploy
gh workflow run deploy-production.yml

# Check deploy status
gh run list --limit 5
```

---

## Docs

- Cloudflare Workers Custom Domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Cloudflare Pages Custom Domains: https://developers.cloudflare.com/pages/configuration/custom-domains/
- GitHub Environments: https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment
- Vite Env Modes: https://vite.dev/guide/env-and-mode
