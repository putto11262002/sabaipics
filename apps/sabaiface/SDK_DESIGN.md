# SabaiFace SDK Design

## Overview

SDK to expose face recognition capabilities (SabaiFace + AWS Rekognition) to the API layer.

## Package Structure

```
apps/sabaiface/
├── src/
│   ├── sdk/                    # SDK exports
│   │   ├── index.ts           # Main entry point
│   │   ├── client.ts          # FaceRecognitionClient class
│   │   ├── types.ts           # Public types
│   │   └── errors.ts          # Error classes
│   ├── domain/                # Domain layer (existing)
│   ├── core/                  # Core implementations (existing)
│   ├── adapters/              # Provider adapters (existing)
│   └── factory/               # Internal factories (existing)
```

## Public API

### 1. Main Entry Point

```typescript
// apps/sabaiface/src/sdk/index.ts

export { FaceRecognitionClient, createFaceClient } from './client';
export type {
  FaceClientConfig,
  IndexPhotoRequest,
  IndexPhotoResponse,
  SearchSimilarRequest,
  SearchSimilarResponse,
  Face,
  SimilarFace,
} from './types';
export {
  FaceRecognitionError,
  FaceNotFoundError,
  InvalidImageError,
} from './errors';
```

### 2. Client Class

```typescript
// apps/sabaiface/src/sdk/client.ts

import type { Database } from '@sabaipics/db';

export interface FaceClientConfig {
  provider: 'sabaiface' | 'aws';
  database: Database;

  // SabaiFace options
  sabaiface?: {
    modelsPath?: string;
    minConfidence?: number;
  };

  // AWS Rekognition options
  aws?: {
    region?: string;
    collectionPrefix?: string;
  };
}

export class FaceRecognitionClient {
  constructor(config: FaceClientConfig);

  /**
   * Index faces in a photo
   */
  async indexPhoto(request: IndexPhotoRequest): Promise<IndexPhotoResponse>;

  /**
   * Search for similar faces
   */
  async searchSimilar(request: SearchSimilarRequest): Promise<SearchSimilarResponse>;

  /**
   * Delete faces by ID
   */
  async deleteFaces(eventId: string, faceIds: string[]): Promise<void>;

  /**
   * Delete entire collection
   */
  async deleteCollection(eventId: string): Promise<void>;

  /**
   * Create a new collection
   */
  async createCollection(eventId: string): Promise<string>;
}

/**
 * Factory function to create a face recognition client
 */
export function createFaceClient(config: FaceClientConfig): FaceRecognitionClient;
```

### 3. Request/Response Types

```typescript
// apps/sabaiface/src/sdk/types.ts

export interface IndexPhotoRequest {
  eventId: string;
  photoId: string;
  imageUrl?: string;      // S3 URL
  imageBuffer?: Buffer;   // Raw image data
  options?: {
    maxFaces?: number;
    minConfidence?: number;
    detectAttributes?: boolean;
  };
}

export interface IndexPhotoResponse {
  faces: Face[];
  unindexedFaces: UnindexedFace[];
  provider: 'sabaiface' | 'aws';
}

export interface Face {
  faceId: string;
  boundingBox: BoundingBox;
  confidence: number;
  externalImageId: string;
  attributes?: FaceAttributes;
  provider: 'sabaiface' | 'aws';
}

export interface BoundingBox {
  width: number;   // 0-1 ratio
  height: number;
  left: number;
  top: number;
}

export interface FaceAttributes {
  age?: { min: number; max: number };
  gender?: { value: string; confidence: number };
  emotions?: Array<{ type: string; confidence: number }>;
}

export interface SearchSimilarRequest {
  eventId: string;
  imageUrl?: string;
  imageBuffer?: Buffer;
  maxResults?: number;
  minSimilarity?: number;
}

export interface SearchSimilarResponse {
  faces: SimilarFace[];
}

export interface SimilarFace {
  faceId: string;
  similarity: number;      // 0-1 (percentage match)
  boundingBox?: BoundingBox;
  confidence?: number;
  externalImageId: string;
  provider: 'sabaiface' | 'aws';
}

export interface UnindexedFace {
  reasons: string[];
  boundingBox?: BoundingBox;
}
```

### 4. Error Classes

