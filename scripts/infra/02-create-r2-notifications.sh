#!/bin/bash
# SAB-42: Set up R2 event notifications for presigned uploads
# Run this script after creating the queues

set -euo pipefail

echo "Setting up R2 event notifications..."

# Production bucket -> production queue
echo "Configuring production bucket notifications..."
wrangler r2 bucket notification create sabaipics-photos \
  --event-type object-create \
  --queue upload-processing \
  --prefix "uploads/"

# Staging bucket -> staging queue
echo "Configuring staging bucket notifications..."
wrangler r2 bucket notification create sabaipics-photos-staging \
  --event-type object-create \
  --queue upload-processing-staging \
  --prefix "uploads/"

echo ""
echo "R2 event notifications configured!"
echo ""
echo "Notifications will trigger when objects are created in the uploads/ prefix"
echo "Events will be delivered to the upload-processing queue for processing"
