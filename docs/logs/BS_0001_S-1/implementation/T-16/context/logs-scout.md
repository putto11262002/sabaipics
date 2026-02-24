# Implementation Logs Scout: T-16

**Task:** T-16 — Photo upload API with queue dispatch
**Root:** BS_0001_S-1
**Scanned:** T-1, T-2, T-5, T-10, T-13, T-14, T-18 (and queue infrastructure)
**Date:** 2026-01-11

---

## Established Patterns and Conventions

### 1. Database Schema Patterns (T-1)

**ID Types:**

- All IDs use `uuid` type (NOT `text`) — changed in iter-002
- UUIDs generated DB-side via `gen_random_uuid()`
- Foreign keys also use `uuid` type

**Timestamp Patterns:**

- Use helper from `common.ts`: `timestamptz(name)` for custom timestamps
- Use `createdAtCol()` for standard `created_at` columns
- All timestamps: `timestamp({ mode: "string", withTimezone: true })`
- Column names: snake_case (e.g., `created_at`, `expires_at`)

**Enum Pattern:**

- Text-based enums: `text("column").notNull()` + TypeScript const array
- Example: `photoStatuses = ['processing', 'indexed', 'failed']`
- Exported types: `PhotoStatus`, `CreditLedgerType`, `ConsentType`

**JSONB Pattern:**

- Typed JSONB fields with co-located type definitions
- Example: `faces.rekognition_response` → `RekognitionFaceRecord` type
- Types moved from `types.ts` to domain file (T-1 iter-002)

**Photos Table:**

- `id: uuid` (primary key)
- `event_id: uuid` (FK to events, RESTRICT cascade)
- `r2_key: text` (immutable storage key, not URL)
- `status: text` (enum: 'processing' | 'indexed' | 'failed')
- `face_count: integer` (nullable, set after indexing)
- `uploaded_at: timestamp` (used as cursor for pagination)

### 2. Authentication & Authorization (T-2, T-5)

**Middleware Pattern:**

- `requirePhotographer()` — validates Clerk auth + DB photographer existence
- `requireConsent()` — must run AFTER requirePhotographer, checks PDPA consent
- Both live in `apps/api/src/middleware/` (NOT in packages/auth)

**Context Variables:**

- `PhotographerContext`: `{ id: string, pdpaConsentAt: string | null }`
- `PhotographerVariables`: `AuthVariables & { db: () => Database, photographer: PhotographerContext }`

**Authorization Pattern:**

- Always verify ownership before returning data
- Return 404 (NOT 403) for non-owned resources to prevent enumeration
- Example from T-13: `event.photographerId !== photographer.id` → 404

**DB Access:**

- Use `c.var.db()` to get Drizzle client in routes/middleware
- Defined in `apps/api/src/lib/db.ts`

### 3. API Error Handling (T-2, T-5, T-13)

**Error Shape (Consistent):**

```typescript
{
  error: {
    code: "ERROR_CODE",
    message: "Human-readable message"
  }
}
```

**Error Helper Pattern (from events.ts):**

```typescript
function validationError(message: string) {
  return {
    error: {
      code: 'VALIDATION_ERROR' as const,
      message,
    },
  };
}
```

**Status Codes:**

- 401: Unauthenticated (from requirePhotographer middleware)
- 403: Forbidden (photographer not found, or no PDPA consent)
- 404: Not found (or unauthorized to prevent enumeration)
- 400: Validation error (Zod schema failure, business rule violation)
- 409: Conflict (idempotency, already exists)
- 500: Server error (QR generation failed, R2 upload failed, etc.)

**Auth Errors (from packages/auth/src/errors.ts):**

- Use `createAuthError(code, message)` from `@sabaipics/auth/errors`
- Codes: `UNAUTHENTICATED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `FORBIDDEN`

### 4. Validation Patterns (T-13, T-18)

**Schema Location:**

- Routes with multiple schemas: separate `schema.ts` file
- Example: `apps/api/src/routes/events/schema.ts`

**Zod Patterns:**

```typescript
// UUID params
z.object({ id: z.string().uuid() });

// Query pagination (offset)
z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Query pagination (cursor) - from photos.ts
z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Datetime strings
z.string().datetime().nullable().optional();
```

**Validator Usage:**

```typescript
import { zValidator } from '@hono/zod-validator';

.post('/', zValidator('json', createSchema), handler)
.get('/:id', zValidator('param', paramsSchema), handler)
.get('/', zValidator('query', querySchema), handler)
```

### 5. Pagination Patterns

**Two Patterns Observed:**

**A. Offset Pagination (T-13 events API):**

```typescript
// Query: { page: number, limit: number }
const offset = page * limit;
const items = await db.select(...).limit(limit).offset(offset);

