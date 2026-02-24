# Tech Docs Context

Task: T-16 (Photo Upload API - POST /events/:id/photos)
Root: BS_0001_S-1
Date: 2026-01-11
Scout: Tech Docs Scout

---

## Must-Follow Conventions

### 1. API Framework & Stack

**Framework/Runtime:**

- Hono ^4.10.7 on Cloudflare Workers (compatibility_date: 2025-12-06)
- Validation: Zod ^4.1.13 with @hono/zod-validator
- TypeScript 5.9.2
- Wrangler ^4.20.0 (CLI)

**Route Pattern:**

- Routes defined in `apps/api/src/routes/`
- Use Hono router with method chaining
- Export router from dedicated file (e.g., `export const eventsRouter`)
- Mount in main app via `.route("/events", eventsRouter)` (currently named `photosRouter`)

**File Location:**

- Main app: `apps/api/src/index.ts`
- Events routes: `apps/api/src/routes/events/index.ts` (currently mounted as `photosRouter`)
- Schemas: `apps/api/src/routes/events/schema.ts`

---

### 2. Authentication & Authorization

**Clerk Authentication:**

- Package: `@sabaipics/auth/middleware`
- Middleware: `requirePhotographer()` - validates Clerk session, loads photographer from DB
- Context injection: `c.var.photographer` (type: `Photographer`)
- Auth context: `c.var.auth` (type: `{ userId: string; sessionId: string }`)

**PDPA Consent:**

- Middleware: `requireConsent()` - ensures photographer has accepted PDPA
- Must be used AFTER `requirePhotographer()`
- Returns 403 if consent not given

**Authorization Pattern (from T-13):**

```typescript
// Verify photographer owns the event
if (event.photographerId !== photographer.id) {
  // Return NOT_FOUND instead of FORBIDDEN to prevent enumeration
  return c.json(notFoundError(), 404);
}
```

**Middleware Order:**

```typescript
.post(
  "/:id/photos",
  requirePhotographer(),
  requireConsent(),
  zValidator("param", eventParamsSchema),
  // ... handler
)
```

---

### 3. Request/Response Contracts

**Success Response (201 Created):**

```typescript
{
  data: {
    id: string;
    eventId: string;
    r2Key: string;
    status: 'processing' | 'indexed' | 'failed';
    faceCount: number;
    uploadedAt: string; // ISO timestamp
  }
}
```

**Error Response Patterns:**

```typescript
// Standard error shape
{
  error: {
    code: "ERROR_CODE",
    message: "Human-readable message"
  }
}

// Common error helpers (define per route file)
function notFoundError(message: string = "Event not found") {
  return {
    error: {
      code: "NOT_FOUND" as const,
      message,
    },
  };
}

function validationError(message: string) {
  return {
    error: {
      code: "VALIDATION_ERROR" as const,
      message,
    },
  };
}

function uploadFailedError(reason: string) {
  return {
    error: {
      code: "UPLOAD_FAILED" as const,
      message: reason,
    },
  };
}
```

**Status Codes:**

