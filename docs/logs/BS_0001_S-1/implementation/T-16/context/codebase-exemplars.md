# Codebase Exemplars for T-16: Photo Upload API

**Task:** T-16 (Photo upload API - multipart upload, validation, R2, CF Images, job enqueue)
**Root:** BS_0001_S-1
**Primary Surface:** API
**Generated:** 2026-01-11

---

## 1. API Route Pattern: Events API (CRUD + File Upload)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/events/index.ts`

### What pattern it demonstrates

- Hono API route structure with middleware chaining
- R2 file upload (QR code PNG)
- Error handling with typed error responses
- Request validation with zod-validator
- Database transaction pattern
- R2 URL construction

### Key code snippets to follow

**1. Route structure with middleware:**

```typescript
export const eventsRouter = new Hono<Env>().post(
  '/',
  requirePhotographer(),
  requireConsent(),
  zValidator('json', createEventSchema),
  async (c) => {
    const photographer = c.var.photographer;
    const db = c.var.db();
    const body = c.req.valid('json');
    // ... route logic
  },
);
```

**2. R2 upload pattern:**

```typescript
// Upload QR to R2
const r2Key = `qr/${accessCode}.png`;
try {
  await c.env.PHOTOS_BUCKET.put(r2Key, qrPng, {
    httpMetadata: { contentType: 'image/png' },
  });
} catch (e) {
  const reason = e instanceof Error ? e.message : 'unknown error';
  return c.json(qrUploadFailedError(reason), 500);
}
```

**3. Error helper functions:**

```typescript
function validationError(message: string) {
  return {
    error: {
      code: 'VALIDATION_ERROR' as const,
      message,
    },
  };
}

function notFoundError(message: string = 'Event not found') {
  return {
    error: {
      code: 'NOT_FOUND' as const,
      message,
    },
  };
}
```

**4. Database insert with returning:**

```typescript
const [created] = await db
  .insert(events)
  .values({
    photographerId: photographer.id,
    name: body.name,
    // ...
  })
  .returning();
```

### Test coverage approach

- **File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/events/index.test.ts`
- Uses Hono's `testClient` for type-safe testing
- Mock DB with chainable methods
- Mock R2 bucket with `vi.fn()`
- Tests cover: auth, validation, success cases, error cases
- Pattern: `createTestApp()` helper creates app with mocked dependencies

---

## 2. Credit Deduction Pattern: Dashboard API (FIFO Balance Calculation)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/dashboard/route.ts`

### What pattern it demonstrates

- FIFO credit balance calculation using SQL aggregates
- Expiry handling with `gt(creditLedger.expiresAt, sql\`NOW()\`)`
- Drizzle ORM patterns for complex queries

### Key code snippets to follow

**1. Credit balance query (sum of unexpired):**

```typescript
// Query 1: Credit balance (sum of unexpired credits)
const [balanceResult] = await db
  .select({
    balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int`,
  })
  .from(creditLedger)
  .where(
    and(eq(creditLedger.photographerId, photographer.id), gt(creditLedger.expiresAt, sql`NOW()`)),
  );
```

**2. Nearest expiry for FIFO warning:**

```typescript
// Query 2: Nearest expiry (earliest expiry from purchase rows)
const [expiryResult] = await db
  .select({
    nearestExpiry: sql<string | null>`MIN(${creditLedger.expiresAt})`,
  })
  .from(creditLedger)
  .where(
    and(
      eq(creditLedger.photographerId, photographer.id),
      gt(creditLedger.amount, 0),
      gt(creditLedger.expiresAt, sql`NOW()`),
    ),
  );
```

### Implementation notes for T-16

For credit deduction in upload API:

1. Check balance >= 1 BEFORE upload (same query as dashboard)
2. Insert negative ledger entry with FIFO expiry (inherit expiry from oldest unexpired purchase)
3. Use transaction to ensure atomicity

**FIFO deduction pattern (not yet in codebase, needed for T-16):**

```typescript
// Pseudo-code for FIFO deduction
// 1. Find oldest unexpired purchase with remaining balance
const [oldestCredit] = await db
  .select({ expiresAt: creditLedger.expiresAt })
  .from(creditLedger)
  .where(
    and(
      eq(creditLedger.photographerId, photographer.id),
      gt(creditLedger.amount, 0),
      gt(creditLedger.expiresAt, sql`NOW()`),
    ),
  )
  .orderBy(asc(creditLedger.expiresAt))
  .limit(1);

// 2. Insert deduction entry with inherited expiry
await db.insert(creditLedger).values({
  photographerId: photographer.id,
  amount: -1, // deduct 1 credit
  type: 'upload',
  expiresAt: oldestCredit.expiresAt, // inherit FIFO expiry
  stripeSessionId: null, // only purchases have session IDs
});
```

---

## 3. Credit Purchase Pattern: Stripe Webhook (Idempotency)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/webhooks/stripe.ts`

