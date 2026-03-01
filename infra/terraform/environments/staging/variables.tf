# ------------------------------------------------------------------------------
# Variables for Staging Environment
# Values are set in terraform.tfvars
# ------------------------------------------------------------------------------

variable "account_id" {
  type        = string
  description = "Cloudflare Account ID"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "zone_id" {
  type        = string
  description = "Cloudflare Zone ID for sabaipics.com"
}

# ------------------------------------------------------------------------------
# R2 Bucket
# ------------------------------------------------------------------------------

variable "photos_bucket_name" {
  type        = string
  description = "R2 bucket name for photos"
}

variable "photos_bucket_location" {
  type        = string
  default     = "APAC"
  description = "R2 bucket location hint"
}

variable "photo_domain" {
  type        = string
  description = "Custom domain for R2 bucket"
}

# ------------------------------------------------------------------------------
# CORS Configuration
# ------------------------------------------------------------------------------

variable "cors_allowed_origins" {
  type    = list(string)
  default = ["*"]
}

variable "cors_allowed_methods" {
  type    = list(string)
  default = ["GET", "PUT", "HEAD"]
}

variable "cors_allowed_headers" {
  type    = list(string)
  default = ["Content-Type", "Content-Length", "If-None-Match"]
}

variable "cors_expose_headers" {
  type    = list(string)
  default = ["ETag"]
}

variable "cors_max_age_seconds" {
  type    = number
  default = 3600
}

# ------------------------------------------------------------------------------
# Queues
# ------------------------------------------------------------------------------

variable "queues" {
  type        = map(string)
  description = "Map of queue logical names to actual queue names"
}

# ------------------------------------------------------------------------------
# Event Notifications
# ------------------------------------------------------------------------------

variable "bucket_notifications" {
  type = list(object({
    prefix      = string
    queue_key   = string
    description = string
  }))
  default = []
}

# ------------------------------------------------------------------------------
# Worker Secrets
# ------------------------------------------------------------------------------

variable "worker_script_name" {
  type        = string
  description = "Name of the Cloudflare Worker script to push secrets to"
  default     = "framefast-api-staging"
}

variable "infisical_project_id" {
  type        = string
  description = "Infisical project (workspace) ID"
  default     = "315a1831-a394-47fb-856b-e791dd7e9f9e"
}

# ------------------------------------------------------------------------------
# KV Namespace Configuration
# ------------------------------------------------------------------------------

variable "kv_namespaces" {
  type        = map(string)
  description = "Map of KV namespace logical names to titles"
  default     = {}
}
