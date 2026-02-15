# SabaiFace - Self-Hosted Face Recognition Service

Self-hosted face recognition service using face-api.js + PostgreSQL with pgvector. Provides an AWS Rekognition-compatible interface.

## Features

- ✅ Face detection using SSD MobileNetV1
- ✅ 128-D face descriptor extraction (ResNet-34)
- ✅ 68-point facial landmark detection
- ✅ Age and gender estimation
- ✅ Vector similarity search with PostgreSQL + pgvector
- ✅ AWS Rekognition-compatible API
- ✅ Provider-agnostic domain model

## Architecture

```
┌─────────────────────────────────────────────┐
│           SabaiFace Service                 │
│                                             │
│  ┌─────────────────────────────────────┐  │
│  │   FaceDetector (face-api.js)        │  │
│  │   - Face detection                  │  │
│  │   - Descriptor extraction           │  │
│  │   - Attribute detection             │  │
│  └─────────────────────────────────────┘  │
│                   ↓                         │
│  ┌─────────────────────────────────────┐  │
│  │   PostgresVectorStore (pgvector)    │  │
│  │   - Vector similarity search        │  │
│  │   - HNSW index (cosine distance)    │  │
│  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Requirements

- **Node.js** >= 20.0.0
- **Postgres** >= 14 with **pgvector** extension
- **pnpm** package manager

### Postgres Setup

```sql
-- Enable pgvector extension (run once)
CREATE EXTENSION IF NOT EXISTS vector;
```

## Installation

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Models

Models are already downloaded to `models/` directory (~1.8 MB total).

### 3. Setup Database

Run migrations:

```bash
pnpm --filter=@sabaipics/db migrate
```

## Usage

### Initialize FaceDetector

```typescript
import { FaceDetector } from '@sabaipics/sabaiface';

const detector = new FaceDetector({
  modelsPath: './models',
  minConfidence: 0.5,
  detectAttributes: true, // age, gender
});

// Load models (takes 2-3 seconds, do once at startup)
await detector.loadModels();
```

### Create SabaiFace Service

```typescript
import { createSabaiFaceService } from '@sabaipics/sabaiface';
import { db } from '@sabaipics/db';

const faceService = createSabaiFaceService(detector, db);
```

### Index a Photo

```typescript
const result = await faceService.indexPhoto({
  eventId: 'event-123',
  photoId: 'photo-456',
  imageData: imageBuffer, // ArrayBuffer
  options: {
    maxFaces: 100,
    minConfidence: 0.5,
  },
});

console.log(`Indexed ${result.faces.length} faces`);
```

### Search for Similar Faces

```typescript
const similarFaces = await faceService.findSimilarFaces({
  eventId: 'event-123',
  imageData: queryImageBuffer,
  maxResults: 10,
  minSimilarity: 0.8, // 0-1 scale
});

for (const face of similarFaces) {
  console.log(`Face ${face.faceId}: ${face.similarity * 100}% similar`);
}
```

## Configuration

See `.env.example` for all configuration options.

## Testing

### Run Tests

```bash
pnpm test
```

Integration tests will skip gracefully if test images are not available.

## Performance

### Model Loading

- Cold start: 2-3 seconds (load models once at startup)
- Models size: ~1.8 MB (all models)

### Face Detection

- Single face: ~100-200ms
- Multiple faces (5): ~300-500ms
- Performance scales linearly with number of faces

### Vector Search

- Sub-second for <10k faces with HNSW index
- Cosine distance metric
- O(log n) complexity with HNSW

## Comparison with AWS Rekognition

| Feature | AWS Rekognition | SabaiFace |
|---------|----------------|-----------|
| Face Detection | ✅ | ✅ |
| Face Search | ✅ | ✅ |
| Landmarks | ✅ | ✅ (68-point) |
| Age/Gender | ✅ | ✅ |
| Cost | $1.50/1k images | Self-hosted |
| Accuracy | 99%+ | 99.38% (LFW benchmark) |
| Latency | ~100ms | ~200ms |
| Control | Limited | Full control |

## Development Status

**Completed:**
- ✅ Postgres + pgvector integration
- ✅ VectorStore abstraction with PostgresVectorStore implementation
- ✅ Database schema with vector descriptors and HNSW index
- ✅ face-api.js integration for face detection
- ✅ FaceDetector wrapper with full functionality
- ✅ SabaiFaceAdapter implementation
- ✅ Integration tests

**Next:**
- HTTP API layer (Hono)
- Docker containerization
- Production deployment

## License

Private - SabaiPics internal use only.