### What pattern it demonstrates

- Idempotent DB writes using unique constraint
- Error handling for duplicate webhooks
- Date arithmetic with `date-fns`

### Key code snippets to follow

**1. Idempotent credit insertion:**

```typescript
// Insert credit ledger entry
// Unique constraint on stripe_session_id prevents duplicates
try {
  await db.insert(creditLedger).values({
    photographerId,
    amount: credits,
    type: 'purchase',
    stripeSessionId: session.id,
    expiresAt: addMonths(new Date(), 6).toISOString(),
  });

  return { success: true, reason: 'fulfilled' };
} catch (err) {
  // Check for unique constraint violation (duplicate webhook)
  const errorMessage = err instanceof Error ? err.message : String(err);
  if (
    errorMessage.includes('unique') ||
    errorMessage.includes('duplicate') ||
    errorMessage.includes('credit_ledger_stripe_session_unique')
  ) {
    console.log(`[Stripe Fulfillment] Duplicate webhook ignored`);
    return { success: false, reason: 'duplicate' };
  }
  // ... other error handling
}
```

### Implementation notes for T-16

- Use unique constraint on R2 key or photo ID to prevent duplicate uploads
- Catch constraint violations gracefully
- Return success even if duplicate (idempotency)

---

## 4. Queue Job Enqueuing Pattern: Photo Consumer Type Definitions

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/types/photo-job.ts`

### What pattern it demonstrates

- Queue message payload shape
- Type safety for job data

### Key code snippets to follow

**1. Job payload interface:**

```typescript
export interface PhotoJob {
  /** UUID - matches photos.id in database */
  photo_id: string;

  /** UUID - matches events.id in database */
  event_id: string;

  /** R2 object key: "{event_id}/{photo_id}.{ext}" */
  r2_key: string;
}
```

**2. Queue send pattern (needed for T-16):**

```typescript
// After uploading photo to R2:
await c.env.PHOTO_QUEUE.send({
  photo_id: photoId,
  event_id: eventId,
  r2_key: normalizedKey,
});
```

### Implementation notes for T-16

- Enqueue AFTER R2 upload succeeds
- Use job payload to pass R2 key to consumer
- Consumer will handle face detection

---

## 5. Queue Consumer Pattern: Photo Processing

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/queue/photo-consumer.ts`

### What pattern it demonstrates

- Batch message processing
- Rate limiting via Durable Object RPC
- Error classification (retryable vs non-retryable)
- Parallel execution with paced initiation
- Per-message ack/retry

### Key code snippets to follow

**1. R2 fetch in consumer:**

```typescript
// Fetch image from R2
const object = await env.PHOTOS_BUCKET.get(job.r2_key);

if (!object) {
  return {
    message,
    data: null,
    error: new Error(`Image not found: ${job.r2_key}`),
  };
}

const imageBytes = await object.arrayBuffer();
```

**2. Error handling with retry logic:**

```typescript
if (error) {
  const errorMessage = formatErrorMessage(error);

  if (isThrottlingError(error)) {
    console.error(`[Queue] Throttled: ${job.photo_id} - ${errorMessage}`);
    message.retry({ delaySeconds: getThrottleBackoffDelay(message.attempts) });
  } else if (isNonRetryableError(error)) {
    console.error(`[Queue] Non-retryable: ${job.photo_id} - ${errorMessage}`);
    message.ack(); // Don't retry
  } else if (isRetryableError(error)) {
    console.error(`[Queue] Retryable: ${job.photo_id} - ${errorMessage}`);
    message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
  }
} else {
  message.ack();
}
```

### Implementation notes for T-16

- T-16 upload endpoint only needs to enqueue the job
- T-17 (separate task) will extend the consumer to handle face detection
- Upload API returns immediately with status="processing"

---

