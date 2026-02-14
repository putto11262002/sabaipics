# ------------------------------------------------------------------------------
# Dev Notification Proxy Module
# Creates queue and R2 event notifications for local dev testing
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
# Queue for R2 Notification Proxy
# ------------------------------------------------------------------------------

resource "cloudflare_queue" "notification_proxy" {
  account_id = var.account_id
  queue_name = var.notification_queue_name
}

# ------------------------------------------------------------------------------
# R2 Event Notifications
# Forward uploads/ and logos/ events to notification proxy queue
# ------------------------------------------------------------------------------

resource "cloudflare_r2_bucket_event_notification" "uploads" {
  count = var.enable_uploads_notification ? 1 : 0

  account_id  = var.account_id
  bucket_name = var.photos_bucket_name
  queue_id    = cloudflare_queue.notification_proxy.queue_id

  rules = [{
    prefix      = "uploads/"
    actions     = ["PutObject", "CopyObject"]
    description = "Forward uploads/ events to local dev server via notification proxy"
  }]
}

resource "cloudflare_r2_bucket_event_notification" "logos" {
  count = var.enable_logos_notification ? 1 : 0

  account_id  = var.account_id
  bucket_name = var.photos_bucket_name
  queue_id    = cloudflare_queue.notification_proxy.queue_id

  rules = [{
    prefix      = "logos/"
    actions     = ["PutObject", "CopyObject"]
    description = "Forward logos/ events to local dev server via notification proxy"
  }]
}

# ------------------------------------------------------------------------------
# Worker Script
# Consumes from notification proxy queue and forwards to local dev server
# ------------------------------------------------------------------------------

resource "cloudflare_workers_script" "notification_proxy" {
  account_id  = var.account_id
  script_name = "r2-notification-proxy"

  # ES modules syntax worker (source in ./worker/)
  content     = file("${path.module}/worker/dist/index.js")
  main_module = "index.js"

  bindings = [
    {
      type = "plain_text"
      name = "WEBHOOK_URL"
      text = var.webhook_url
    },
    {
      type       = "queue"
      name       = "QUEUE"
      queue_name = cloudflare_queue.notification_proxy.queue_name
    }
  ]

  compatibility_date = "2025-09-27"
}
