#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-}"
shift || true

WITH_DOMAINS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-domains)
      WITH_DOMAINS=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  echo "Usage: bash scripts/infra/cloudflare-provision.sh <dev|staging|production> [--with-domains]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PNPM="pnpm -C $REPO_ROOT"
WRANGLER="$PNPM --filter=@sabaipics/api exec wrangler"

CORS_FILE="$SCRIPT_DIR/r2-cors.json"

create_queue() {
  local q="$1"

  set +e
  local out
  out=$($WRANGLER queues create "$q" 2>&1)
  local code=$?
  set -e

  if [[ $code -eq 0 ]]; then
    echo "Created queue: $q"
    return 0
  fi

  if echo "$out" | grep -Eqi "already exists|already taken|code: 11009"; then
    echo "Queue already exists: $q"
    return 0
  fi

  echo "Failed to create queue: $q" >&2
  echo "$out" >&2
  return $code
}

create_bucket() {
  local b="$1"

  set +e
  local out
  out=$($WRANGLER r2 bucket create "$b" 2>&1)
  local code=$?
  set -e

  if [[ $code -eq 0 ]]; then
    echo "Created bucket: $b"
    return 0
  fi

  if echo "$out" | grep -qi "already exists"; then
    echo "Bucket already exists: $b"
    return 0
  fi

  echo "Failed to create bucket: $b" >&2
  echo "$out" >&2
  return $code
}

set_bucket_cors() {
  local b="$1"

  if [[ ! -f "$CORS_FILE" ]]; then
    echo "Missing CORS file: $CORS_FILE" >&2
    return 1
  fi

  echo "Setting R2 CORS: $b"
  $WRANGLER r2 bucket cors set "$b" --file "$CORS_FILE" >/dev/null
}

create_bucket_notification() {
  local b="$1"
  local q="$2"
  local desc="$3"
  local prefix="${4:-uploads/}"

  set +e
  local out
  out=$($WRANGLER r2 bucket notification create "$b" --event-type object-create --queue "$q" --prefix "$prefix" --description "$desc" 2>&1)
  local code=$?
  set -e

  if [[ $code -eq 0 ]]; then
    echo "Created R2 notification: $b -> $q"
    return 0
  fi

  # Wrangler currently errors on duplicates; message differs by version.
  if echo "$out" | grep -Eqi "already exists|duplicate|conflict"; then
    echo "R2 notification already exists: $b -> $q"
    return 0
  fi

  echo "Failed to create R2 notification: $b -> $q" >&2
  echo "$out" >&2
  return $code
}

add_r2_custom_domain() {
  local b="$1"
  local domain="$2"

  if [[ $WITH_DOMAINS -ne 1 ]]; then
    return 0
  fi

  if [[ -z "${R2_ZONE_ID:-}" ]]; then
    echo "Skipping R2 domain ($domain): set R2_ZONE_ID and pass --with-domains" >&2
    return 0
  fi

  set +e
  local out
  out=$($WRANGLER r2 bucket domain add "$b" --domain "$domain" --zone-id "$R2_ZONE_ID" --force 2>&1)
  local code=$?
  set -e

  if [[ $code -eq 0 ]]; then
    echo "Connected R2 domain: $domain -> $b"
    return 0
  fi

  if echo "$out" | grep -Eqi "already exists|duplicate|conflict"; then
    echo "R2 domain already connected: $domain -> $b"
    return 0
  fi

  echo "Failed to connect R2 domain: $domain -> $b" >&2
  echo "$out" >&2
  return $code
}

case "$ENVIRONMENT" in
  dev)
    # DEPRECATED: Dev environment is now managed by OpenTofu (infra/terraform/environments/dev)
    # This section is kept for backwards compatibility only.
    # Use: cd infra/terraform/environments/dev && infisical run --env=dev --path="/terraform" -- tofu apply
    PHOTOS_BUCKET="sabaipics-photos-dev"
    PHOTO_DOMAIN="devphotos.sabaipics.com"
    QUEUES=(
      "r2-notification-proxy"
    )
    UPLOAD_QUEUE="upload-processing-dev"
    LUT_QUEUE="lut-processing-dev"
    NOTIFICATION_QUEUE="r2-notification-proxy"
    LOGO_NOTIFICATION_QUEUE="r2-notification-proxy"
    LUT_NOTIFICATION_QUEUE="r2-notification-proxy"
    ;;
  staging)
    PHOTOS_BUCKET="sabaipics-photos-staging"
    PHOTO_DOMAIN="photos-staging.sabaipics.com"
    QUEUES=(
      "photo-processing-staging"
      "photo-processing-dlq-staging"
      "rekognition-cleanup-staging"
      "rekognition-cleanup-dlq-staging"
      "upload-processing-staging"
      "upload-processing-dlq-staging"
      "logo-processing-staging"
      "logo-processing-dlq-staging"
      "lut-processing-staging"
      "lut-processing-dlq-staging"
    )
    UPLOAD_QUEUE="upload-processing-staging"
    LOGO_QUEUE="logo-processing-staging"
    LUT_QUEUE="lut-processing-staging"
    NOTIFICATION_QUEUE="$UPLOAD_QUEUE"
    LOGO_NOTIFICATION_QUEUE="$LOGO_QUEUE"
    LUT_NOTIFICATION_QUEUE="$LUT_QUEUE"
    ;;
  production)
    PHOTOS_BUCKET="sabaipics-photos"
    PHOTO_DOMAIN="photo.sabaipics.com"
    QUEUES=(
      "photo-processing"
      "photo-processing-dlq"
      "rekognition-cleanup"
      "rekognition-cleanup-dlq"
      "upload-processing"
      "upload-processing-dlq"
      "logo-processing"
      "logo-processing-dlq"
      "lut-processing"
      "lut-processing-dlq"
    )
    UPLOAD_QUEUE="upload-processing"
    LOGO_QUEUE="logo-processing"
    LUT_QUEUE="lut-processing"
    NOTIFICATION_QUEUE="$UPLOAD_QUEUE"
    LOGO_NOTIFICATION_QUEUE="$LOGO_QUEUE"
    LUT_NOTIFICATION_QUEUE="$LUT_QUEUE"
    ;;
esac

echo "Provisioning Cloudflare infra ($ENVIRONMENT)"
echo "- R2 bucket: $PHOTOS_BUCKET"
echo "- Queues: ${#QUEUES[@]}"

echo "\n== Queues =="
for q in "${QUEUES[@]}"; do
  create_queue "$q"
done

echo "\n== R2 Bucket =="
create_bucket "$PHOTOS_BUCKET"

echo "\n== R2 CORS =="
set_bucket_cors "$PHOTOS_BUCKET"

echo "\n== R2 Notifications =="
create_bucket_notification "$PHOTOS_BUCKET" "$NOTIFICATION_QUEUE" "uploads/ object-create -> $NOTIFICATION_QUEUE" "uploads/"
create_bucket_notification "$PHOTOS_BUCKET" "$LOGO_NOTIFICATION_QUEUE" "logos/ object-create -> $LOGO_NOTIFICATION_QUEUE" "logos/"
create_bucket_notification "$PHOTOS_BUCKET" "$LUT_NOTIFICATION_QUEUE" "lut-uploads/ object-create -> $LUT_NOTIFICATION_QUEUE" "lut-uploads/"

echo "\n== R2 Custom Domain =="
add_r2_custom_domain "$PHOTOS_BUCKET" "$PHOTO_DOMAIN"

echo "\nDone."
