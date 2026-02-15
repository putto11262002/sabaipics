# ------------------------------------------------------------------------------
# Production Environment - Cloudflare Infrastructure
# ------------------------------------------------------------------------------

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    infisical = {
      source  = "Infisical/infisical"
      version = ">= 0.7.0"
    }
  }
}

# ------------------------------------------------------------------------------
# Provider Configuration
# Reads CLOUDFLARE_API_TOKEN from environment variable
# ------------------------------------------------------------------------------

provider "cloudflare" {
  # API token is read from CLOUDFLARE_API_TOKEN env var
}

provider "infisical" {
  host = "https://app.infisical.com"
  # Auth via INFISICAL_UNIVERSAL_AUTH_CLIENT_ID +
  #          INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET env vars
}

# ------------------------------------------------------------------------------
# Cloudflare Infrastructure Module
# ------------------------------------------------------------------------------

module "cloudflare_infra" {
  source = "../../modules/cloudflare-infra"

  account_id  = var.account_id
  environment = var.environment
  zone_id     = var.zone_id

  # R2 Bucket
  photos_bucket_name     = var.photos_bucket_name
  photos_bucket_location = var.photos_bucket_location

  # R2 Custom Domain
  photo_domain = var.photo_domain

  # CORS (using defaults from module, override if needed)
  cors_allowed_origins = var.cors_allowed_origins
  cors_allowed_methods = var.cors_allowed_methods
  cors_allowed_headers = var.cors_allowed_headers
  cors_expose_headers  = var.cors_expose_headers
  cors_max_age_seconds = var.cors_max_age_seconds

  # Queues
  queues = var.queues

  # Event Notifications
  bucket_notifications = var.bucket_notifications
}

# ------------------------------------------------------------------------------
# Worker Secrets Module
# Reads external secrets from Infisical, generates R2 token + random passwords,
# and pushes everything to the production Worker.
# ------------------------------------------------------------------------------

module "worker_secrets" {
  source = "../../modules/cloudflare-worker-secrets"

  account_id            = var.account_id
  environment           = var.environment
  worker_script_name    = var.worker_script_name
  r2_bucket_names       = [module.cloudflare_infra.photos_bucket_name]
  infisical_project_id  = var.infisical_project_id
  infisical_env_slug    = "prod"
  infisical_folder_path = "/"
}
