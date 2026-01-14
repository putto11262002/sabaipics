# Face Recognition SDK API Reference

TypeScript/JavaScript SDK for face recognition using SabaiFace or AWS Rekognition.

## Package

```bash
npm install @sabaipics/face-recognition
```

## Overview

The SDK provides two client classes with identical interfaces:

- **`SabaiFaceHTTPClient`** - Connect to your self-hosted SabaiFace service
- **`AWSRekognitionClient`** - Connect to AWS Rekognition

Both return `ResultAsync<T, FaceServiceError>` for type-safe error handling.

---

## Quick Start

```typescript
import { SabaiFaceHTTPClient } from '@sabaipics/face-recognition';

// Initialize client
const client = new SabaiFaceHTTPClient({
  endpoint: 'http://localhost:8086',
});

// Create collection
const createResult = await client.createCollection('event-123');
if (createResult.isErr()) {
  console.error('Failed:', createResult.error);
  return;
}

// Index faces
const imageBuffer = await fs.readFile('photo.jpg');
const indexResult = await client.indexPhoto({
  eventId: 'event-123',
  photoId: 'photo-456',
  imageData: imageBuffer.buffer,
});

// Handle result
indexResult.match(
  (indexed) => {
    console.log(`Found ${indexed.faces.length} faces`);
    indexed.faces.forEach(face => {
      console.log(`  Face: ${face.faceId}, Confidence: ${face.confidence}`);
    });
  },
  (error) => {
    console.error('Index failed:', error);
    if (error.retryable) {
      // Retry with backoff
    }
  }
);
```

---

## Clients

### SabaiFaceHTTPClient

Connect to your self-hosted SabaiFace service via HTTP.

```typescript
import { SabaiFaceHTTPClient } from '@sabaipics/face-recognition';

const client = new SabaiFaceHTTPClient({
  endpoint: 'https://sabaiface.example.com',
});
```

**Configuration:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `endpoint` | string | Yes | SabaiFace service URL |

---

### AWSRekognitionClient

Connect to AWS Rekognition using AWS SDK.

```typescript
import { AWSRekognitionClient } from '@sabaipics/face-recognition';

const client = new AWSRekognitionClient({
  region: 'us-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
```

**Configuration:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `region` | string | Yes | AWS region |
| `credentials.accessKeyId` | string | Yes | AWS access key |
| `credentials.secretAccessKey` | string | Yes | AWS secret key |

---

## Methods

### createCollection

Create a new face collection (event).

```typescript
createCollection(
  eventId: string
): ResultAsync<string, FaceServiceError>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventId` | string | Unique collection/event ID |

**Returns:** `ResultAsync<string, FaceServiceError>`

- **Success:** Collection ARN string
- **Error:** `conflict` if collection exists

**Example:**
```typescript
const result = await client.createCollection('event-123');

result.match(
  (arn) => console.log('Created:', arn),
  (err) => console.error('Failed:', err.type)
);
```

---

### deleteCollection

Delete a collection and all indexed faces.

```typescript
deleteCollection(
  eventId: string
): ResultAsync<void, FaceServiceError>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventId` | string | Collection ID to delete |

**Returns:** `ResultAsync<void, FaceServiceError>`

**Example:**
```typescript
const result = await client.deleteCollection('event-123');
```

---

### indexPhoto

Detect and index faces from an image.

```typescript
indexPhoto(
  request: IndexPhotoRequest
): ResultAsync<PhotoIndexed, FaceServiceError>
```

**Request:**

```typescript
interface IndexPhotoRequest {
  eventId: string;
  photoId: string;
  imageData: ArrayBuffer;
  options?: {
    maxFaces?: number;           // Default: 100
    qualityFilter?: 'auto' | 'none'; // Default: 'auto'
  };
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `eventId` | string | Yes | - | Collection ID |
| `photoId` | string | Yes | - | Your photo identifier |
| `imageData` | ArrayBuffer | Yes | - | Image bytes |
| `options.maxFaces` | number | No | 100 | Max faces to index |
| `options.qualityFilter` | `'auto' \| 'none'` | No | `'auto'` | Filter blurry faces |

**Returns:** `ResultAsync<PhotoIndexed, FaceServiceError>`

**Success Response:**

```typescript
interface PhotoIndexed {
  faces: Face[];                 // Successfully indexed faces
  unindexedFaces: UnindexedFace[]; // Faces that couldn't be indexed
  modelVersion?: string;
  provider: 'aws' | 'sabaiface';
}
```

**Example:**
```typescript
const imageBuffer = await fs.readFile('photo.jpg');