- 201: Successful POST (created)
- 400: Validation error (bad request)
- 401: Unauthenticated (Clerk middleware handles)
- 403: Forbidden (no PDPA consent, or unauthorized)
- 404: Not found (event doesn't exist or not owned by photographer)
- 413: Payload too large (file size limit exceeded)
- 415: Unsupported media type (invalid file format)
- 500: Server error (R2 upload failed, queue send failed)

---

### 4. Validation with Zod

**Pattern:**

```typescript
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

// URL param validation
const eventParamsSchema = z.object({
  id: z.string().uuid(),
});

// Multipart/form-data validation (for file uploads)
// NOTE: Hono doesn't have native zValidator for multipart, must validate manually
// Use c.req.parseBody() then validate
```

**File Upload Validation (from cf-upload-limits.md research):**

```typescript
const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50 MB
  MAX_IMAGE_DIMENSION: 10000, // 10,000 px (100 megapixels)
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
} as const;
```

**File Validation Steps:**

1. Check file exists in form data
2. Validate file size <= 50 MB
3. Validate MIME type (magic bytes, not just extension)
4. Return 413 for oversized files
5. Return 415 for unsupported formats

---

### 5. Database Patterns (Drizzle ORM)

**ORM:** Drizzle ORM ^0.45.0
**Driver:** @neondatabase/serverless ^1.0.2
**Database:** Neon Postgres (serverless)

**DB Client Injection:**

```typescript
// DB client available via middleware
const db = c.var.db();
```

**Query Patterns:**

```typescript
import { eq, and, desc, sql } from 'drizzle-orm';
import { events, photos } from '@sabaipics/db';

// Select
const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);

// Insert with returning
const [created] = await db
  .insert(photos)
  .values({
    eventId,
    r2Key,
    status: 'processing',
    faceCount: 0,
  })
  .returning();
```

**Relevant Schemas:**

**events table** (`packages/db/src/schema/events.ts`):

```typescript
{
  id: uuid,
  photographerId: uuid,
  name: text,
  startDate: timestamptz,
  endDate: timestamptz,
  accessCode: text (unique),
  qrCodeR2Key: text,
  rekognitionCollectionId: text, // Nullable, created on first upload
  expiresAt: timestamptz,
  createdAt: timestamptz
}
```

**photos table** (`packages/db/src/schema/photos.ts`):

```typescript
{
  id: uuid (pk),
  eventId: uuid (fk -> events.id, onDelete: restrict),
  r2Key: text, // Format: "{eventId}/{photoId}.jpg"
  status: enum ["processing", "indexed", "failed"],
  faceCount: integer (default: 0),
  uploadedAt: timestamptz
}
```

---

### 6. Cloudflare Primitives

**R2 Storage:**

- Binding: `c.env.PHOTOS_BUCKET` (type: `R2Bucket`)
- Configured in: `apps/api/wrangler.jsonc`
- Bucket name: `sabaipics-photos` (dev), `sabaipics-photos-staging` (staging)

**R2 Upload Pattern:**

```typescript
// From T-13 (QR code upload example)
const r2Key = `events/${eventId}/${photoId}.jpg`;

await c.env.PHOTOS_BUCKET.put(r2Key, imageBytes, {
  httpMetadata: { contentType: 'image/jpeg' },
});
```

**R2 Key Convention:**

- Events QR codes: `qr/{accessCode}.png`
- Photos: `{eventId}/{photoId}.jpg` (normalized JPEG)

**Cloudflare Queues:**

- Producer binding: `c.env.PHOTO_QUEUE` (type: `Queue<PhotoJob>`)
- Queue name: `photo-processing` (dev), `photo-processing-staging` (staging)
- Consumer: `apps/api/src/queue/photo-consumer.ts`

**Queue Message Pattern:**

```typescript
// Type definition: apps/api/src/types/photo-job.ts
interface PhotoJob {
  photo_id: string; // UUID - matches photos.id
  event_id: string; // UUID - matches events.id
  r2_key: string; // R2 object key: "{event_id}/{photo_id}.jpg"
}

// Send to queue
await c.env.PHOTO_QUEUE.send({
  photo_id: photoId,
  event_id: eventId,
  r2_key: r2Key,
});
```

**Queue Consumer (Existing Implementation):**

- File: `apps/api/src/queue/photo-consumer.ts`
- Fetches image from R2 using `PHOTOS_BUCKET.get(r2Key)`
- Calls Rekognition IndexFaces
- Handles rate limiting via Durable Object
- Acks/retries based on result

---

### 7. Image Processing Requirements

**HEIC/WebP Conversion (from heic-rekognition.md research):**

- AWS Rekognition only accepts JPEG and PNG
- Cloudflare Images Transform supports HEIC/WebP input, JPEG output
- **Recommended approach:** Use Cloudflare Images Transform in queue consumer
- **Alternative:** Convert on upload (adds latency), but simpler for MVP

**For T-16 (Upload Endpoint):**

- Accept HEIC/WebP/JPEG/PNG uploads
- Store original format in R2
- Queue consumer will handle conversion before Rekognition call

**File Size & Format Limits:**

- Max upload: 50 MB (from cf-upload-limits.md)
- Max Rekognition input: 5 MB (as raw bytes after conversion)
- Cloudflare Images Transform input: 70 MB max
- Allowed MIME types: `image/jpeg`, `image/png`, `image/heic`, `image/heif`, `image/webp`

**Image Normalization Strategy:**

- Store original in R2 (preserve HEIC/WebP for quality)
- Queue consumer fetches via Cloudflare Images Transform with `format=jpeg`
- Transformed JPEG sent to Rekognition
- Original preserved for high-quality downloads

---

### 8. Environment Bindings (Type Safety)

**Bindings Type:**

```typescript
// apps/api/src/types.ts
export type Bindings = CloudflareBindings; // Auto-generated from wrangler.jsonc

// CloudflareBindings includes:
// - DATABASE_URL: string
// - CORS_ORIGIN: string
// - PHOTOS_BUCKET: R2Bucket
// - PHOTO_QUEUE: Queue<PhotoJob>
// - AWS_* credentials (for Rekognition)
// - APP_BASE_URL: string
// - PHOTO_R2_BASE_URL: string
```

**Variables Type:**

```typescript
export type Variables = AuthVariables & {
  db: () => Database;
};

// AuthVariables from @sabaipics/auth/types:
// - auth?: { userId: string; sessionId: string }
// - photographer?: Photographer
```

**Environment Access:**

```typescript
// In route handler
const db = c.var.db();
const photographer = c.var.photographer; // Available after requirePhotographer()
const bucket = c.env.PHOTOS_BUCKET;
const queue = c.env.PHOTO_QUEUE;
```

---

### 9. Testing Conventions

**Test Framework:**

- Vitest ^3.2.0
- Cloudflare Vitest pool: `@cloudflare/vitest-pool-workers ^0.10.14`

**Test File Location:**

- Co-located: `apps/api/src/routes/events/index.test.ts`

**Test Client Pattern (from T-8 tech docs):**

```typescript
import { testClient } from 'hono/testing';
import { Hono } from 'hono';

const app = new Hono<Env>()
  .use('/*', (c, next) => {
    c.set('db', () => mockDb);
    c.set('photographer', mockPhotographer);
    return next();
  })
  .route('/events', eventsRouter);

const client = testClient(app);

// Test
const res = await client.events[':id'].photos.$post({
  param: { id: eventId },
  form: { file: mockFile },
});
expect(res.status).toBe(201);
```

**Test Categories:**

1. Auth tests: Unauthenticated requests return 401
2. Authorization tests: Non-owner access returns 404
3. Validation tests: Invalid input returns 400/413/415
4. Happy path: Success case returns 201
5. Edge cases: Event not found, R2 upload fails, queue send fails

---

### 10. Error Handling Patterns

**Consistent Error Helpers (per route file):**

```typescript
function notFoundError(message: string = 'Event not found') {
  return { error: { code: 'NOT_FOUND' as const, message } };
}

function validationError(message: string) {
  return { error: { code: 'VALIDATION_ERROR' as const, message } };
}

function fileSizeLimitError() {
  return {
    error: {
      code: 'FILE_TOO_LARGE' as const,
      message: 'File size exceeds 50 MB limit',
    },
  };
}

function unsupportedFileTypeError(type: string) {
  return {
    error: {
      code: 'UNSUPPORTED_FILE_TYPE' as const,
      message: `File type ${type} is not supported. Allowed: JPEG, PNG, HEIC, WebP`,
    },
  };
}

function uploadFailedError(reason: string) {
  return {
    error: {
      code: 'UPLOAD_FAILED' as const,
      message: `Upload failed: ${reason}`,
    },
  };
}
```

**Try-Catch Pattern:**

```typescript
try {
  await c.env.PHOTOS_BUCKET.put(r2Key, imageBytes, {
    httpMetadata: { contentType: 'image/jpeg' },
  });
} catch (e) {
  const reason = e instanceof Error ? e.message : 'unknown error';
  return c.json(uploadFailedError(reason), 500);
}
```

---

### 11. Rekognition Collection Pattern

**Collection ID Management:**

- Stored in `events.rekognition_collection_id` (nullable)
- Created lazily on first photo upload (not at event creation)
- Collection ID format: `event-{eventId}` (convention from queue consumer)
- Collection must be created before calling IndexFaces

**Collection Creation (from T-13 queue consumer):**

```typescript
// In queue consumer (NOT in upload endpoint)
if (!event.rekognitionCollectionId) {
  // Create collection
  const collectionId = `event-${event.id}`;
  await rekognition.createCollection({ CollectionId: collectionId });

  // Update event record
  await db
    .update(events)
    .set({ rekognitionCollectionId: collectionId })
    .where(eq(events.id, event.id));
}
```

**For T-16:**

- Upload endpoint does NOT create Rekognition collection
- Queue consumer handles collection creation lazily
- Upload endpoint only: validate, store in R2, create DB record, enqueue job

---

### 12. Multipart Form Data Handling in Hono

**Parsing Multipart:**

```typescript
// Hono provides c.req.parseBody()
const body = await c.req.parseBody();

// File object type
interface File {
  name: string; // Original filename
  type: string; // MIME type
  size: number; // Bytes
  arrayBuffer(): Promise<ArrayBuffer>;
}

// Access uploaded file
const file = body.file; // FormData field name
if (!file || !(file instanceof File)) {
  return c.json(validationError('No file uploaded'), 400);
}
```

**File Validation:**

```typescript
// Size check
if (file.size > 50 * 1024 * 1024) {
  return c.json(fileSizeLimitError(), 413);
}

// MIME type check
const allowedTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
if (!allowedTypes.includes(file.type)) {
  return c.json(unsupportedFileTypeError(file.type), 415);
}

// Read file bytes
const imageBytes = await file.arrayBuffer();
```

---

## Implementation Checklist for T-16

1. **Add POST /events/:id/photos route** in `apps/api/src/routes/events/index.ts`
2. **Middleware stack:** `requirePhotographer()` → `requireConsent()` → `zValidator("param", eventParamsSchema)`
3. **Validate event exists and owned by photographer** (404 if not)
4. **Parse multipart form data** with `c.req.parseBody()`
5. **Validate file:**
   - File exists
   - Size <= 50 MB (413 if exceeded)
   - MIME type in allowed list (415 if unsupported)
6. **Generate photo ID** (UUID)
7. **Store in R2:**
   - Key: `{eventId}/{photoId}.jpg`
   - Content-Type: Preserve original MIME type (or normalize to `image/jpeg` if converting)
8. **Insert photos record:**
   - `eventId`, `r2Key`, `status: "processing"`, `faceCount: 0`
9. **Enqueue photo job:**
   - `{ photo_id, event_id, r2_key }`
   - Queue: `c.env.PHOTO_QUEUE`
10. **Return 201 with photo data**
11. **Add unit tests** for all error cases and happy path

---

## References

### Existing Implementation (Must Reference)

| File                                   | Purpose            | Pattern to Follow                          |
| -------------------------------------- | ------------------ | ------------------------------------------ |
| `apps/api/src/routes/events/index.ts`  | Events CRUD routes | Auth, validation, error handling           |
| `apps/api/src/queue/photo-consumer.ts` | Queue consumer     | R2 fetch, Rekognition call, error handling |
| `apps/api/src/types/photo-job.ts`      | Queue message type | PhotoJob interface                         |
| `packages/db/src/schema/photos.ts`     | Photos schema      | Insert pattern                             |
| `packages/db/src/schema/events.ts`     | Events schema      | FK constraints                             |
| `apps/api/wrangler.jsonc`              | CF bindings config | Queue, R2 bindings                         |

### Research Documents

| File                                                 | Key Findings                                 |
| ---------------------------------------------------- | -------------------------------------------- |
| `docs/logs/BS_0001_S-1/research/cf-upload-limits.md` | 50 MB max, MIME types, validation strategy   |
| `docs/logs/BS_0001_S-1/research/heic-rekognition.md` | HEIC/WebP conversion via CF Images Transform |

### Task Dependencies

| Task | Relationship                                                       |
| ---- | ------------------------------------------------------------------ |
| T-1  | Foundation - created photos table                                  |
| T-13 | Foundation - created events CRUD, QR generation, R2 upload pattern |
| T-14 | Dependency - queue consumer will process uploaded photos           |

---

## High-Level Conventions (Tech Image)

**System Architecture:**

- Monorepo: pnpm workspace with Turbo
- API: Cloudflare Workers (Hono framework)
- Dashboard: React 19 + Vite 7 + TanStack Query
- DB: Neon Postgres (serverless) via Drizzle ORM
- Storage: Cloudflare R2
- Async Processing: Cloudflare Queues
- Face Recognition: AWS Rekognition (us-west-2)

**Code Organization:**

- `apps/api/` - Hono API on CF Workers
- `apps/dashboard/` - React dashboard (CF Pages)
- `packages/db/` - Drizzle schema + migrations
- `packages/auth/` - Clerk integration (backend + frontend)
- `packages/ui/` - Shared shadcn/ui components

**Deployment:**

- Staging: auto-deploy from `master` branch
- Production: manual approval

**Git Workflow:**

- Branch off `master` for features
- Create PR with implementation summary
- Merge to `master` after review

---

## Do / Don't

**Do:**

- Validate at API boundary (size, type, ownership)
- Return consistent error shapes with error codes
- Use Zod for schema validation
- Inject DB via middleware (`c.var.db()`)
- Use `requirePhotographer()` + `requireConsent()` for protected routes
- Return 404 (not 403) for authorization failures to prevent enumeration
- Store original uploads in R2, convert in queue consumer
- Use UUID for photo IDs (`gen_random_uuid()`)
- Enqueue background jobs for async processing
- Add unit tests for all routes

**Don't:**

- Throw untyped errors across boundaries
- Expose internal error details to clients
- Process images synchronously in upload endpoint (use queue)
- Create Rekognition collection in upload endpoint (queue handles lazily)
- Skip file validation (size, type, magic bytes)
- Return 403 for "not found" resources (use 404 to prevent enumeration)
- Use relative paths in R2 keys (use `{eventId}/{photoId}.ext` format)
- Forget to handle R2 upload failures gracefully

---

## Notes

- **HEIC/WebP Support:** Accept on upload, convert in queue consumer via CF Images Transform
- **File Size Limit:** 50 MB (safe for all CF plans, under CF Images 70 MB limit)
- **Queue Consumer:** Existing implementation in `photo-consumer.ts` will handle Rekognition calls
- **Rekognition Collection:** Created lazily on first upload, NOT at event creation
- **R2 Key Format:** `{eventId}/{photoId}.jpg` (normalized JPEG stored after transform)
- **Original Preservation:** Store original HEIC/WebP in R2, transform on-demand for Rekognition
- **Testing:** Use Vitest with CF Workers pool, mock DB and R2
