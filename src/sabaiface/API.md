# SabaiFace API Documentation

AWS Rekognition-compatible face recognition API.

## Overview

SabaiFace provides a drop-in replacement HTTP API compatible with AWS Rekognition's face recognition endpoints. You can use this API with existing AWS Rekognition client code by simply changing the endpoint URL.

## Base URL

```
http://localhost:3000
```

## Authentication

None (add your own auth middleware if needed)

## Endpoints

### Health Check

Check service status and configuration.

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "sabaiface",
  "provider": "sabaiface",
  "version": "1.0.0",
  "timestamp": "2026-01-13T..."
}
```

---

### Create Collection

Create a new face collection (equivalent to an event).

```http
POST /collections
Content-Type: application/json

{
  "CollectionId": "event-123"
}
```

**Response:**
```json
{
  "StatusCode": 200,
  "CollectionArn": "arn:sabaiface:collection:event-123",
  "FaceModelVersion": "face-api.js-1.7.15"
}
```

**Error Responses:**
- `400 InvalidParameterException` - Invalid collection ID
- `400 ResourceAlreadyExistsException` - Collection already exists

---

### Index Faces

Index faces from an image into a collection.

```http
POST /collections/:id/index-faces
Content-Type: application/json

{
  "Image": {
    "Bytes": "<base64-encoded-image>"
  },
  "ExternalImageId": "photo-456",
  "MaxFaces": 100,
  "DetectionAttributes": ["ALL"],
  "QualityFilter": "AUTO"
}
```

**Parameters:**
- `Image.Bytes` (required) - Base64-encoded image
- `ExternalImageId` (optional) - Your photo ID
- `MaxFaces` (optional) - Max faces to index (default: 100)
- `DetectionAttributes` (optional) - `["DEFAULT"]` or `["ALL"]` for age/gender
- `QualityFilter` (optional) - `"AUTO"` or `"NONE"`

**Response:**
```json
{
  "FaceRecords": [
    {
      "Face": {
        "FaceId": "uuid",
        "BoundingBox": {
          "Width": 0.25,
          "Height": 0.3,
          "Left": 0.1,
          "Top": 0.15
        },
        "Confidence": 99.5,
        "ExternalImageId": "photo-456"
      },
      "FaceDetail": {
        "BoundingBox": {
          "Width": 0.25,
          "Height": 0.3,
          "Left": 0.1,
          "Top": 0.15
        },
        "Confidence": 99.5,
        "AgeRange": {
          "Low": 25,
          "High": 35
        },
        "Gender": {
          "Value": "Male",
          "Confidence": 98.5
        },
        "Emotions": [
          {
            "Type": "HAPPY",
            "Confidence": 85.3
          }
        ]
      }
    }
  ],
  "UnindexedFaces": [],
  "FaceModelVersion": "face-api.js-1.7.15"
}
```

**Error Responses:**
- `400 InvalidParameterException` - Invalid parameters
- `400 InvalidImageFormatException` - Invalid image format
- `404 ResourceNotFoundException` - Collection not found

---

### Search Faces by Image

Search for faces similar to those in a query image.

```http
POST /collections/:id/search-faces-by-image
Content-Type: application/json

{
  "Image": {
    "Bytes": "<base64-encoded-image>"
  },
  "MaxFaces": 10,
  "FaceMatchThreshold": 80
}
```

**Parameters:**
- `Image.Bytes` (required) - Base64-encoded query image
- `MaxFaces` (optional) - Max results to return (default: 10)
- `FaceMatchThreshold` (optional) - Min similarity 0-100 (default: 80)

**Response:**
```json
{
  "SearchedFaceBoundingBox": {
    "Width": 0.25,
    "Height": 0.3,
    "Left": 0.1,
    "Top": 0.15
  },
  "SearchedFaceConfidence": 99.8,
  "FaceMatches": [
    {
      "Similarity": 95.2,
      "Face": {
        "FaceId": "uuid",
        "BoundingBox": {
          "Width": 0.25,
          "Height": 0.3,
          "Left": 0.1,
          "Top": 0.15
        },
        "Confidence": 99.5,
        "ExternalImageId": "photo-456"
      }
    }
  ],
  "FaceModelVersion": "face-api.js-1.7.15"
}
```

**Error Responses:**
- `400 InvalidParameterException` - Invalid parameters
- `400 InvalidImageFormatException` - Invalid image format
- `404 ResourceNotFoundException` - Collection not found

---

### Delete Collection

Delete a collection and all its faces.

```http
DELETE /collections/:id
```

**Response:**
```json
{
  "StatusCode": 200
}
```

**Error Responses:**
- `404 ResourceNotFoundException` - Collection not found

---

## Error Responses

All errors follow AWS Rekognition format:

```json
{
  "__type": "InvalidParameterException",
  "message": "Invalid request: ..."
}
```

### Error Types

| Error Type | Status | Description |
|------------|--------|-------------|
| `InvalidParameterException` | 400 | Invalid request parameters |
| `ResourceNotFoundException` | 404 | Collection not found |
| `ResourceAlreadyExistsException` | 400 | Collection already exists |
| `InvalidImageFormatException` | 400 | Invalid image format |
| `ImageTooLargeException` | 400 | Image exceeds size limit |
| `InternalServerError` | 500 | Internal server error |

---

## Examples

### Using cURL

**Create collection:**
```bash
curl -X POST http://localhost:3000/collections \
  -H "Content-Type: application/json" \
  -d '{"CollectionId": "event-123"}'
