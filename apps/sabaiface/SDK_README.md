# @sabaipics/face-recognition SDK

Clean, typed SDK for face recognition operations with support for both SabaiFace (self-hosted) and AWS Rekognition providers.

## Installation

```bash
# The SDK is part of the sabaiface package
pnpm add @sabaipics/face-recognition
```

## Quick Start

```typescript
import { createFaceClient } from '@sabaipics/face-recognition';
import { createDb } from '@sabaipics/db';

// Initialize database
const db = createDb(process.env.DATABASE_URL);

// Create face recognition client
const faceClient = createFaceClient({
  provider: 'sabaiface',
  database: db,
  sabaiface: {
    minConfidence: 0.3,
  },
});

// Index a photo
const result = await faceClient.indexPhoto({
  eventId: 'event-123',
  photoId: 'photo-456',
  imageUrl: 'https://example.com/photo.jpg',
});

console.log(`Detected ${result.faces.length} faces`);

// Search for similar faces
const matches = await faceClient.searchSimilar({
  eventId: 'event-123',
  imageUrl: 'https://example.com/query.jpg',
  minSimilarity: 0.8,
});

console.log(`Found ${matches.faces.length} similar faces`);
```

## Configuration

### SabaiFace Provider (Self-Hosted)

```typescript
const client = createFaceClient({
  provider: 'sabaiface',
  database: db,
  sabaiface: {
    modelsPath: './models',     // Path to face-api.js models
    minConfidence: 0.3,          // Detection confidence threshold (0-1)
  },
});
```

**Confidence Threshold Guide:**
- `0.3` - Detect more faces, may include false positives (recommended)
- `0.5` - Balanced detection (default)
- `0.7` - Conservative, fewer false positives but may miss faces

### AWS Rekognition Provider

```typescript
const client = createFaceClient({
  provider: 'aws',
  database: db,
  aws: {
    region: 'us-east-1',
    collectionPrefix: 'sabaipics-',
  },
});
```

## API Reference

### `indexPhoto(request)`

Index faces in a photo and store them for later search.

```typescript
const result = await client.indexPhoto({
  eventId: 'event-123',
  photoId: 'photo-456',
  imageUrl: 'https://...',        // Either imageUrl
  imageBuffer: Buffer.from(...),  // or imageBuffer
  options: {
    maxFaces: 100,               // Max faces to detect
    minConfidence: 0.3,          // Override default confidence
    detectAttributes: true,       // Detect age, gender, etc.
  },
});

// Response
{
  faces: [
    {
      faceId: 'face-uuid',
      boundingBox: { left: 0.1, top: 0.2, width: 0.3, height: 0.4 },
      confidence: 0.95,
      externalImageId: 'photo-456',
      attributes: {
        age: { min: 25, max: 35 },
        gender: { value: 'male', confidence: 0.9 },
      },
      provider: 'sabaiface',
    },
  ],
  unindexedFaces: [],
  provider: 'sabaiface',
}
```

### `searchSimilar(request)`

Search for similar faces in an event collection.

```typescript
const result = await client.searchSimilar({
  eventId: 'event-123',
  imageUrl: 'https://...',
  maxResults: 10,
  minSimilarity: 0.8,  // 80% similarity threshold
});

// Response
{
  faces: [
    {
      faceId: 'face-uuid',
      similarity: 0.95,         // 0-1 (95% match)
      externalImageId: 'photo-456',
      boundingBox: { ... },
      confidence: 0.9,
      provider: 'sabaiface',
    },
  ],
}
```

### `createCollection(eventId)`

Create a new collection for storing faces.

```typescript
const collectionId = await client.createCollection('event-123');
// Returns: 'sabaiface:event-123' or AWS collection ID
```

### `deleteCollection(eventId)`

Delete an entire collection and all its faces.

```typescript
await client.deleteCollection('event-123');
```

### `deleteFaces(eventId, faceIds)`

Delete specific faces from a collection.

```typescript
await client.deleteFaces('event-123', ['face-1', 'face-2']);
```