const result = await client.indexPhoto({
  eventId: 'event-123',
  photoId: 'photo-456',
  imageData: imageBuffer.buffer,
  options: {
    maxFaces: 100,
    qualityFilter: 'auto',
  },
});

result.match(
  (indexed) => {
    console.log(`Indexed ${indexed.faces.length} faces`);
    indexed.faces.forEach(face => {
      console.log(`  ${face.externalImageId}: ${face.confidence}`);
    });
  },
  (err) => {
    if (err.retryable) {
      // Retry logic
    }
  }
);
```

---

### findSimilarFaces

Search for faces similar to a query image.

```typescript
findSimilarFaces(
  request: FindSimilarRequest
): ResultAsync<SimilarFace[], FaceServiceError>
```

**Request:**

```typescript
interface FindSimilarRequest {
  eventId: string;
  imageData: ArrayBuffer;
  maxResults?: number;     // Default: 10
  minSimilarity?: number;  // Default: 0.8 (0-1 scale)
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `eventId` | string | Yes | - | Collection ID |
| `imageData` | ArrayBuffer | Yes | - | Query image bytes |
| `maxResults` | number | No | 10 | Max results to return |
| `minSimilarity` | number | No | 0.8 | Min similarity (0-1) |

**Returns:** `ResultAsync<SimilarFace[], FaceServiceError>`

**Success Response:**

```typescript
interface SimilarFace {
  faceId: string;
  similarity: number;          // 0-1, higher = more similar
  boundingBox?: BoundingBox;
  confidence?: number;
  externalImageId?: string;
  provider: 'aws' | 'sabaiface';
}
```

**Example:**
```typescript
const queryBuffer = await fs.readFile('query.jpg');

const result = await client.findSimilarFaces({
  eventId: 'event-123',
  imageData: queryBuffer.buffer,
  maxResults: 10,
  minSimilarity: 0.8,
});

result.match(
  (matches) => {
    console.log(`Found ${matches.length} matches`);
    matches.forEach(match => {
      console.log(`  ${match.externalImageId}: ${match.similarity}`);
    });
  },
  (err) => console.error('Search failed:', err)
);
```

---

### deleteFaces

Delete specific faces from a collection.

```typescript
deleteFaces(
  eventId: string,
  faceIds: string[]
): ResultAsync<void, FaceServiceError>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventId` | string | Collection ID |
| `faceIds` | string[] | Face IDs to delete |

**Example:**
```typescript
const result = await client.deleteFaces('event-123', [
  'face-id-1',
  'face-id-2',
]);
```

---

## Types

### Face

A detected and indexed face.

```typescript
interface Face {
  faceId: string;              // Provider's face identifier
  boundingBox: BoundingBox;    // Face location
  confidence: number;          // Detection confidence (0-1)
  externalImageId?: string;    // Your photo ID
  attributes?: FaceAttributes; // Age, gender, emotions
  provider: 'aws' | 'sabaiface';
}
```

### BoundingBox

Face location as relative coordinates (0-1).

```typescript
interface BoundingBox {
  width: number;   // 0-1: width as % of image width
  height: number;  // 0-1: height as % of image height
  left: number;    // 0-1: left edge as % of image width
  top: number;     // 0-1: top edge as % of image height
}
```

### FaceAttributes

Optional face analysis results.

```typescript
interface FaceAttributes {
  age?: { low?: number; high?: number };
  gender?: { value: string; confidence: number };
  emotions?: Array<{ type: string; confidence: number }>;
  smile?: { value: boolean; confidence: number };
  eyeglasses?: { value: boolean; confidence: number };
  sunglasses?: { value: boolean; confidence: number };
  beard?: { value: boolean; confidence: number };
  mustache?: { value: boolean; confidence: number };
  eyesOpen?: { value: boolean; confidence: number };
  mouthOpen?: { value: boolean; confidence: number };
}
```

### UnindexedFace

A face that couldn't be indexed.

```typescript
interface UnindexedFace {
  faceDetail?: {
    boundingBox?: BoundingBox;
    confidence?: number;
  };
  reasons?: string[];  // e.g., ['LOW_QUALITY', 'FACE_TOO_SMALL']
}
```

---

## Error Handling

All methods return `ResultAsync<T, FaceServiceError>` from the `neverthrow` library.

### Using .match()

```typescript
const result = await client.indexPhoto(request);

result.match(
  (value) => {
    // Success case
    console.log('Success:', value);
  },
  (error) => {
    // Error case
    console.error('Error:', error.type);
  }
);
```

### Using .isErr() / .isOk()

```typescript
const result = await client.indexPhoto(request);

if (result.isErr()) {
  const error = result.error;
  console.error('Error:', error.type);

  if (error.retryable) {
    // Retry with backoff
  }
  if (error.throttle) {
    // Rate limit - use longer backoff
  }
  return;
}

const value = result.value;
console.log('Success:', value);
```

### Using .andThen() / .map()

Chain operations:

```typescript
const result = await client.indexPhoto(request)
  .andThen((indexed) => {
    console.log(`Indexed ${indexed.faces.length} faces`);
    return client.findSimilarFaces({ ... });
  })
  .map((matches) => matches.length);
```

### Error Types

| Type | Retryable | Throttle | Description |
|------|-----------|----------|-------------|
| `not_found` | No | No | Collection/face not found |
| `invalid_input` | No | No | Invalid parameters |
| `provider_failed` (AWS) | Depends | Depends | AWS SDK error |
| `provider_failed` (SabaiFace) | Depends | Depends | HTTP/Server error |
| `database` | Yes | No | Database error |

---

## Best Practices

### 1. Retry Logic

```typescript
async function callWithRetry<T>(
  fn: () => ResultAsync<T, FaceServiceError>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await fn();

    if (result.isOk()) return result.value;

    const error = result.error;
    if (!error.retryable) throw error;

    // Exponential backoff
    const delay = Math.pow(2, attempt) * 1000;
    if (error.throttle) {
      await sleep(delay * 2); // Longer for rate limits
    } else {
      await sleep(delay);
    }
  }

  throw new Error('Max retries exceeded');
}

// Usage
const indexed = await callWithRetry(() =>
  client.indexPhoto(request)
);
```

### 2. ArrayBuffer Conversion

```typescript
// From file
import { promises as fs } from 'fs';

const buffer = await fs.readFile('photo.jpg');
const arrayBuffer = buffer.buffer.slice(
  buffer.byteOffset,
  buffer.byteOffset + buffer.byteLength
);

// From fetch
const response = await fetch(url);
const arrayBuffer = await response.arrayBuffer();

// From base64 string
const binaryString = atob(base64String);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i);
}
const arrayBuffer = bytes.buffer;
```

### 3. Cloudflare Workers Usage

```typescript
import { SabaiFaceHTTPClient } from '@sabaipics/face-recognition';

export default {
  async fetch(request, env, ctx) {
    const client = new SabaiFaceHTTPClient({
      endpoint: 'https://sabaiface.example.com',
    });

    // Process photo from R2
    const object = await env.BUCKET.get(key);
    const imageData = await object.arrayBuffer();

    const result = await client.indexPhoto({
      eventId: 'event-123',
      photoId: key,
      imageData,
    });

    if (result.isErr()) {
      return new Response(result.error.type, { status: 500 });
    }

    return new Response(JSON.stringify(result.value));
  },
};
```

---

## Full Example

```typescript
import { SabaiFaceHTTPClient } from '@sabaipics/face-recognition';
import { promises as fs } from 'fs';

const client = new SabaiFaceHTTPClient({
  endpoint: process.env.SABAIFACE_ENDPOINT!,
});

async function processEvent(eventId: string, photos: string[]) {
  // Create collection
  await client.createCollection(eventId);

  const allFaces: Map<string, string[]> = new Map();

  // Index all photos
  for (const photoPath of photos) {
    const buffer = await fs.readFile(photoPath);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );

    const result = await client.indexPhoto({
      eventId,
      photoId: photoPath,
      imageData: arrayBuffer,
    });

    if (result.isErr()) {
      console.error(`Failed to index ${photoPath}:`, result.error);
      continue;
    }

    const indexed = result.value;
    indexed.faces.forEach(face => {
      if (!allFaces.has(face.faceId)) {
        allFaces.set(face.faceId, []);
      }
      allFaces.get(face.faceId)!.push(photoPath);
    });
  }

  // Find groups (faces appearing in multiple photos)
  const groups = Array.from(allFaces.entries())
    .filter(([_, photos]) => photos.length > 1)
    .map(([faceId, photos]) => ({ faceId, photos }));

  console.log(`Found ${groups.length} face groups`);

  // Cleanup
  await client.deleteCollection(eventId);

  return groups;
}
```

---

## TypeScript Support

All types are exported for full TypeScript support:

```typescript
import type {
  Face,
  BoundingBox,
  FaceAttributes,
  PhotoIndexed,
  SimilarFace,
  UnindexedFace,
  IndexPhotoRequest,
  FindSimilarRequest,
  FaceServiceError,
} from '@sabaipics/face-recognition';
```