## 6. Error Classification: Rekognition Errors

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/lib/rekognition/errors.ts`

### What pattern it demonstrates

- Error type guards
- Exponential backoff calculation
- Error message formatting

### Key code snippets to follow

**1. Error type guards:**

```typescript
export function isRetryableError(error: unknown): boolean {
  if (!isError(error)) return false;

  // Check by error name
  if (RETRYABLE_ERROR_NAMES.has(error.name)) return true;

  // Check for AWS SDK error codes
  const awsError = error as { $metadata?: { httpStatusCode?: number } };

  // Retry on 5xx server errors
  if (awsError.$metadata?.httpStatusCode && awsError.$metadata.httpStatusCode >= 500) {
    return true;
  }

  return false;
}
```

**2. Backoff calculation:**

```typescript
export function getBackoffDelay(
  attempts: number,
  baseDelaySeconds = 2,
  maxDelaySeconds = 300,
): number {
  // Exponential: 2, 4, 8, 16, 32, 64, 128, 256, 300 (capped)
  const exponentialDelay = baseDelaySeconds * Math.pow(2, attempts - 1);

  // Cap at max
  const cappedDelay = Math.min(exponentialDelay, maxDelaySeconds);

  // Add jitter (±20%) to prevent thundering herd
  const jitter = cappedDelay * 0.2 * (Math.random() - 0.5);

  return Math.round(cappedDelay + jitter);
}
```

### Implementation notes for T-16

- Upload validation errors should be non-retryable (bad input)
- R2 upload errors should be retryable (transient)
- CF Images errors: check HTTP status (4xx non-retryable, 5xx retryable)

---

## 7. Validation Pattern: Zod Schemas

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/events/schema.ts`

### What pattern it demonstrates

- Zod schema for request validation
- Type inference from schema
- Parameter validation (UUID, datetime, pagination)

### Key code snippets to follow

**1. Request schema:**

```typescript
export const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
```

**2. Params validation:**

```typescript
export const eventParamsSchema = z.object({
  id: z.string().uuid(),
});
```

### Implementation notes for T-16

**Upload validation schema (needed):**

```typescript
// For multipart form
export const uploadPhotoSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size <= 50 * 1024 * 1024, 'File must be ≤ 50MB')
    .refine(
      (file) => ['image/jpeg', 'image/png', 'image/heic', 'image/webp'].includes(file.type),
      'Only JPEG, PNG, HEIC, WebP allowed',
    ),
});

// Or for direct body upload
export const uploadPhotoParamsSchema = z.object({
  eventId: z.string().uuid(),
});
```

---

## 8. Pagination Pattern: Gallery API (Cursor-based)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/photos.ts`

### What pattern it demonstrates

- Cursor-based pagination (better for large datasets)
- Event ownership verification
- CF Images URL generation
- Presigned R2 URLs

### Key code snippets to follow

**1. Cursor pagination:**

```typescript
const querySchema = z.object({
  cursor: z.string().datetime('Invalid cursor format').optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50')
    .default(20),
});

// Fetch limit + 1 to determine hasMore
const parsedLimit = Math.min(limit, 50);
const cursorLimit = parsedLimit + 1;

const photoRows = await db
  .select({...})
  .from(photos)
  .where(and(
    eq(photos.eventId, eventId),
    cursor ? lt(photos.uploadedAt, cursor) : undefined
  ))
  .orderBy(desc(photos.uploadedAt))
  .limit(cursorLimit);

// Determine hasMore and trim extra row
const hasMore = photoRows.length > parsedLimit;
const items = hasMore ? photoRows.slice(0, parsedLimit) : photoRows;
const nextCursor = hasMore ? items[parsedLimit - 1].uploadedAt : null;
```

**2. CF Images URL generation:**

```typescript
function generateThumbnailUrl(r2Key: string, cfDomain: string, r2BaseUrl: string): string {
  return `${cfDomain}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${r2BaseUrl}/${r2Key}`;
}

function generatePreviewUrl(r2Key: string, cfDomain: string, r2BaseUrl: string): string {
  return `${cfDomain}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${r2BaseUrl}/${r2Key}`;
}
```

**3. Presigned R2 URL (download):**

```typescript
async function generateDownloadUrl(env: Bindings, r2Key: string): Promise<string> {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  const presignedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.PHOTO_BUCKET_NAME, Key: r2Key }),
    { expiresIn: 3600 }, // 1 hour
  );

  return presignedUrl;
}
```

### Implementation notes for T-16

- Upload endpoint doesn't need pagination (single photo)
- Return URLs in response for immediate use
- CF Images will normalize HEIC to JPEG automatically

---

