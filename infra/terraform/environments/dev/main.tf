# ------------------------------------------------------------------------------
# Dev Environment - Cloudflare Infrastructure
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

  # Event Notifications (none for dev - local testing)
  bucket_notifications = var.bucket_notifications
}

# ------------------------------------------------------------------------------
# Dev Notification Proxy (dev-only infrastructure)
# ------------------------------------------------------------------------------

module "dev_notification_proxy" {
  source = "../../modules/dev-notification-proxy"

  account_id         = var.account_id
  environment        = var.environment
  photos_bucket_name = module.cloudflare_infra.photos_bucket_name

  notification_queue_name         = var.notification_queue_name
  enable_uploads_notification     = var.enable_uploads_notification
  enable_logos_notification       = var.enable_logos_notification
  enable_lut_uploads_notification = var.enable_lut_uploads_notification
  webhook_url                     = var.webhook_url
}
