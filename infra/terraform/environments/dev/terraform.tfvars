# ------------------------------------------------------------------------------
# Dev Environment Configuration
# Non-secret values - safe to commit to git
# ------------------------------------------------------------------------------

environment = "dev"
account_id  = "ac76d647241fb6b589f88fe88d0e4a08"

# Zone ID for framefast.io
zone_id = "cad9739a62904eeef1eaf4a2c0ab13ce"

# ------------------------------------------------------------------------------
# R2 Bucket Configuration
# ------------------------------------------------------------------------------

photos_bucket_name     = "framefast-photos-dev"
photos_bucket_location = "APAC"
photo_domain           = "photos-dev.framefast.io"

# ------------------------------------------------------------------------------
# CORS Configuration
# ------------------------------------------------------------------------------

cors_allowed_origins = ["*"]
cors_allowed_methods = ["GET", "PUT", "HEAD"]
cors_allowed_headers = [
  "Content-Type",
  "Content-Length",
  "If-None-Match",
  "x-amz-meta-traceparent",
  "x-amz-meta-baggage",
]
cors_expose_headers  = ["ETag"]
cors_max_age_seconds = 3600

# ------------------------------------------------------------------------------
# Queue Configuration
# All dev queues with logical names as keys
# ------------------------------------------------------------------------------

queues = {
  photo_pipeline          = "photo-pipeline-dev"
  photo_pipeline_dlq      = "photo-pipeline-dlq-dev"
  rekognition_cleanup     = "rekognition-cleanup-dev"
  rekognition_cleanup_dlq = "rekognition-cleanup-dlq-dev"
  logo_processing         = "logo-processing-dev"
  logo_processing_dlq     = "logo-processing-dlq-dev"
  credit_ledger           = "credit-ledger-dev"
  credit_ledger_dlq       = "credit-ledger-dlq-dev"
}

# ------------------------------------------------------------------------------
# R2 Event Notifications
# ------------------------------------------------------------------------------

bucket_notifications = [
  {
    prefix      = "uploads/"
    queue_key   = "photo_pipeline"
    description = "Trigger photo pipeline on new uploads"
  }
]

# ------------------------------------------------------------------------------
# Dev Notification Proxy Configuration
# ------------------------------------------------------------------------------

notification_queue_name     = "r2-notification-proxy"
enable_uploads_notification = true
enable_logos_notification   = true
enable_lut_uploads_notification = true

# Webhook URL for notification proxy worker (update with your ngrok URL)
webhook_url = "https://unscientifically-pseudogenteel-kinley.ngrok-free.dev/webhooks/dev/r2-notification"

# ------------------------------------------------------------------------------
# Workers KV Namespaces
# ------------------------------------------------------------------------------

kv_namespaces = {
  line_pending = "line-pending-dev"
}