## 9. Test Pattern: API Route Testing with Mocks

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/photos.test.ts`

### What pattern it demonstrates

- Mock DB with query call tracking
- Mock R2 bucket
- testClient usage
- Auth simulation

### Key code snippets to follow

**1. Mock DB with chainable methods:**

```typescript
function createMockDb(options: {
  event?: { id: string } | null;
  photos?: Array<{...}>;
  photographer?: { id: string; pdpaConsentAt: string | null } | null;
} = {}) {
  let queryCallCount = 0;

  const createChain = (resolveValue: unknown) => {
    const chainObj: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        queryCallCount++;
        return chainObj;
      }),
      limit: vi.fn().mockImplementation(() => {
        if (queryCallCount === 1) return Promise.resolve(photographer ? [photographer] : []);
        if (queryCallCount === 2) return Promise.resolve(event ? [event] : []);
        return Promise.resolve(photos);
      }),
    };
    return chainObj;
  };

  return { select: vi.fn().mockImplementation(() => createChain(null)), ... };
}
```

**2. Test app setup:**

```typescript
function createTestApp(options = {}) {
  const mockDb = createMockDb(options);

  const app = new Hono<Env>()
    .use('/*', (c, next) => {
      c.set('auth', { userId: 'clerk_123', sessionId: 'session_123' });
      return next();
    })
    .use('/*', (c, next) => {
      c.set('db', () => mockDb as unknown as Database);
      return next();
    })
    .route('/events', photosRouter);

  return { app };
}
```

**3. Test cases:**

```typescript
it('returns 401 without authentication', async () => {
  const { app } = createTestApp({ hasAuth: false });
  const client = testClient(app);
  const res = await client.events[':eventId'].photos.$get({
    param: { eventId: MOCK_EVENT_ID },
    query: {},
  });

  expect(res.status).toBe(401);
});
```

### Implementation notes for T-16

- Test validation errors (size, format)
- Test credit balance check
- Test R2 upload failure
- Mock CF Images normalization
- Test queue enqueue

---

## 10. Database Schema Patterns

**Files:**

- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/credit-ledger.ts`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/photos.ts`

### What pattern it demonstrates

- Drizzle ORM schema definitions
- Enum types
- Indexes for query performance
- Foreign key constraints

### Key code snippets to follow

**1. Enum definition:**

```typescript
export const creditLedgerTypes = ['purchase', 'upload'] as const;
export type CreditLedgerType = (typeof creditLedgerTypes)[number];
```

**2. Table with indexes:**

```typescript
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: uuid('photographer_id')
      .notNull()
      .references(() => photographers.id, { onDelete: 'restrict' }),
    amount: integer('amount').notNull(), // Positive for purchase, negative for deduction
    type: text('type', { enum: creditLedgerTypes }).notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAtCol(),
  },
  (table) => [
    index('credit_ledger_photographer_expires_idx').on(table.photographerId, table.expiresAt),
    unique('credit_ledger_stripe_session_unique').on(table.stripeSessionId),
  ],
);
```

**3. Type inference:**

```typescript
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert;
```

### Implementation notes for T-16

- Photos table already exists (no schema changes needed)
- Insert photo with status="processing"
- Update to status="indexed" happens in T-17 (consumer)

---

## Summary: Key Patterns for T-16

| Pattern                 | Exemplar File               | What to Copy                                  |
| ----------------------- | --------------------------- | --------------------------------------------- |
| **1. Route structure**  | `routes/events/index.ts`    | Middleware chaining, error helpers, R2 upload |
| **2. Credit check**     | `routes/dashboard/route.ts` | FIFO balance calculation                      |
| **3. Credit deduction** | `routes/webhooks/stripe.ts` | Idempotent insert with unique constraint      |
| **4. Job enqueue**      | `types/photo-job.ts`        | Queue payload shape                           |
| **5. Validation**       | `routes/events/schema.ts`   | Zod schemas for multipart                     |
| **6. Error handling**   | `lib/rekognition/errors.ts` | Error classification, backoff                 |
| **7. CF Images URLs**   | `routes/photos.ts`          | URL generation helpers                        |
| **8. Testing**          | `routes/photos.test.ts`     | Mock setup, test structure                    |
| **9. R2 patterns**      | `routes/events/index.ts`    | Upload with metadata, error handling          |

---

## Research Docs Reference

**CF Upload Limits:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/research/cf-upload-limits.md`

- Max file size: 50 MB
- Allowed formats: JPEG, PNG, HEIC, WebP
- CF Images max input: 70 MB

**CF Images Thumbnails:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/research/cf-images-thumbnails.md`

- HEIC is supported (auto-converts to JPEG)
- URL-based transformations via `/cdn-cgi/image/...`
- Cost: $0.50/1,000 unique transformations after 5,000 free

---

## Implementation Checklist for T-16

Using these exemplars:

- [ ] Create `POST /events/:id/photos` route (copy structure from events)
- [ ] Add multipart file upload handling (Hono's `c.req.parseBody()`)
- [ ] Validate file size (≤ 50MB) and format (JPEG/PNG/HEIC/WebP)
- [ ] Check credit balance (copy query from dashboard)
- [ ] Deduct 1 credit with FIFO expiry (copy pattern from stripe webhook)
- [ ] Normalize image via CF Images API
- [ ] Upload normalized JPEG to R2 (copy from events)
- [ ] Insert photo row with status="processing" (use photos schema)
- [ ] Enqueue job for face detection (copy from photo-job types)
- [ ] Return photo ID + URLs (copy URL helpers from photos.ts)
- [ ] Add validation tests (copy from events.test.ts)
- [ ] Add integration tests (copy from photos.test.ts)

---

**End of Exemplars Document**
