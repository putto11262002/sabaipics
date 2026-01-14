# SabaiFace API Reference

AWS Rekognition-compatible face recognition HTTP API.

## Overview

SabaiFace provides a drop-in replacement for AWS Rekognition's face recognition endpoints. Use existing AWS Rekognition client code by simply changing the endpoint URL.

---

## Base URL

```
http://localhost:8086
```

---

## Authentication

Currently none. Add your own auth middleware (Hono middleware) if needed.

---

## Common Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Content-Type` | string | Yes | Must be `application/json` |

---

## Common Response Fields

All successful responses include:

| Field | Type | Description |
|-------|------|-------------|
| `StatusCode` | number | HTTP status code (200 for success) |
| `FaceModelVersion` | string | Model version (always `face-api.js-1.7.15`) |

---

## Error Responses

All errors follow this format:

```json
{
  "StatusCode": 400 | 404 | 500 | 503,
  "error": "Human readable error message",
  "type": "ErrorType",
  "retryable": true | false,
  "throttle": true | false
}
```

### Error Types

| Type | Status | Retryable | Description |
|------|--------|-----------|-------------|
| `validation_failed` | 400 | No | Invalid request parameters |
| `provider_failed` | 400/500 | Depends | External provider error (AWS) |
| `not_found` | 404 | No | Collection not found |
| `conflict` | 400 | No | Collection already exists |
| `internal_error` | 500 | Yes | Internal server error |
| `service_unavailable` | 503 | Yes | Service temporarily unavailable |

---

## Endpoints

### 1. Health Check

Check service health and configuration.

```
GET /health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "sabaiface",
  "provider": "sabaiface",
  "version": "0.0.1",
  "timestamp": "2026-01-14T12:00:00.000Z"
}
```

---

### 2. Create Collection

Create a new face collection (equivalent to an "event" for photo grouping).

```
POST /collections
```

**Request Body:**
```json
{
  "CollectionId": "event-123"
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `CollectionId` | string | Yes | 1-255 chars | Unique collection/event ID |

**Response (200 OK):**
```json
{
  "StatusCode": 200,
  "CollectionArn": "arn:sabaiface:collection:event-123",
  "FaceModelVersion": "face-api.js-1.7.15"
}
```

**Error Responses:**

| Status | Type | Description |
|--------|------|-------------|
| 400 | `validation_failed` | Invalid `CollectionId` format |
| 400 | `conflict` | Collection already exists |

---

### 3. Delete Collection

Delete a collection and all indexed faces.

```
DELETE /collections/:id
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Collection ID |

**Response (200 OK):**
```json
{
  "StatusCode": 200
}
```

**Error Responses:**

| Status | Type | Description |
|--------|------|-------------|
| 404 | `not_found` | Collection not found |

---

### 4. Index Faces

Detect and index faces from an image into a collection.

