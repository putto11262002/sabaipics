# ------------------------------------------------------------------------------
# Outputs for Cloudflare Infrastructure Module
# ------------------------------------------------------------------------------

output "photos_bucket_name" {
  value       = cloudflare_r2_bucket.photos.name
  description = "Name of the created R2 bucket"
}

output "photos_bucket_id" {
  value       = cloudflare_r2_bucket.photos.id
  description = "ID of the created R2 bucket"
}

output "photo_domain" {
  value       = cloudflare_r2_custom_domain.photos.domain
  description = "Custom domain for the R2 bucket"
}

output "queue_ids" {
  value = {
    for key, queue in cloudflare_queue.queues : key => queue.queue_id
  }
  description = "Map of queue logical names to their IDs"
}

output "queue_names" {
  value = {
    for key, queue in cloudflare_queue.queues : key => queue.queue_name
  }
  description = "Map of queue logical names to their actual names"
}

output "kv_namespace_ids" {
  value = {
    for key, ns in cloudflare_workers_kv_namespace.namespaces : key => ns.id
  }
  description = "Map of KV namespace logical names to their IDs"
}
