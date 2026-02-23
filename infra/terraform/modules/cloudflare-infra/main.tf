# ------------------------------------------------------------------------------
# Cloudflare Infrastructure Module
# Manages R2 Buckets, Queues, CORS, Event Notifications, and Custom Domains
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
# R2 Bucket
# ------------------------------------------------------------------------------

resource "cloudflare_r2_bucket" "photos" {
  account_id = var.account_id
  name       = var.photos_bucket_name
  location   = var.photos_bucket_location
}

# ------------------------------------------------------------------------------
# R2 Bucket Lifecycle
# ------------------------------------------------------------------------------

resource "cloudflare_r2_bucket_lifecycle" "photos" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.photos.name

  rules = [{
    id      = "Delete original uploads after 30 days"
    enabled = true

    conditions = {
      prefix = "uploads/"
    }

    delete_objects_transition = {
      condition = {
        max_age = 30
        type    = "Age"
      }
    }
  }]
}

# ------------------------------------------------------------------------------
# R2 Bucket CORS
# ------------------------------------------------------------------------------

resource "cloudflare_r2_bucket_cors" "photos" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.photos.name

  rules = [{
    allowed = {
      origins = var.cors_allowed_origins
      methods = var.cors_allowed_methods
      headers = var.cors_allowed_headers
    }
    expose_headers  = var.cors_expose_headers
    max_age_seconds = var.cors_max_age_seconds
  }]
}

# ------------------------------------------------------------------------------
# R2 Custom Domain
# ------------------------------------------------------------------------------

resource "cloudflare_r2_custom_domain" "photos" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.photos.name
  domain      = var.photo_domain
  zone_id     = var.zone_id
  enabled     = true
}

# ------------------------------------------------------------------------------
# Cloudflare Queues
# ------------------------------------------------------------------------------

resource "cloudflare_queue" "queues" {
  for_each = var.queues

  account_id = var.account_id
  queue_name = each.value
}

# ------------------------------------------------------------------------------
# R2 Event Notifications
# ------------------------------------------------------------------------------

resource "cloudflare_r2_bucket_event_notification" "notifications" {
  count = length(var.bucket_notifications)

  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.photos.name
  queue_id    = cloudflare_queue.queues[var.bucket_notifications[count.index].queue_key].queue_id

  rules = [{
    prefix      = var.bucket_notifications[count.index].prefix
    actions     = ["PutObject", "CopyObject", "CompleteMultipartUpload"]
    description = var.bucket_notifications[count.index].description
  }]
}

# ------------------------------------------------------------------------------
# Cache Rules
# ------------------------------------------------------------------------------

resource "cloudflare_cache_rule" "rules" {
  for_each = { for rule in var.cache_rules : rule.name => rule }

  zone_id     = var.zone_id
  description = each.value.name
  expression  = each.value.expression
  action      = "set_cache_settings"

  cache_settings {
    edge_ttl {
      mode  = "override_origin"
      value = each.value.edge_ttl
    }
    browser_ttl {
      mode  = "override_origin"
      value = each.value.browser_ttl
    }
  }
}