```

**Index faces:**
```bash
# First, base64 encode your image
IMAGE_BASE64=$(base64 -i photo.jpg)

curl -X POST http://localhost:3000/collections/event-123/index-faces \
  -H "Content-Type: application/json" \
  -d "{
    \"Image\": {\"Bytes\": \"$IMAGE_BASE64\"},
    \"ExternalImageId\": \"photo-456\",
    \"DetectionAttributes\": [\"ALL\"]
  }"
```

**Search faces:**
```bash
# Base64 encode query image
QUERY_BASE64=$(base64 -i query.jpg)

curl -X POST http://localhost:3000/collections/event-123/search-faces-by-image \
  -H "Content-Type: application/json" \
  -d "{
    \"Image\": {\"Bytes\": \"$QUERY_BASE64\"},
    \"MaxFaces\": 10,
    \"FaceMatchThreshold\": 80
  }"
```

**Delete collection:**
```bash
curl -X DELETE http://localhost:3000/collections/event-123
```

### Using Node.js

```javascript
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

// Create collection
async function createCollection(collectionId) {
  const response = await fetch(`${BASE_URL}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ CollectionId: collectionId }),
  });
  return response.json();
}

// Index faces
async function indexFaces(collectionId, imagePath, externalImageId) {
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  const response = await fetch(`${BASE_URL}/collections/${collectionId}/index-faces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Image: { Bytes: imageBase64 },
      ExternalImageId: externalImageId,
      DetectionAttributes: ['ALL'],
    }),
  });
  return response.json();
}

// Search faces
async function searchFaces(collectionId, queryImagePath) {
  const imageBuffer = fs.readFileSync(queryImagePath);
  const imageBase64 = imageBuffer.toString('base64');

  const response = await fetch(`${BASE_URL}/collections/${collectionId}/search-faces-by-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Image: { Bytes: imageBase64 },
      MaxFaces: 10,
      FaceMatchThreshold: 80,
    }),
  });
  return response.json();
}

// Example usage
(async () => {
  await createCollection('event-123');
  await indexFaces('event-123', './photo.jpg', 'photo-456');
  const results = await searchFaces('event-123', './query.jpg');
  console.log('Matches:', results.FaceMatches);
})();
```

---

## Configuration

See `.env.example` for all configuration options.

**Key environment variables:**
- `PORT` - Server port (default: 3000)
- `FACE_PROVIDER` - `sabaiface` or `aws`
- `DATABASE_URL` - PostgreSQL connection string
- `MODELS_PATH` - Path to face-api.js models (SabaiFace only)
- `FACE_CONFIDENCE_THRESHOLD` - Min detection confidence 0-1 (default: 0.5)

---

## Differences from AWS Rekognition

While SabaiFace aims for API compatibility, there are some differences:

1. **Model Version:** Returns `face-api.js-1.7.15` instead of AWS model version
2. **Collection ARN:** Returns `arn:sabaiface:collection:*` format
3. **S3 Support:** S3Object image source not yet supported (use Bytes only)
4. **Attributes:** May have slightly different age/gender/emotion accuracy
5. **Limits:** Different processing limits (configurable)

---

## Performance Notes

- First request after startup may be slower (model loading)
- Face detection: ~100-500ms per image
- Face search: ~50-200ms per query
- Use `FACE_CONFIDENCE_THRESHOLD` to balance speed vs accuracy
- Consider GPU acceleration for high-volume workloads

---

## Next Steps

1. Add authentication middleware
2. Add rate limiting
3. Add metrics/monitoring
4. Deploy to production (Docker/K8s)
5. Add S3 image source support
6. Add batch operations
