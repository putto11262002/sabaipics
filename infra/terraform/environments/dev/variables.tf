# ------------------------------------------------------------------------------
# Variables for Dev Environment
# ------------------------------------------------------------------------------

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "account_id" {
  type        = string
  description = "Cloudflare Account ID"
}

variable "zone_id" {
  type        = string
  description = "Cloudflare Zone ID for the domain"
}

# ------------------------------------------------------------------------------
# R2 Bucket Configuration
# ------------------------------------------------------------------------------

variable "photos_bucket_name" {
  type        = string
  description = "Name for the R2 photos bucket"
}

variable "photos_bucket_location" {
  type        = string
  description = "Location hint for R2 bucket"
  default     = "APAC"
}

variable "photo_domain" {
  type        = string
  description = "Custom domain for R2 bucket"
}

# ------------------------------------------------------------------------------
# CORS Configuration
# ------------------------------------------------------------------------------

variable "cors_allowed_origins" {
  type        = list(string)
  description = "Allowed origins for CORS"
  default     = ["*"]
}

variable "cors_allowed_methods" {
  type        = list(string)
  description = "Allowed methods for CORS"
  default     = ["GET", "PUT", "HEAD"]
}

variable "cors_allowed_headers" {
  type        = list(string)
  description = "Allowed headers for CORS"
  default     = ["Content-Type", "Content-Length", "If-None-Match"]
}

variable "cors_expose_headers" {
  type        = list(string)
  description = "Headers to expose in CORS response"
  default     = ["ETag"]
}

variable "cors_max_age_seconds" {
  type        = number
  description = "Max age for CORS preflight cache"
  default     = 3600
}

# ------------------------------------------------------------------------------
# Queue Configuration
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
  description = "R2 bucket event notification configuration"
  default     = []
}