// Get total count
const [{ count }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(table)
  .where(...);

// Response
{
  data: [...],
  pagination: {
    page,
    limit,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    hasNextPage: page + 1 < totalPages,
    hasPrevPage: page > 0,
  }
}
```

**B. Cursor Pagination (T-18 photos API):**

```typescript
// Query: { cursor?: string (datetime), limit: number }
const cursorLimit = limit + 1; // Fetch +1 to determine hasMore

const items = await db
  .select(...)
  .where(cursor ? lt(table.timestamp, cursor) : undefined)
  .orderBy(desc(table.timestamp))
  .limit(cursorLimit);

const hasMore = items.length > limit;
const data = hasMore ? items.slice(0, limit) : items;
const nextCursor = hasMore ? data[limit - 1].timestamp : null;

// Response
{
  data,
  pagination: { nextCursor, hasMore }
}
```

**Which to use:**

- Offset: Simple lists, total count needed, page navigation
- Cursor: Real-time feeds, high-write tables, infinite scroll

### 6. R2 Storage Patterns (T-13, T-14, T-18)

**R2 Key Pattern:**

- Store keys (NOT URLs) in database
- Photos: `{event_id}/{photo_id}.{ext}`
- QR codes: `qr/{access_code}.png`

**R2 Upload Pattern (from T-13):**

```typescript
const r2Key = `qr/${accessCode}.png`;
await c.env.PHOTOS_BUCKET.put(r2Key, qrPng, {
  httpMetadata: { contentType: 'image/png' },
});
```

**R2 URL Generation (from T-18):**

```typescript
// Presigned download URL (S3 SDK)
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const downloadUrl = await getSignedUrl(
  s3,
  new GetObjectCommand({ Bucket: env.PHOTO_BUCKET_NAME, Key: r2Key }),
  { expiresIn: 3600 },
);

// Public transform URLs (Cloudflare Image Resizing)
const thumbnailUrl = `${cfDomain}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${r2BaseUrl}/${r2Key}`;
const previewUrl = `${cfDomain}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${r2BaseUrl}/${r2Key}`;
```

**Environment Variables (from wrangler.jsonc):**

- `PHOTOS_BUCKET` (R2 binding)
- `CF_ACCOUNT_ID`, `CF_ZONE`, `PHOTO_R2_BASE_URL`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `PHOTO_BUCKET_NAME`

### 7. Queue Infrastructure (photo-consumer.ts, photo-job.ts)

**Queue Message Type:**

```typescript
interface PhotoJob {
  photo_id: string; // UUID
  event_id: string; // UUID
  r2_key: string; // "{event_id}/{photo_id}.{ext}"
}
```

**Queue Binding:**

- Environment binding: `env.PHOTO_PROCESSING_QUEUE` (assumed)
- Message type: `PhotoJob`

**Queue Send Pattern:**

```typescript
await env.PHOTO_PROCESSING_QUEUE.send({
  photo_id: '...',
  event_id: '...',
  r2_key: '...',
});
```

**Queue Consumer Pattern (photo-consumer.ts):**

- Consumer location: `apps/api/src/queue/photo-consumer.ts`
- Export: `export async function queue(batch, env, ctx)`
- Rate limiting via Durable Object: `AWS_REKOGNITION_RATE_LIMITER`
- Paced request initiation: 20ms intervals (50 TPS)
- Per-message ack/retry based on results
- Error handling: throttle, retryable, non-retryable

**Processing Result Pattern:**

```typescript
interface ProcessingResult {
  message: Message<PhotoJob>;
  data: IndexFacesResult | null;
  error: unknown;
}
```

### 8. Testing Patterns (T-5, T-10, T-13)

**Test File Location:**

- Co-located: `route.ts` → `route.test.ts`
- Example: `events/index.ts` → `events/index.test.ts`

**Test Framework:**

- Vitest (config: `vitest.node.config.ts`)
- Pattern: `apps/api/tests/**/*.test.ts` or `src/**/*.test.ts`

**Common Test Patterns:**

- Auth tests: verify 401/403 from middleware
- Validation tests: Zod schema edge cases
- Happy path: successful creation/retrieval
- Authorization: ownership checks (404 for non-owned)
- Idempotency: duplicate webhooks, already consented (409)

### 9. Route Structure Patterns

**Simple Routes (T-5):**

- Single file: `consent.ts`, `consent.test.ts`

**Complex Routes (T-13):**

- Directory structure:
  ```
  routes/events/
  ├── index.ts         # Main router
  ├── index.test.ts    # Tests
  ├── schema.ts        # Zod schemas
  └── access-code.ts   # Helpers
  ```

**Router Export Pattern:**

```typescript
export const eventsRouter = new Hono<Env>()
  .post('/', middleware, handler)
  .get('/', middleware, handler)
  .get('/:id', middleware, handler);
```

**Router Registration (apps/api/src/index.ts):**

```typescript
app.route('/events', eventsRouter);
app.route('/photos', photosRouter);
```

### 10. Idempotency Patterns (T-10)

**Database Constraint:**

- Unique constraint on idempotency key
- Example: `stripe_session_id` UNIQUE in credit_ledger

**Error Handling:**

```typescript
try {
  await db.insert(table).values(...);
} catch (error) {
  // Unique constraint violation → idempotent 200/409
  if (isDuplicateError(error)) {
    return c.json({ ... }, 409); // or 200 for webhooks
  }
  throw error;
}
```

**Webhook Pattern (T-10):**

- Always return 200 (don't retry)
- Log errors but don't throw
- Handle duplicates gracefully (unique constraint)

---

## Known Limitations

### T-1 Database Schema

- No soft delete implemented (FK cascade = RESTRICT)
- Rekognition types manually defined (not from AWS SDK)

### T-5 PDPA Consent

- `[KNOWN_LIMITATION]` No transaction wrapping consent_record insert + photographer update
- Acceptable for MVP (both operations are idempotent-safe)

### T-10 Stripe Webhook

- `[KNOWN_LIMITATION]` PromptPay async payments not handled (`checkout.session.async_payment_succeeded`)

### T-13 Events API

- `[KNOWN_LIMITATION]` QR URL format uses `${APP_BASE_URL}/r2/${r2Key}` — may need adjustment based on R2 public URL config
- Photo count aggregation not included in GET /events (can add if UI needs)

### T-14 QR Generation

- `[KNOWN_LIMITATION]` Manual scannability testing deferred (iPhone, LINE, Android)
- Unit tests verify PNG format but don't decode QR content

### Queue Consumer (photo-consumer.ts)

- `TODO: Application layer will handle DB writes here` (line 152)
- Currently only acks messages, doesn't save faces to DB or update photo status

---

## Relevant Follow-ups

### Engineering Debt

**From T-1:**

- Soft delete pattern if needed

**From T-10:**

- Add support for `checkout.session.async_payment_succeeded` (PromptPay)
- Add alerting/monitoring for fulfillment errors (Sentry)

**From T-13:**

- Consider R2 public URL helper function if pattern differs
- Photo count aggregation in GET /events if UI needs

**From T-14:**

- Add Workers environment integration test (`@cloudflare/vitest-pool-workers`)
- Automated QR decoding verification (jsQR library)

### Product/PM Follow-ups

**From T-5:**

- `[PM_FOLLOWUP]` PDPA consent copy needs review before launch

**From T-13:**

- `[PM_FOLLOWUP]` Manual QR scannability testing required (iPhone, LINE, Android)

**From T-14:**

- `[PM_FOLLOWUP]` Document minimum print size for photographers (2cm × 2cm at 300 DPI)
- `[PM_FOLLOWUP]` Error correction level tuning if scanning issues reported (M → Q)

---

## Key Files to Reference

### Database & Types

- `packages/db/src/schema/common.ts` — Timestamp helpers
- `packages/db/src/schema/photos.ts` — Photo table schema
- `packages/db/src/schema/events.ts` — Event table schema

### API Infrastructure

- `apps/api/src/lib/db.ts` — DB client helper
- `apps/api/src/middleware/require-photographer.ts` — Auth middleware
- `packages/auth/src/errors.ts` — Error helpers

### Route Examples

- `apps/api/src/routes/events/index.ts` — CRUD with QR, pagination, validation
- `apps/api/src/routes/events/schema.ts` — Zod schema patterns
- `apps/api/src/routes/photos.ts` — Cursor pagination, R2 presigned URLs
- `apps/api/src/routes/consent.ts` — Simple POST endpoint

### Queue Infrastructure

- `apps/api/src/queue/photo-consumer.ts` — Queue consumer pattern
- `apps/api/src/types/photo-job.ts` — Queue message types
- `apps/api/src/lib/rekognition/` — Rekognition client & error handling

### Testing

- `apps/api/src/routes/events/index.test.ts` — Comprehensive route tests
- `apps/api/vitest.node.config.ts` — Test config

---

## Recommendations for T-16

### Must Follow

1. **Photo Status Flow:**
   - Insert photo with `status: 'processing'`
   - Send queue message AFTER successful R2 upload
   - Consumer will update to 'indexed' or 'failed'

2. **Queue Message:**
   - Use `PhotoJob` type from `types/photo-job.ts`
   - Send to `env.PHOTO_PROCESSING_QUEUE`

3. **Error Handling:**
   - Use typed error helpers (like `validationError()`)
   - Return 404 for non-owned events (not 403)
   - Handle R2 upload failures gracefully

4. **Validation:**
   - Create `schema.ts` if multiple schemas needed
   - Use Zod for request validation
   - Validate file types, sizes at boundary

5. **Authorization:**
   - Verify event ownership before upload
   - Use `requirePhotographer()` + `requireConsent()`

### Consider

1. **Idempotency:**
   - How to handle duplicate uploads of same file?
   - Maybe: unique constraint on (event_id, filename)?

2. **File Extension:**
   - Store original extension in R2 key
   - Validate allowed types (JPEG, PNG)

3. **Credit Deduction:**
   - When to deduct credits? (Upload vs. successful indexing)
   - T-16 spec should clarify

4. **Response Format:**
   - Return photo ID immediately (201)
   - Include `status: 'processing'`
   - Let UI poll or use WebSockets for completion

5. **Testing:**
   - Test authorization (non-owned event)
   - Test R2 upload failure
   - Test queue send failure
   - Test file validation
