# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------

output "r2_access_key_id" {
  value       = module.r2_token.id
  description = "R2 API token ID (used as access key)"
}

output "r2_secret_access_key" {
  value       = module.r2_token.secret
  sensitive   = true
  description = "R2 API token secret (used as secret access key)"
}

output "secrets_pushed" {
  value       = sort(keys(local.all_secrets))
  description = "List of secret names pushed to the Worker"
}