## Error Handling

The SDK provides structured error classes for better error handling:

```typescript
import {
  FaceRecognitionError,
  InvalidImageError,
  NoFacesDetectedError,
  ImageFetchError,
} from '@sabaipics/face-recognition';

try {
  await client.indexPhoto({ ... });
} catch (error) {
  if (error instanceof InvalidImageError) {
    // Handle invalid image (400)
    console.error('Invalid image:', error.message);
  } else if (error instanceof NoFacesDetectedError) {
    // Handle no faces detected (400)
    console.log('No faces found in image');
  } else if (error instanceof ImageFetchError) {
    // Handle image fetch error (400)
    console.error('Failed to fetch image:', error.message);
  } else if (error instanceof FaceRecognitionError) {
    // Handle generic face recognition error
    console.error('Face recognition error:', error.code, error.message);
  }
}
```

### Error Types

| Error Class | Status Code | Description |
|------------|-------------|-------------|
| `InvalidImageError` | 400 | Invalid image format or data |
| `NoFacesDetectedError` | 400 | No faces detected in image |
| `ImageFetchError` | 400 | Failed to fetch image from URL |
| `FaceNotFoundError` | 404 | Face ID not found |
| `CollectionNotFoundError` | 404 | Collection not found |
| `FaceRecognitionError` | 500 | Generic error |

## Usage in API Routes

See `examples/api-usage.ts` for a complete example of using the SDK in Hono API routes.

```typescript
// POST /events/:eventId/photos/:photoId/index
app.post('/events/:eventId/photos/:photoId/index', async (c) => {
  const { eventId, photoId } = c.req.param();
  const { imageUrl } = await c.req.json();

  try {
    const result = await faceClient.indexPhoto({
      eventId,
      photoId,
      imageUrl,
    });

    return c.json({
      success: true,
      facesDetected: result.faces.length,
      faces: result.faces,
    });
  } catch (error) {
    if (error instanceof InvalidImageError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});
```

## Usage in Background Jobs

```typescript
async function indexPhotoJob(eventId: string, photoId: string, imageUrl: string) {
  try {
    const result = await faceClient.indexPhoto({
      eventId,
      photoId,
      imageUrl,
    });

    console.log(`Indexed ${result.faces.length} faces`);

    // Update photo metadata
    await updatePhotoMetadata(photoId, {
      faceCount: result.faces.length,
      indexed: true,
    });
  } catch (error) {
    console.error('Failed to index photo:', error);
    throw error;
  }
}
```

## Provider Switching

Easily switch between providers by changing the configuration:

```typescript
// Development: Use SabaiFace (self-hosted)
const devClient = createFaceClient({
  provider: 'sabaiface',
  database: db,
});

// Production: Use AWS Rekognition
const prodClient = createFaceClient({
  provider: 'aws',
  database: db,
  aws: {
    region: 'us-east-1',
  },
});

// Same API for both providers
await devClient.indexPhoto({ ... });
await prodClient.indexPhoto({ ... });
```

## TypeScript Support

The SDK is fully typed with TypeScript:

```typescript
import type {
  IndexPhotoRequest,
  IndexPhotoResponse,
  SearchSimilarRequest,
  SearchSimilarResponse,
  Face,
  SimilarFace,
} from '@sabaipics/face-recognition';
```

## Performance Tips

1. **Reuse client instance**: Create one client instance and reuse it
2. **Use background jobs**: Index photos asynchronously in background jobs
3. **Adjust confidence threshold**: Lower threshold (0.3) detects more faces
4. **Batch operations**: Process multiple photos in parallel
5. **Image optimization**: Resize large images before sending to API

## Troubleshooting

### Models not loading (SabaiFace)

Ensure face-api.js models are downloaded:
```bash
cd apps/sabaiface
pnpm download-models
```

### Low detection accuracy

Try lowering the confidence threshold:
```typescript
sabaiface: {
  minConfidence: 0.3  // Lower = detect more faces
}
```

### Memory issues

Reduce image size or process fewer images in parallel.

## License

MIT
