# Terraform Migration Plan: Cloudflare Infrastructure

## Overview

Migrate `scripts/infra/cloudflare-provision.sh` to Terraform for declarative, version-controlled infrastructure.

---

## Resources to Migrate

| Resource               | Current Method                           | Terraform Resource                        | Status                |
| ---------------------- | ---------------------------------------- | ----------------------------------------- | --------------------- |
| R2 Buckets             | `wrangler r2 bucket create`              | `cloudflare_r2_bucket`                    | ✅ Supported          |
| Queues                 | `wrangler queues create`                 | `cloudflare_queue`                        | ✅ Supported          |
| R2 CORS                | `wrangler r2 bucket cors set`            | `cloudflare_r2_bucket_cors`               | ✅ Supported          |
| R2 Event Notifications | `wrangler r2 bucket notification create` | `cloudflare_r2_bucket_event_notification` | ✅ Supported (v5.13+) |
| R2 Custom Domains      | `wrangler r2 bucket domain add`          | `cloudflare_r2_custom_domain`             | ✅ Supported          |

All features are natively supported by the Cloudflare Terraform provider v5.13+.

---

## Directory Structure

```
infra/terraform/
├── environments/
│   └── staging/
│       ├── main.tf           # Module instantiation
│       ├── variables.tf      # Variable declarations
│       ├── terraform.tfvars  # Non-secret config values
│       ├── outputs.tf        # Output values
│       └── backend.tf        # State backend config
├── modules/
│   └── cloudflare-infra/
│       ├── main.tf           # Resource definitions
│       ├── variables.tf      # Input variables
│       └── outputs.tf        # Module outputs
├── .gitignore
└── PLAN.md (this file)
```

---

## Prerequisites

### 1. Get Your Zone ID

You need the Cloudflare Zone ID for `sabaipics.com`. Get it from:

```bash
# Using wrangler
pnpm --filter=@sabaipics/api exec wrangler zones list | grep sabaipics

# Or via API
curl -X GET "https://api.cloudflare.com/client/v4/zones?name=sabaipics.com" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" | jq '.result[0].id'
```

Then update `environments/staging/terraform.tfvars`:

```hcl
zone_id = "YOUR_ZONE_ID_HERE"
```

### 2. Set Environment Variables

```bash
export CLOUDFLARE_API_TOKEN="your-wrangler-token"
```

### 3. Install Terraform

```bash
# macOS
brew install terraform

# Verify
terraform --version
```

---

## Dry Run: Import Existing Staging Resources

### Step 1: Initialize Terraform

```bash
cd infra/terraform/environments/staging
terraform init
```

This downloads the Cloudflare provider and initializes the backend.

### Step 2: Get Queue IDs (needed for import)

Terraform import requires resource IDs. Get them first:

```bash
# List all queues to get their IDs
curl -X GET "https://api.cloudflare.com/client/v4/accounts/ac76d647241fb6b589f88fe88d0e4a08/queues" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" | jq '.result[] | {name: .queue_name, id: .queue_id}'
```

Save the queue IDs - you'll need them for import.

### Step 3: Import Existing Resources

Import commands tell Terraform "this resource already exists, take ownership":

```bash
cd infra/terraform/environments/staging

# Import R2 Bucket
terraform import 'module.cloudflare_infra.cloudflare_r2_bucket.photos' \
  'ac76d647241fb6b589f88fe88d0e4a08/sabaipics-photos-staging'

# Import Queues (replace QUEUE_ID with actual IDs from Step 2)
terraform import 'module.cloudflare_infra.cloudflare_queue.queues["photo_processing"]' \
  'ac76d647241fb6b589f88fe88d0e4a08/QUEUE_ID'

terraform import 'module.cloudflare_infra.cloudflare_queue.queues["photo_processing_dlq"]' \
  'ac76d647241fb6b589f88fe88d0e4a08/QUEUE_ID'

terraform import 'module.cloudflare_infra.cloudflare_queue.queues["rekognition_cleanup"]' \
  'ac76d647241fb6b589f88fe88d0e4a08/QUEUE_ID'

terraform import 'module.cloudflare_infra.cloudflare_queue.queues["rekognition_cleanup_dlq"]' \
  'ac76d647241fb6b589f88fe88d0e4a08/QUEUE_ID'

terraform import 'module.cloudflare_infra.cloudflare_queue.queues["upload_processing"]' \
  'ac76d647241fb6b589f88fe88d0e4a08/QUEUE_ID'

terraform import 'module.cloudflare_infra.cloudflare_queue.queues["upload_processing_dlq"]' \
  'ac76d647241fb6b589f88fe88d0e4a08/QUEUE_ID'

terraform import 'module.cloudflare_infra.cloudflare_queue.queues["logo_processing"]' \
  'ac76d647241fb6b589f88fe88d0e4a08/QUEUE_ID'

terraform import 'module.cloudflare_infra.cloudflare_queue.queues["logo_processing_dlq"]' \
  'ac76d647241fb6b589f88fe88d0e4a08/QUEUE_ID'
```

**Note:** CORS, Event Notifications, and Custom Domains may need to be re-created by Terraform (they don't have straightforward import paths). The `terraform plan` will show what will be added.

### Step 4: Dry Run - Check What Terraform Sees

```bash
# Show what Terraform would do (NO CHANGES MADE)
terraform plan
```

Expected output:

- Imported resources should show "no changes"
- CORS, notifications, domains may show "will be created" (that's OK)

### Step 5: Review the Plan

If `terraform plan` shows:

- **No changes** for buckets/queues → Import worked perfectly
- **Create** for CORS/notifications/domains → Expected (will recreate these)
- **Destroy** anything → STOP and investigate

---

## Apply (After Dry Run Approval)

Only run this after reviewing the plan:

```bash
terraform apply
```

This will:

1. Create CORS rules (replacing wrangler-managed ones)
2. Create event notifications
3. Set up custom domain binding

---

## Rollback

If something goes wrong:

```bash
# Remove Terraform state without destroying resources
terraform state rm 'module.cloudflare_infra.cloudflare_r2_bucket.photos'

# Or destroy and recreate via wrangler
bash scripts/infra/cloudflare-provision.sh staging --with-domains
```

---

## Known Issues

| Resource            | Issue                               | Workaround                                        |
| ------------------- | ----------------------------------- | ------------------------------------------------- |
| R2 Bucket           | Location hint may force replacement | Set `photos_bucket_location = "APAC"` explicitly  |
| Custom Domain       | May need double-apply               | Run `terraform apply` twice if domain not enabled |
| Event Notifications | Queue ID required                   | Must import queues before creating notifications  |

---

## Next Steps After Staging

1. Verify staging works for 1-2 days
2. Create `environments/production/` with prod values
3. Import production resources
4. Add GitHub Actions for automated plan/apply (optional)

---

## Quick Reference

```bash
# Initialize
cd infra/terraform/environments/staging
terraform init

# Plan (dry run)
terraform plan

# Apply
terraform apply

# Show current state
terraform show

# List managed resources
terraform state list

# Destroy (DANGER)
terraform destroy
```