```
POST /collections/:id/index-faces
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Collection ID |

**Request Body:**
```json
{
  "Image": {
    "Bytes": "<base64-encoded-image-data>"
  },
  "ExternalImageId": "photo-456",
  "DetectionAttributes": ["DEFAULT"],
  "MaxFaces": 100,
  "QualityFilter": "AUTO"
}
```

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `Image.Bytes` | string | Yes | - | Base64 string | Image data (base64 encoded) |
| `ExternalImageId` | string | No | Auto-generated | 1-255 chars | Your photo identifier |
| `DetectionAttributes` | array | No | `["DEFAULT"]` | `["DEFAULT"]` or `["ALL"]` | Include age/gender/emotion |
| `MaxFaces` | number | No | 100 | 1-100 | Maximum faces to index |
| `QualityFilter` | string | No | `"AUTO"` | `"AUTO"` or `"NONE"` | Filter blurry faces |

**Note:** `Image.S3Object` is not yet supported. Use `Bytes` only.

**Response (200 OK):**
```json
{
  "FaceRecords": [
    {
      "Face": {
        "FaceId": "550e8400-e29b-41d4-a716-446655440000",
        "BoundingBox": {
          "Width": 0.25,
          "Height": 0.30,
          "Left": 0.10,
          "Top": 0.15
        },
        "ImageId": "optional-image-id",
        "ExternalImageId": "photo-456",
        "Confidence": 99.5
      },
      "FaceDetail": {
        "BoundingBox": {
          "Width": 0.25,
          "Height": 0.30,
          "Left": 0.10,
          "Top": 0.15
        },
        "Confidence": 99.5,
        "Landmarks": [
          { "Type": "eyeLeft", "X": 0.35, "Y": 0.40 },
          { "Type": "eyeRight", "X": 0.45, "Y": 0.40 },
          { "Type": "nose", "X": 0.40, "Y": 0.50 },
          { "Type": "mouthLeft", "X": 0.35, "Y": 0.60 },
          { "Type": "mouthRight", "X": 0.45, "Y": 0.60 }
        ],
        "AgeRange": {
          "Low": 25,
          "High": 35
        },
        "Gender": {
          "Value": "Male",
          "Confidence": 98.5
        },
        "Emotions": [
          { "Type": "HAPPY", "Confidence": 85.3 },
          { "Type": "CALM", "Confidence": 14.7 }
        ]
      }
    }
  ],
  "UnindexedFaces": [],
  "FaceModelVersion": "face-api.js-1.7.15"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `FaceRecords` | array | Successfully indexed faces |
| `FaceRecords[].Face.FaceId` | string | Unique face identifier (UUID) |
| `FaceRecords[].Face.BoundingBox` | object | Face location (relative 0-1) |
| `FaceRecords[].Face.Confidence` | number | Detection confidence (0-100) |
| `FaceRecords[].FaceDetail` | object | Full face details (if `DetectionAttributes: ["ALL"]`) |
| `FaceRecords[].FaceDetail.AgeRange` | object | Estimated age range |
| `FaceRecords[].FaceDetail.Gender` | object | Estimated gender |
| `FaceRecords[].FaceDetail.Emotions` | array | Detected emotions |
| `UnindexedFaces` | array | Faces that couldn't be indexed |
| `UnindexedFaces[].Reasons` | array of strings | Reasons for exclusion |

**BoundingBox Format:**

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `Width` | number | 0-1 | Face width as % of image width |
| `Height` | number | 0-1 | Face height as % of image height |
| `Left` | number | 0-1 | Left edge as % of image width |
| `Top` | number | 0-1 | Top edge as % of image height |

**Error Responses:**

| Status | Type | Description |
|--------|------|-------------|
| 400 | `validation_failed` | Invalid parameters |
| 400 | `internal_error` | Failed to decode image |
| 404 | `not_found` | Collection not found |

---

### 5. Search Faces by Image

Find faces in a collection that match a query image.

```
POST /collections/:id/search-faces-by-image
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Collection ID |

**Request Body:**
```json
{
  "Image": {
    "Bytes": "<base64-encoded-query-image>"
  },
  "MaxFaces": 10,
  "FaceMatchThreshold": 80
}
```

| Field | Type | Required | Default | Range | Description |
|-------|------|----------|---------|-------|-------------|
| `Image.Bytes` | string | Yes | - | Base64 string | Query image data |
| `MaxFaces` | number | No | 10 | 1-4096 | Maximum results to return |
| `FaceMatchThreshold` | number | No | 80 | 0-100 | Minimum similarity % |

**Response (200 OK):**
```json
{
  "SearchedFaceBoundingBox": {
    "Width": 0.25,
    "Height": 0.30,
    "Left": 0.10,
    "Top": 0.15
  },
  "SearchedFaceConfidence": 99.8,
  "FaceMatches": [
    {
      "Similarity": 95.2,
      "Face": {
        "FaceId": "550e8400-e29b-41d4-a716-446655440000",
        "BoundingBox": {
          "Width": 0.25,
          "Height": 0.30,
          "Left": 0.10,
          "Top": 0.15
        },
        "ImageId": "optional-image-id",
        "ExternalImageId": "photo-456",
        "Confidence": 99.5
      }
    }
  ],
  "FaceModelVersion": "face-api.js-1.7.15"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `SearchedFaceBoundingBox` | object | Detected face location in query image |
| `SearchedFaceConfidence` | number | Detection confidence (0-100) |
| `FaceMatches` | array | Matching faces, sorted by similarity |
| `FaceMatches[].Similarity` | number | Match similarity (0-100) |
| `FaceMatches[].Face.FaceId` | string | Face identifier |
| `FaceMatches[].Face.ExternalImageId` | string | Your photo identifier |

**Error Responses:**

| Status | Type | Description |
|--------|------|-------------|
| 400 | `validation_failed` | Invalid parameters |
| 404 | `not_found` | Collection not found |

---

## Data Types

### BoundingBox

Face location as relative coordinates (0-1 range).

```typescript
{
  Width: number;   // 0-1: width as % of image width
  Height: number;  // 0-1: height as % of image height
  Left: number;    // 0-1: left edge as % of image width
  Top: number;     // 0-1: top edge as % of image height
}
```

**Visual:**
```
(0,0) +------------------------+ (1,0)
      |                        |
      |   +--------------+     |
      |   |  Face        |     |
      |   |              |     |
      |   +--------------+     |
      |                        |
(0,1) +------------------------+ (1,1)
```

### Landmark

Facial feature point.

```typescript
{
  Type: "eyeLeft" | "eyeRight" | "nose" | "mouthLeft" | "mouthRight";
  X: number;  // 0-1: x position
  Y: number;  // 0-1: y position
}
```

### AgeRange

Estimated age range.

```typescript
{
  Low: number;  // Lower bound (inclusive)
  High: number; // Upper bound (inclusive)
}
```

### Emotion

Detected emotion.

```typescript
{
  Type: "HAPPY" | "SAD" | "ANGRY" | "CONFUSED" | "DISGUSTED" | "SURPRISED" | "CALM" | "FEAR";
  Confidence: number;  // 0-100
}
```

---

## Usage Examples

### cURL

**Create collection:**
```bash
curl -X POST http://localhost:8086/collections \
  -H "Content-Type: application/json" \
  -d '{"CollectionId": "event-123"}'
```

**Index faces:**
```bash
# Encode image to base64
IMAGE_B64=$(base64 -i photo.jpg)

curl -X POST http://localhost:8086/collections/event-123/index-faces \
  -H "Content-Type: application/json" \
  -d "{
    \"Image\": {\"Bytes\": \"$IMAGE_B64\"},
    \"ExternalImageId\": \"photo-456\",
    \"DetectionAttributes\": [\"ALL\"]
  }"
```

**Search faces:**
```bash
QUERY_B64=$(base64 -i query.jpg)

curl -X POST http://localhost:8086/collections/event-123/search-faces-by-image \
  -H "Content-Type: application/json" \
  -d "{
    \"Image\": {\"Bytes\": \"$QUERY_B64\"},
    \"MaxFaces\": 10,
    \"FaceMatchThreshold\": 80
  }"
```

**Delete collection:**
```bash
curl -X DELETE http://localhost:8086/collections/event-123
```

### JavaScript/TypeScript

```typescript
const BASE_URL = 'http://localhost:8086';

async function createCollection(collectionId: string) {
  const response = await fetch(`${BASE_URL}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ CollectionId: collectionId }),
  });
  return response.json();
}

