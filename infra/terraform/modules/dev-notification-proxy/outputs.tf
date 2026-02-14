# ------------------------------------------------------------------------------
# Outputs for Dev Notification Proxy Module
# ------------------------------------------------------------------------------

output "queue_id" {
  value       = cloudflare_queue.notification_proxy.queue_id
  description = "ID of the notification proxy queue"
}

output "queue_name" {
  value       = cloudflare_queue.notification_proxy.queue_name
  description = "Name of the notification proxy queue"
}

output "uploads_notification_enabled" {
  value       = var.enable_uploads_notification
  description = "Whether uploads/ event notification is enabled"
}

output "logos_notification_enabled" {
  value       = var.enable_logos_notification
  description = "Whether logos/ event notification is enabled"
}

output "worker_name" {
  value       = cloudflare_workers_script.notification_proxy.script_name
  description = "Name of the deployed worker"
}

output "webhook_url" {
  value       = var.webhook_url
  description = "Configured webhook URL"
  sensitive   = true
}
