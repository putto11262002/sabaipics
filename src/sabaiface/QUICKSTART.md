# SabaiFace API - Quick Start Guide

## Overview

SabaiFace is an AWS Rekognition-compatible face recognition HTTP API. This guide will help you get started quickly.

## Prerequisites

1. **Node.js 20+** and **pnpm** installed
2. **PostgreSQL** with pgvector extension
3. **Face-api.js models** downloaded (see below)

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Download Face Models

Download the face-api.js models to the `models` directory:

```bash
# Create models directory
mkdir -p models

# Download models (you'll need to get these from face-api.js)
# Models required:
# - ssd_mobilenetv1_model-weights_manifest.json + .shard files
# - face_landmark_68_model-weights_manifest.json + .shard files
# - face_recognition_model-weights_manifest.json + .shard files
# - age_gender_model-weights_manifest.json + .shard files

# Quick download using wget or curl:
cd models
wget https://github.com/vladmandic/face-api/raw/master/model/ssd_mobilenetv1_model-weights_manifest.json
wget https://github.com/vladmandic/face-api/raw/master/model/ssd_mobilenetv1_model-shard1
# ... (download all required model files)
```

Or clone the entire models directory:

```bash
git clone --depth 1 https://github.com/vladmandic/face-api.git temp-face-api
cp -r temp-face-api/model models
rm -rf temp-face-api
```

### 3. Configure Environment

Copy the example env file and edit as needed:

```bash
cp .env.example .env
```

Key settings:
- `DATABASE_URL` - Your PostgreSQL connection string
- `MODELS_PATH` - Path to face-api.js models (default: `./models`)
- `FACE_PROVIDER` - `sabaiface` (self-hosted) or `aws` (AWS Rekognition)

### 4. Setup Database

Ensure PostgreSQL is running and the database exists:

```bash
# Create database
psql -U postgres -c "CREATE DATABASE sabaipics;"

# Enable pgvector extension
psql -U postgres -d sabaipics -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run migrations (if using Drizzle)
pnpm --filter=@sabaipics/db db:migrate
```

## Running the Server

### Development Mode (with auto-reload)

```bash
pnpm dev
```

### Production Mode

```bash
pnpm start
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

## Testing the API

### 1. Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "sabaiface",
  "provider": "sabaiface",
  "version": "1.0.0",
  "timestamp": "2026-01-13T..."
}
```

### 2. Create a Collection

```bash
curl -X POST http://localhost:3000/collections \
  -H "Content-Type: application/json" \
  -d '{"CollectionId": "test-event"}'
```

Expected response:
```json
{
  "StatusCode": 200,
  "CollectionArn": "arn:sabaiface:collection:test-event",
  "FaceModelVersion": "face-api.js-1.7.15"
}
```

### 3. Index Faces

First, encode a test image:

```bash
# Encode image to base64
IMAGE_BASE64=$(base64 -i /path/to/your/photo.jpg)

# Index faces
curl -X POST http://localhost:3000/collections/test-event/index-faces \
  -H "Content-Type: application/json" \
  -d "{
    \"Image\": {\"Bytes\": \"$IMAGE_BASE64\"},
    \"ExternalImageId\": \"photo-001\",
    \"DetectionAttributes\": [\"ALL\"],
    \"MaxFaces\": 100
  }"
```

### 4. Search for Similar Faces

```bash
# Encode query image
QUERY_BASE64=$(base64 -i /path/to/query.jpg)

# Search
curl -X POST http://localhost:3000/collections/test-event/search-faces-by-image \
  -H "Content-Type: application/json" \
  -d "{
    \"Image\": {\"Bytes\": \"$QUERY_BASE64\"},
    \"MaxFaces\": 10,
    \"FaceMatchThreshold\": 80
  }"
```

### 5. Delete Collection

```bash
curl -X DELETE http://localhost:3000/collections/test-event
```

## Node.js Example

```javascript
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

async function testSabaiFace() {
  // 1. Create collection
  const createRes = await fetch(`${BASE_URL}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ CollectionId: 'my-event' }),
  });
  console.log('Create:', await createRes.json());

  // 2. Index a photo
  const imageBuffer = fs.readFileSync('./photo.jpg');
  const imageBase64 = imageBuffer.toString('base64');

  const indexRes = await fetch(`${BASE_URL}/collections/my-event/index-faces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Image: { Bytes: imageBase64 },
      ExternalImageId: 'photo-001',
      DetectionAttributes: ['ALL'],
    }),
  });
  console.log('Index:', await indexRes.json());

  // 3. Search for similar faces
  const queryBuffer = fs.readFileSync('./query.jpg');
  const queryBase64 = queryBuffer.toString('base64');

  const searchRes = await fetch(`${BASE_URL}/collections/my-event/search-faces-by-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Image: { Bytes: queryBase64 },
      MaxFaces: 10,
      FaceMatchThreshold: 80,
    }),
  });
  console.log('Search:', await searchRes.json());
}

testSabaiFace().catch(console.error);
```

## Troubleshooting

### Models not loading

Error: `Failed to load face-api.js models`

**Solution:** Make sure all model files are in the `MODELS_PATH` directory. Required files:
- `ssd_mobilenetv1_model-weights_manifest.json` + shards
- `face_landmark_68_model-weights_manifest.json` + shards
- `face_recognition_model-weights_manifest.json` + shards
- `age_gender_model-weights_manifest.json` + shards

### Database connection failed

Error: `Failed to connect to database`

**Solution:**
1. Check `DATABASE_URL` is correct
2. Ensure PostgreSQL is running
3. Ensure database exists
4. Ensure pgvector extension is installed

### No faces detected

Response: `FaceRecords: []`

**Solution:**
1. Check image quality (min 80x80 pixels for faces)
2. Lower `FACE_CONFIDENCE_THRESHOLD` in `.env`
3. Ensure image is properly encoded as base64
4. Try with a clear, frontal face photo

### Slow performance

**Solutions:**
1. Enable GPU: Set `USE_GPU=true` and install `@tensorflow/tfjs-node-gpu`
2. Reduce `MAX_FACES_PER_IMAGE`
3. Increase `FACE_CONFIDENCE_THRESHOLD`
4. Use smaller images (resize to 640px width)

## Next Steps

- Read the full API documentation: [`API.md`](./API.md)
- Add authentication middleware
- Deploy to production (Docker/K8s)
- Set up monitoring and logging
- Tune performance for your use case

## Support

For issues or questions, check:
1. TypeScript compilation: `pnpm build`
2. Server logs: Look for `[FaceDetector]` and `[Server]` prefixes
3. Database migrations: Ensure schema is up to date
