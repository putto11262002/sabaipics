# ------------------------------------------------------------------------------
# Input Variables for Dev Notification Proxy Module
# ------------------------------------------------------------------------------

variable "account_id" {
  type        = string
  description = "Cloudflare Account ID"
}

variable "environment" {
  type        = string
  description = "Environment name (must be 'dev')"

  validation {
    condition     = var.environment == "dev"
    error_message = "This module is only for dev environment."
  }
}

variable "photos_bucket_name" {
  type        = string
  description = "Name of the R2 bucket to attach event notifications to"
}

variable "notification_queue_name" {
  type        = string
  default     = "r2-notification-proxy"
  description = "Name of the queue for R2 event notifications"
}

variable "enable_uploads_notification" {
  type        = bool
  default     = true
  description = "Enable R2 event notification for uploads/ prefix"
}

variable "enable_logos_notification" {
  type        = bool
  default     = true
  description = "Enable R2 event notification for logos/ prefix"
}

variable "webhook_url" {
  type        = string
  description = "Webhook URL for forwarding R2 notifications (typically ngrok URL for local dev)"
}
