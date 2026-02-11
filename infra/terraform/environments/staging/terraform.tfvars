# ------------------------------------------------------------------------------
# Staging Environment Configuration
# Non-secret values - safe to commit to git
# ------------------------------------------------------------------------------

environment = "staging"
account_id  = "ac76d647241fb6b589f88fe88d0e4a08"

# Zone ID for framefast.io
zone_id = "cad9739a62904eeef1eaf4a2c0ab13ce"

# ------------------------------------------------------------------------------
# R2 Bucket Configuration
# ------------------------------------------------------------------------------

photos_bucket_name     = "framefast-photos-staging"
photos_bucket_location = "APAC"
photo_domain           = "photos-staging.framefast.io"

# ------------------------------------------------------------------------------
# CORS Configuration (matching current r2-cors.json)
# ------------------------------------------------------------------------------

cors_allowed_origins = ["*"]
cors_allowed_methods = ["GET", "PUT", "HEAD"]
cors_allowed_headers = ["Content-Type", "Content-Length", "If-None-Match"]
cors_expose_headers  = ["ETag"]
cors_max_age_seconds = 3600

# ------------------------------------------------------------------------------
# Queue Configuration
# All staging queues with logical names as keys
# ------------------------------------------------------------------------------

queues = {
  photo_processing        = "photo-processing-staging"
  photo_processing_dlq    = "photo-processing-dlq-staging"
  rekognition_cleanup     = "rekognition-cleanup-staging"
  rekognition_cleanup_dlq = "rekognition-cleanup-dlq-staging"
  upload_processing       = "upload-processing-staging"
  upload_processing_dlq   = "upload-processing-dlq-staging"
  logo_processing         = "logo-processing-staging"
  logo_processing_dlq     = "logo-processing-dlq-staging"
}

# ------------------------------------------------------------------------------
# R2 Event Notifications
# Trigger queues when objects are created in specific prefixes
# ------------------------------------------------------------------------------

bucket_notifications = [
  {
    prefix      = "uploads/"
    queue_key   = "upload_processing"
    description = "Trigger upload processing on new uploads"
  },
  {
    prefix      = "logos/"
    queue_key   = "logo_processing"
    description = "Trigger logo processing on new logos"
  }
]
