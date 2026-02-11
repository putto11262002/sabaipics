# ------------------------------------------------------------------------------
# Staging Environment Outputs
# ------------------------------------------------------------------------------

output "photos_bucket_name" {
  value       = module.cloudflare_infra.photos_bucket_name
  description = "Name of the staging R2 bucket"
}

output "photos_bucket_id" {
  value       = module.cloudflare_infra.photos_bucket_id
  description = "ID of the staging R2 bucket"
}

output "photo_domain" {
  value       = module.cloudflare_infra.photo_domain
  description = "Custom domain for the staging R2 bucket"
}

output "queue_ids" {
  value       = module.cloudflare_infra.queue_ids
  description = "Map of queue logical names to their IDs"
}

output "queue_names" {
  value       = module.cloudflare_infra.queue_names
  description = "Map of queue logical names to their actual names"
}
