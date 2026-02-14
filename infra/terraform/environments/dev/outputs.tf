# ------------------------------------------------------------------------------
# Outputs for Dev Environment
# ------------------------------------------------------------------------------

output "photos_bucket_name" {
  value       = module.cloudflare_infra.photos_bucket_name
  description = "Name of the created R2 bucket"
}

output "photos_bucket_id" {
  value       = module.cloudflare_infra.photos_bucket_id
  description = "ID of the created R2 bucket"
}

output "photo_domain" {
  value       = module.cloudflare_infra.photo_domain
  description = "Custom domain for the R2 bucket"
}

output "queue_ids" {
  value       = module.cloudflare_infra.queue_ids
  description = "Map of queue logical names to their IDs"
}

output "queue_names" {
  value       = module.cloudflare_infra.queue_names
  description = "Map of queue logical names to their actual names"
}

# ------------------------------------------------------------------------------
# Dev Notification Proxy Outputs
# ------------------------------------------------------------------------------

output "notification_proxy_queue_id" {
  value       = module.dev_notification_proxy.queue_id
  description = "ID of the notification proxy queue"
}

output "notification_proxy_queue_name" {
  value       = module.dev_notification_proxy.queue_name
  description = "Name of the notification proxy queue"
}

output "notification_proxy_worker_name" {
  value       = module.dev_notification_proxy.worker_name
  description = "Name of the deployed notification proxy worker"
}