async function indexFaces(
  collectionId: string,
  imagePath: string,
  externalImageId: string
) {
  const imageBuffer = await fs.promises.readFile(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  const response = await fetch(
    `${BASE_URL}/collections/${collectionId}/index-faces`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Image: { Bytes: imageBase64 },
        ExternalImageId: externalImageId,
        DetectionAttributes: ['ALL'],
      }),
    }
  );
  return response.json();
}

async function searchFaces(
  collectionId: string,
  queryImagePath: string,
  threshold = 80
) {
  const imageBuffer = await fs.promises.readFile(queryImagePath);
  const imageBase64 = imageBuffer.toString('base64');

  const response = await fetch(
    `${BASE_URL}/collections/${collectionId}/search-faces-by-image`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Image: { Bytes: imageBase64 },
        MaxFaces: 10,
        FaceMatchThreshold: threshold,
      }),
    }
  );
  return response.json();
}

async function deleteCollection(collectionId: string) {
  const response = await fetch(`${BASE_URL}/collections/${collectionId}`, {
    method: 'DELETE',
  });
  return response.json();
}

// Usage
await createCollection('event-123');
await indexFaces('event-123', './photo.jpg', 'photo-456');
const results = await searchFaces('event-123', './query.jpg');
console.log('Found', results.FaceMatches.length, 'matches');
await deleteCollection('event-123');
```

### Python

```python
import base64
import requests

