#!/bin/bash
# Set R2 CORS configuration for presigned URL uploads

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORS_FILE="$SCRIPT_DIR/r2-cors.json"

echo "Setting CORS for production bucket..."
wrangler r2 bucket cors set sabaipics-photos --file "$CORS_FILE"

echo "Setting CORS for staging bucket..."
wrangler r2 bucket cors set sabaipics-photos-staging --file "$CORS_FILE"

echo "Done! Verifying..."
echo ""
echo "Production CORS:"
wrangler r2 bucket cors list sabaipics-photos

echo ""
echo "Staging CORS:"
wrangler r2 bucket cors list sabaipics-photos-staging
