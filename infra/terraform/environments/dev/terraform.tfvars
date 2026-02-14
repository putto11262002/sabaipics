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
cors_allowed_headers = ["Content-Type", "Content-Length", "If-None-Match"]
cors_expose_headers  = ["ETag"]
cors_max_age_seconds = 3600

# ------------------------------------------------------------------------------
# Queue Configuration
# All dev queues with logical names as keys
# ------------------------------------------------------------------------------

queues = {
  photo_processing        = "photo-processing-dev"
  photo_processing_dlq    = "photo-processing-dlq-dev"
  rekognition_cleanup     = "rekognition-cleanup-dev"
  rekognition_cleanup_dlq = "rekognition-cleanup-dlq-dev"
  upload_processing       = "upload-processing-dev"
  upload_processing_dlq   = "upload-processing-dlq-dev"
  logo_processing         = "logo-processing-dev"
  logo_processing_dlq     = "logo-processing-dlq-dev"
}

# ------------------------------------------------------------------------------
# R2 Event Notifications (none for dev - local testing)
# ------------------------------------------------------------------------------

bucket_notifications = []

# ------------------------------------------------------------------------------
# Dev Notification Proxy Configuration
# ------------------------------------------------------------------------------

notification_queue_name     = "r2-notification-proxy"
enable_uploads_notification = true
enable_logos_notification   = true

# Webhook URL for notification proxy worker (update with your ngrok URL)
webhook_url = "https://unscientifically-pseudogenteel-kinley.ngrok-free.dev/webhooks/dev/r2-notification"
