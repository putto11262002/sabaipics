# ------------------------------------------------------------------------------
# Input Variables
# ------------------------------------------------------------------------------

variable "account_id" {
  type        = string
  description = "Cloudflare Account ID"
}

variable "environment" {
  type        = string
  description = "Environment name"

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be one of: dev, staging, production."
  }
}

variable "worker_script_name" {
  type        = string
  description = "Name of the Cloudflare Worker script to push secrets to"
}

variable "r2_bucket_names" {
  type        = list(string)
  description = "List of R2 bucket names to grant the generated API token access to"
}

variable "infisical_project_id" {
  type        = string
  description = "Infisical project (workspace) ID"
}

variable "infisical_env_slug" {
  type        = string
  description = "Infisical environment slug (e.g. dev, staging, prod)"
}

variable "infisical_folder_path" {
  type        = string
  default     = "/"
  description = "Infisical folder path to read secrets from"
}
