# ------------------------------------------------------------------------------
# Input Variables for Cloudflare Infrastructure Module
# ------------------------------------------------------------------------------

variable "account_id" {
  type        = string
  description = "Cloudflare Account ID"
}

variable "environment" {
  type        = string
  description = "Environment name (dev/staging/production)"

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

# ------------------------------------------------------------------------------
# R2 Bucket Configuration
# ------------------------------------------------------------------------------

variable "photos_bucket_name" {
  type        = string
  description = "Name of the R2 bucket for photo storage"
}

variable "photos_bucket_location" {
  type        = string
  default     = "APAC"
  description = "R2 bucket location hint (APAC, EEUR, ENAM, WEUR, WNAM)"
}

# ------------------------------------------------------------------------------
# R2 Custom Domain Configuration
# ------------------------------------------------------------------------------

variable "photo_domain" {
  type        = string
  description = "Custom domain for R2 bucket public access"
}

variable "zone_id" {
  type        = string
  description = "Cloudflare Zone ID for the domain"
}

# ------------------------------------------------------------------------------
# R2 CORS Configuration
# ------------------------------------------------------------------------------

variable "cors_allowed_origins" {
  type        = list(string)
  default     = ["*"]
  description = "Allowed origins for CORS"
}

variable "cors_allowed_methods" {
  type        = list(string)
  default     = ["GET", "PUT", "HEAD"]
  description = "Allowed HTTP methods for CORS"
}

variable "cors_allowed_headers" {
  type        = list(string)
  default     = ["Content-Type", "Content-Length", "If-None-Match"]
  description = "Allowed headers for CORS"
}

variable "cors_expose_headers" {
  type        = list(string)
  default     = ["ETag"]
  description = "Headers exposed to the browser"
}

variable "cors_max_age_seconds" {
  type        = number
  default     = 3600
  description = "CORS preflight cache duration in seconds"
}

# ------------------------------------------------------------------------------
# Queue Configuration
# ------------------------------------------------------------------------------

variable "queues" {
  type        = map(string)
  description = "Map of queue logical names to actual queue names"
  # Example:
  # {
  #   photo_processing     = "photo-processing-staging"
  #   photo_processing_dlq = "photo-processing-dlq-staging"
  # }
}

# ------------------------------------------------------------------------------
# R2 Event Notification Configuration
# ------------------------------------------------------------------------------

variable "bucket_notifications" {
  type = list(object({
    prefix      = string
    queue_key   = string
    description = string
  }))
  default     = []
  description = "List of R2 bucket event notifications to create"
}

# ------------------------------------------------------------------------------
# Cache Rules Configuration
# ------------------------------------------------------------------------------

variable "cache_rules" {
  type = list(object({
    name        = string
    expression  = string
    edge_ttl    = number
    browser_ttl = number
  }))
  default     = []
  description = "List of Cloudflare cache rules to create"
}

# ------------------------------------------------------------------------------
# KV Namespace Configuration
# ------------------------------------------------------------------------------

variable "kv_namespaces" {
  type        = map(string)
  description = "Map of KV namespace logical names to titles (e.g., { line_pending = \"line-pending-staging\" })"
  default     = {}
}
