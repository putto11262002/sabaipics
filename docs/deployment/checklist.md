# Deployment Checklist

## New Environment Setup

### 1. Cloudflare Infrastructure

```bash
# Provision queues, R2 bucket, CORS, notifications
bash scripts/infra/cloudflare-provision.sh <staging|production>

# Optional: Add R2 custom domain
R2_ZONE_ID=<zone-id> bash scripts/infra/cloudflare-provision.sh <env> --with-domains
```

**Verify:**

- [ ] Queues created (6 total)
- [ ] R2 bucket exists
- [ ] R2 CORS configured
- [ ] R2 notification → upload queue

### 2. Cloudflare Pages Projects

Create in Cloudflare Dashboard or via CLI:

**Dashboard project:**

- [ ] Create Pages project named `dashboard`
- [ ] Add custom domain: `app[-staging].sabaipics.com`
- [ ] Configure branch: `staging` or `main`

**Event project:**

- [ ] Create Pages project named `event`
- [ ] Add custom domain: `event[-staging].sabaipics.com`
- [ ] Configure branch: `staging` or `main`

### 3. GitHub Environment Secrets

Go to: Repository → Settings → Environments → `<staging|production>`

**Required:**

- [ ] `CLOUDFLARE_API_TOKEN`
- [ ] `CLOUDFLARE_ACCOUNT_ID`
- [ ] `DATABASE_URL`
- [ ] `CLERK_SECRET_KEY`
- [ ] `CLERK_PUBLISHABLE_KEY`
- [ ] `CLERK_JWT_KEY`
- [ ] `CLERK_WEBHOOK_SIGNING_SECRET`
- [ ] `AWS_ACCESS_KEY_ID`
- [ ] `AWS_SECRET_ACCESS_KEY`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `R2_ACCESS_KEY_ID`
- [ ] `R2_SECRET_ACCESS_KEY`
- [ ] `ADMIN_API_KEY`

**Optional:**

- [ ] `LINE_CHANNEL_SECRET`
- [ ] `LINE_CHANNEL_ACCESS_TOKEN`

### 4. External Services

**Clerk:**

- [ ] Create application for environment
- [ ] Configure allowed origins (dashboard, event URLs)
- [ ] Set up webhook: `https://api[-staging].sabaipics.com/webhooks/clerk`

**Stripe:**

- [ ] Get API keys for environment
- [ ] Configure webhook: `https://api[-staging].sabaipics.com/webhooks/stripe`
- [ ] Set up products/prices

**AWS Rekognition:**

- [ ] IAM user with Rekognition permissions
- [ ] Region: `us-west-2`

**Neon Database:**

- [ ] Create database branch for environment
- [ ] Get connection string

### 5. DNS Records

In Cloudflare DNS (all proxied):

- [ ] `api[-staging].sabaipics.com` - auto-configured by Worker route
- [ ] `app[-staging].sabaipics.com` - CNAME to Pages
- [ ] `event[-staging].sabaipics.com` - CNAME to Pages
- [ ] `photo[s-staging].sabaipics.com` - R2 custom domain

---

## Deploying Changes

### To Staging (Automatic)

1. Create PR against `master`
2. Wait for CI checks to pass
3. Merge PR
4. Relevant staging workflows trigger automatically based on changed paths

**Verify:**

```bash
gh run list --limit 5
```

### To Production (Manual)

1. Ensure staging is verified and working
2. Trigger production workflows:

```bash
# Deploy all
gh workflow run "Deploy Production API" --ref master
gh workflow run "Deploy Production Dashboard" --ref master
gh workflow run "Deploy Production Event" --ref master
```

3. Monitor deployments:

```bash
gh run list --workflow="Deploy Production API" --limit 1
gh run watch <run-id>
```

---

## Rollback

### Worker (API)

```bash
# List recent deployments
cd apps/api
pnpm wrangler deployments list --env <staging|production>

# Rollback to previous
pnpm wrangler rollback --env <staging|production>
```

### Pages (Dashboard/Event)

Use Cloudflare Dashboard:

1. Go to Pages project
2. Deployments tab
3. Click "..." on previous deployment
4. "Rollback to this deployment"

### Database

Neon supports point-in-time recovery. Use Neon Dashboard to restore.

---

## Troubleshooting

### Build Fails: Worker Types Missing

```
error TS2339: Property 'DATABASE_URL' does not exist on type 'Env'
```

**Fix:** Regenerate and commit worker types:

```bash
cd apps/api
pnpm cf-typegen
git add worker-configuration.d.ts
git commit -m "chore: regenerate worker types"
```

### Deploy Fails: Missing Secret

```
Missing required secret: STRIPE_SECRET_KEY
```

**Fix:** Add secret to GitHub environment (Repository → Settings → Environments)

### Migration Fails: Schema Conflict

```
column "X" already exists
```

**Fix:** Database schema out of sync with migrations. Options:

1. Reset migrations: `pnpm --filter=@sabaipics/db db:generate` (destructive)
2. Manually fix migration file
3. Use Neon branching to test migrations first

### Pages Deploy Fails: Project Not Found

```
Project not found
```

**Fix:** Create Pages project in Cloudflare Dashboard first, named exactly as referenced in workflow (`dashboard` or `event`).

---

## Health Checks

After deployment, verify:

- [ ] API responds: `curl https://api[-staging].sabaipics.com/health`
- [ ] Dashboard loads: `https://app[-staging].sabaipics.com`
- [ ] Event loads: `https://event[-staging].sabaipics.com`
- [ ] Auth works: Can sign in/out
- [ ] Photo upload works: Upload → Queue → Face detection
- [ ] Photo download works: View/download photos
