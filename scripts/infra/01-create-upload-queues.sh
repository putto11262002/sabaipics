#!/bin/bash
# SAB-42: Create upload processing queues and DLQs
# Run this script to set up the Cloudflare Queues infrastructure

set -euo pipefail

echo "Creating upload processing queues..."

# Development/Production queues
echo "Creating production queues..."
wrangler queues create upload-processing
wrangler queues create upload-processing-dlq

# Staging queues
echo "Creating staging queues..."
wrangler queues create upload-processing-staging
wrangler queues create upload-processing-dlq-staging

echo ""
echo "Queue creation complete!"
echo ""
echo "Next steps:"
echo "  1. Run scripts/infra/create-r2-notifications.sh to set up R2 event notifications"
echo "  2. Apply R2 CORS config via Cloudflare dashboard using scripts/infra/r2-cors.json"
echo "  3. Add R2 API secrets:"
echo "     wrangler secret put R2_ACCESS_KEY_ID"
echo "     wrangler secret put R2_SECRET_ACCESS_KEY"
