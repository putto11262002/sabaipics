# ------------------------------------------------------------------------------
# Production Environment Configuration
# Non-secret values - safe to commit to git
# ------------------------------------------------------------------------------

environment = "production"
account_id  = "ac76d647241fb6b589f88fe88d0e4a08"

# Zone ID for framefast.io
zone_id = "cad9739a62904eeef1eaf4a2c0ab13ce"

# ------------------------------------------------------------------------------
# R2 Bucket Configuration
# ------------------------------------------------------------------------------

photos_bucket_name     = "framefast-photos"
photos_bucket_location = "APAC"
photo_domain           = "photos.framefast.io"

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
# All production queues with logical names as keys
# ------------------------------------------------------------------------------

queues = {
  photo_processing        = "photo-processing"
  photo_processing_dlq    = "photo-processing-dlq"
  rekognition_cleanup     = "rekognition-cleanup"
  rekognition_cleanup_dlq = "rekognition-cleanup-dlq"
  upload_processing       = "upload-processing"
  upload_processing_dlq   = "upload-processing-dlq"
  logo_processing         = "logo-processing"
  logo_processing_dlq     = "logo-processing-dlq"
  lut_processing          = "lut-processing"
  lut_processing_dlq      = "lut-processing-dlq"
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
  },
  {
    prefix      = "lut-uploads/"
    queue_key   = "lut_processing"
    description = "Trigger LUT processing on new LUT uploads"
  }
]

# ------------------------------------------------------------------------------
# Worker Secrets Configuration
# ------------------------------------------------------------------------------

worker_script_name = "framefast-api-production"

# ------------------------------------------------------------------------------
# Cache Rules
# Edge cache for SSG landing pages - 1 week TTL
# ------------------------------------------------------------------------------

cache_rules = [
  {
    # Note: Excluding "/" path because next-intl middleware performs locale negotiation/redirects.
    # Caching "/" would pin all users to the first cached locale variant for up to 1 week.
    name        = "WWW Landing Pages"
    expression  = "(http.host eq \"framefast.io\" or http.host eq \"www.framefast.io\") and (http.request.uri.path eq \"/en\" or http.request.uri.path eq \"/th\" or http.request.uri.path eq \"/en/\" or http.request.uri.path eq \"/th/\")"
    edge_ttl    = 604800  # 1 week in seconds
    browser_ttl = 3600    # 1 hour
  }
]
