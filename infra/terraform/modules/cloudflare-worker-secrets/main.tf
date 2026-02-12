# ------------------------------------------------------------------------------
# Cloudflare Worker Secrets Module
#
# Reads external secrets from Infisical, generates internal ones
# (R2 token + random passwords), and pushes everything to a
# Cloudflare Worker via the Workers Secrets REST API.
#
# NOTE: Cloudflare Terraform provider v5 removed the standalone
# cloudflare_workers_secret resource. Secrets are pushed via the
# REST API using terraform_data + local-exec provisioners.
# Secret values are passed via environment variables (never CLI args).
# ------------------------------------------------------------------------------

# ------------------------------------------------------------------------------
# 1. Read secrets from Infisical
# ------------------------------------------------------------------------------

data "infisical_secrets" "worker" {
  env_slug     = var.infisical_env_slug
  workspace_id = var.infisical_project_id
  folder_path  = var.infisical_folder_path
}

# ------------------------------------------------------------------------------
# 2. Generate R2 API token (S3-compatible credentials)
# ------------------------------------------------------------------------------

module "r2_token" {
  source  = "Cyb3r-Jak3/r2-api-token/cloudflare"
  version = "~> 6.0"

  account_id   = var.account_id
  buckets      = var.r2_bucket_names
  bucket_read  = true
  bucket_write = true
  token_name   = "terraform-r2-${var.environment}"
}

# ------------------------------------------------------------------------------
# 3. Generate random passwords for internal secrets
# ------------------------------------------------------------------------------

resource "random_password" "ftp_jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "ftp_password_encryption_key" {
  length  = 64
  special = false
}

resource "random_password" "desktop_access_jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "desktop_refresh_token_pepper" {
  length  = 64
  special = false
}

resource "random_password" "admin_api_key" {
  length  = 32
  special = false
}

# ------------------------------------------------------------------------------
# 4. Assemble all secrets and push to Worker
# ------------------------------------------------------------------------------

locals {
  # External secrets (from Infisical)
  infisical = data.infisical_secrets.worker.secrets

  external_secrets = {
    DATABASE_URL                 = local.infisical["DATABASE_URL"].value
    CLERK_SECRET_KEY             = local.infisical["CLERK_SECRET_KEY"].value
    CLERK_PUBLISHABLE_KEY        = local.infisical["CLERK_PUBLISHABLE_KEY"].value
    CLERK_JWT_KEY                = local.infisical["CLERK_JWT_KEY"].value
    CLERK_WEBHOOK_SIGNING_SECRET = local.infisical["CLERK_WEBHOOK_SIGNING_SECRET"].value
    AWS_ACCESS_KEY_ID            = local.infisical["AWS_ACCESS_KEY_ID"].value
    AWS_SECRET_ACCESS_KEY        = local.infisical["AWS_SECRET_ACCESS_KEY"].value
    STRIPE_SECRET_KEY            = local.infisical["STRIPE_SECRET_KEY"].value
    STRIPE_WEBHOOK_SECRET        = local.infisical["STRIPE_WEBHOOK_SECRET"].value
  }

  # Optional secrets (only include if present in Infisical)
  optional_keys = ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN"]
  optional_secrets = {
    for k in local.optional_keys : k => local.infisical[k].value
    if contains(keys(local.infisical), k)
  }

  # Terraform-generated secrets
  generated_secrets = {
    R2_ACCESS_KEY_ID             = module.r2_token.id
    R2_SECRET_ACCESS_KEY         = module.r2_token.secret
    FTP_JWT_SECRET               = random_password.ftp_jwt_secret.result
    FTP_PASSWORD_ENCRYPTION_KEY  = random_password.ftp_password_encryption_key.result
    DESKTOP_ACCESS_JWT_SECRET    = random_password.desktop_access_jwt_secret.result
    DESKTOP_REFRESH_TOKEN_PEPPER = random_password.desktop_refresh_token_pepper.result
    ADMIN_API_KEY                = random_password.admin_api_key.result
  }

  all_secrets = merge(local.external_secrets, local.optional_secrets, local.generated_secrets)
}

# Push each secret via Cloudflare Workers Secrets REST API.
# Uses terraform_data so each secret is tracked individually in state.
# Re-provisions when the secret value changes (detected via sha256 hash).
# Secret values are passed via environment variables to avoid CLI exposure.
resource "terraform_data" "worker_secret" {
  for_each = local.all_secrets

  triggers_replace = sha256(each.value)

  provisioner "local-exec" {
    command = <<-EOF
      curl -sf -X PUT \
        "https://api.cloudflare.com/client/v4/accounts/${var.account_id}/workers/scripts/${var.worker_script_name}/secrets" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$SECRET_PAYLOAD" > /dev/null
    EOF

    environment = {
      SECRET_PAYLOAD = jsonencode({
        name = each.key
        text = each.value
        type = "secret_text"
      })
    }
  }
}