```typescript
// apps/sabaiface/src/sdk/errors.ts

export class FaceRecognitionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'FaceRecognitionError';
  }
}

export class FaceNotFoundError extends FaceRecognitionError {
  constructor(faceId: string) {
    super(`Face not found: ${faceId}`, 'FACE_NOT_FOUND');
  }
}

export class InvalidImageError extends FaceRecognitionError {
  constructor(reason: string) {
    super(`Invalid image: ${reason}`, 'INVALID_IMAGE');
  }
}

export class CollectionNotFoundError extends FaceRecognitionError {
  constructor(collectionId: string) {
    super(`Collection not found: ${collectionId}`, 'COLLECTION_NOT_FOUND');
  }
}
```

## Usage Examples

### Example 1: In API Route (Hono)

```typescript
// apps/api/src/routes/photos.ts

import { createFaceClient } from '@sabaipics/face-recognition';
import { createDb } from '@sabaipics/db';

const db = createDb(process.env.DATABASE_URL);
const faceClient = createFaceClient({
  provider: 'sabaiface',
  database: db,
  sabaiface: {
    minConfidence: 0.3,
  },
});

// Index photo after upload
app.post('/events/:eventId/photos/:photoId/index', async (c) => {
  const { eventId, photoId } = c.req.param();
  const imageUrl = c.req.query('imageUrl');

  try {
    const result = await faceClient.indexPhoto({
      eventId,
      photoId,
      imageUrl,
      options: {
        maxFaces: 100,
        detectAttributes: true,
      },
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
    throw error;
  }
});

// Search for similar faces
app.post('/events/:eventId/search', async (c) => {
  const { eventId } = c.req.param();
  const { imageUrl } = await c.req.json();

  const result = await faceClient.searchSimilar({
    eventId,
    imageUrl,
    maxResults: 10,
    minSimilarity: 0.8,
  });

  return c.json({
    matches: result.faces,
    count: result.faces.length,
  });
});
```

### Example 2: In Background Job

```typescript
// apps/api/src/queue/photo-indexer.ts

import { createFaceClient } from '@sabaipics/face-recognition';

const faceClient = createFaceClient({
  provider: process.env.FACE_PROVIDER as 'sabaiface' | 'aws',
  database: db,
});

async function indexPhotoJob(eventId: string, photoId: string) {
  const photo = await db.query.photos.findFirst({
    where: eq(photos.id, photoId),
  });

  if (!photo) {
    throw new Error('Photo not found');
  }

  // Index faces
  const result = await faceClient.indexPhoto({
    eventId,
    photoId,
    imageUrl: photo.url,
  });

  // Update photo metadata
  await db.update(photos)
    .set({
      faceCount: result.faces.length,
      indexed: true,
    })
    .where(eq(photos.id, photoId));

  console.log(`Indexed ${result.faces.length} faces in photo ${photoId}`);
}
```

### Example 3: Provider Switching

```typescript
// Easy to switch between providers via config

const sabaiFaceClient = createFaceClient({
  provider: 'sabaiface',
  database: db,
  sabaiface: {
    minConfidence: 0.3,
  },
});

const awsClient = createFaceClient({
  provider: 'aws',
  database: db,
  aws: {
    region: 'us-east-1',
    collectionPrefix: 'sabaipics-',
  },
});

// Same API for both providers
await sabaiFaceClient.indexPhoto({ ... });
await awsClient.indexPhoto({ ... });
```

## Implementation Priorities

### Phase 1: Core SDK
1. ✅ Implement `FaceRecognitionClient` class
2. ✅ Implement `createFaceClient` factory
3. ✅ Export public types
4. ✅ Export error classes

### Phase 2: Image Handling
1. ✅ Add S3 image fetching (for imageUrl support)
2. ✅ Add image validation
3. ✅ Add image format conversion

### Phase 3: API Integration
1. ✅ Create API routes
2. ✅ Add queue consumer
3. ✅ Add error handling middleware

## Package Configuration

```json
// apps/sabaiface/package.json
{
  "name": "@sabaipics/face-recognition",
  "version": "1.0.0",
  "main": "./dist/sdk/index.js",
  "types": "./dist/sdk/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/sdk/index.js",
      "types": "./dist/sdk/index.d.ts"
    }
  }
}
```

## Benefits

1. **Clean API**: Simple, intuitive interface for API developers
2. **Type Safety**: Full TypeScript support with exported types
3. **Provider Agnostic**: Switch between SabaiFace and AWS easily
4. **Error Handling**: Structured error classes for better error handling
5. **Testable**: Easy to mock for testing
6. **Documentation**: Clear request/response types