BASE_URL = 'http://localhost:8086'

def create_collection(collection_id: str):
    response = requests.post(
        f'{BASE_URL}/collections',
        json={'CollectionId': collection_id}
    )
    return response.json()

def index_faces(collection_id: str, image_path: str, external_image_id: str):
    with open(image_path, 'rb') as f:
        image_b64 = base64.b64encode(f.read()).decode('utf-8')

    response = requests.post(
        f'{BASE_URL}/collections/{collection_id}/index-faces',
        json={
            'Image': {'Bytes': image_b64},
            'ExternalImageId': external_image_id,
            'DetectionAttributes': ['ALL']
        }
    )
    return response.json()

def search_faces(collection_id: str, query_path: str, threshold=80):
    with open(query_path, 'rb') as f:
        image_b64 = base64.b64encode(f.read()).decode('utf-8')

    response = requests.post(
        f'{BASE_URL}/collections/{collection_id}/search-faces-by-image',
        json={
            'Image': {'Bytes': image_b64},
            'MaxFaces': 10,
            'FaceMatchThreshold': threshold
        }
    )
    return response.json()

def delete_collection(collection_id: str):
    response = requests.delete(f'{BASE_URL}/collections/{collection_id}')
    return response.json()

# Usage
create_collection('event-123')
index_faces('event-123', 'photo.jpg', 'photo-456')
results = search_faces('event-123', 'query.jpg')
print(f"Found {len(results['FaceMatches'])} matches")
delete_collection('event-123')
```

---

## Using the Client Library

For TypeScript/JavaScript projects, use the `@sabaipics/face-recognition` client library:

```typescript
import { SabaiFaceHTTPClient } from '@sabaipics/face-recognition';

const client = new SabaiFaceHTTPClient({
  endpoint: 'http://localhost:8086',
});

// Create collection
await client.createCollection('event-123');

// Index faces
const result = await client.indexPhoto({
  eventId: 'event-123',
  photoId: 'photo-456',
  imageData: imageBuffer,
  options: { maxFaces: 100, qualityFilter: 'auto' },
});

// Search faces
const matches = await client.findSimilarFaces({
  eventId: 'event-123',
  imageData: queryBuffer,
  maxResults: 10,
  minSimilarity: 0.8,
});

// Delete collection
await client.deleteCollection('event-123');
```

---

## Configuration

Key environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8086 | Server port |
| `FACE_PROVIDER` | `sabaiface` | `sabaiface` or `aws` |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `MODELS_PATH` | `./models` | Path to face-api.js models |
| `FACE_CONFIDENCE_THRESHOLD` | 0.5 | Min detection confidence (0-1) |
| `DEFAULT_SIMILARITY_THRESHOLD` | 0.8 | Default search threshold (0-1) |
| `DEFAULT_MAX_RESULTS` | 10 | Default max search results |

---

## Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|----------------|-------|
| Create Collection | 10-50ms | Single DB write |
| Delete Collection | 50-500ms | Depends on indexed faces |
| Index Faces | 100-500ms | Per image (first call slower) |
| Search Faces | 50-200ms | Per query |

**Factors affecting performance:**
- Image resolution (higher = slower)
- Number of faces in image (more = slower)
- Collection size (affects search time)
- Model loading (first request after startup)
- `FACE_CONFIDENCE_THRESHOLD` (lower = more faces = slower)

---

## Differences from AWS Rekognition

| Aspect | AWS Rekognition | SabaiFace |
|--------|----------------|-----------|
| Model | AWS proprietary | face-api.js (ResNet-34) |
| `FaceModelVersion` | AWS version ID | `face-api.js-1.7.15` |
| `CollectionArn` | AWS ARN format | `arn:sabaiface:collection:*` |
| `Image.S3Object` | Supported | Not yet supported |
| Age/Gender/Emotion | AWS trained models | face-api.js models |
| Face vector | AWS proprietary | 128-D descriptor |
| Collection storage | AWS managed | Your PostgreSQL + pgvector |

---

## Rate Limiting

Not implemented by default. Add Hono middleware for rate limiting.

---

## Status Codes Summary

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (validation/conflict) |
| 404 | Not found (collection) |
| 500 | Internal error (retryable) |
| 503 | Service unavailable (retryable)
