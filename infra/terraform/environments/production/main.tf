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
  }
}

# ------------------------------------------------------------------------------
# Provider Configuration
# Reads CLOUDFLARE_API_TOKEN from environment variable
# ------------------------------------------------------------------------------

provider "cloudflare" {
  # API token is read from CLOUDFLARE_API_TOKEN env var
}

# ------------------------------------------------------------------------------
# Cloudflare Infrastructure Module
# ------------------------------------------------------------------------------

module "cloudflare_infra" {
  source = "../../modules/cloudflare-infra"

  account_id   = var.account_id
  environment  = var.environment
  zone_id      = var.zone_id

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
