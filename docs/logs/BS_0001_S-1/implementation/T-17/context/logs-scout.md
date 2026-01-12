# Logs Scout Report: T-17

**Task:** T-17 — Photo job queue processor (Rekognition + face extraction)
**Root:** BS_0001_S-1
**Date:** 2026-01-12
**Scout:** Implementation Logs Scout

---

## Summary

Scanned 16 completed tasks (T-1 through T-16, T-18) to extract established patterns, conventions, and constraints relevant to T-17's implementation of the photo job queue processor.

**Key findings:**
- Established error handling patterns (no exceptions, return 200 from webhooks/queues)
- Proven job queue pattern from T-16 (PhotoJob enqueuing)
- Database transaction patterns with row-level locking
- Image processing patterns using CF Images Transform API
- Comprehensive logging requirements for post-deduction failures
- R2 storage conventions and URL construction patterns
- Test infrastructure limitations and workarounds

---

## 1. Established Patterns & Conventions

### 1.1 Database Schema Patterns (T-1, T-2)

**UUID Primary Keys:**
- All tables use `uuid("id").primaryKey().default(sql\`gen_random_uuid()\`)`
- Foreign keys are also `uuid` type (changed from `text` in iter-002)
- Rationale: Better indexing, type safety, 16 bytes vs 36 chars

**Timestamp Conventions:**
- Use helper: `timestamptz(name)` from `packages/db/src/schema/common.ts`
- All timestamps: `timestamp({ mode: "string", withTimezone: true })`
- Created timestamps: `createdAtCol()` helper (defaultNow, notNull)

**JSONB Typed Fields:**
- `faces.bounding_box` → `BoundingBox` type
- `faces.rekognition_response` → `RekognitionFaceRecord` type
- Pattern: Co-locate type definitions with schema file (moved from separate `types.ts` in T-1 iter-002)

**Enums as Text Arrays:**
- `photoStatuses`: `['processing', 'indexed', 'failed']`
- Pattern: Define constant array, use in `.check()` constraint
- Export TypeScript type: `export type PhotoStatus = typeof photoStatuses[number];`

**Indexes Created:**
- Standard FK indexes on all foreign key columns
- Composite indexes for query optimization (e.g., `credit_ledger_photographer_expires_idx`)
- Unique constraints for idempotency (e.g., `stripe_session_id`)

### 1.2 Error Handling Patterns (T-4, T-5, T-9, T-10)

**Webhook Error Handling (T-4, T-10):**
- Always return 200 to prevent retries on bad data
- Log errors but don't throw
- Pattern from Clerk webhook:
  ```typescript
  try {
    await handleEvent(event, c.var.db);
  } catch (handlerError) {
    console.error(`[Webhook] Handler error:`, handlerError);
  }
  return c.json({ success: true }, 200);
  ```
- Rationale: Prevent Svix/Stripe retries on data issues

**Idempotency Patterns:**
- T-4: Check existence before insert (Clerk webhook)
- T-10: Unique constraint on `stripe_session_id` for credit fulfillment
- T-5: Return 409 if already consented (pdpaConsentAt already set)
- Pattern: Database constraints > application logic for concurrency safety

**Post-Deduction Error Handling (T-16):**
- Critical logging pattern for failures after credit deduction:
  ```typescript
  console.error("[Upload] R2 upload failed (CREDIT ALREADY DEDUCTED)", {
    photographerId: photo.photographerId,
    photoId: photo.id,
    eventId,
    creditsDeducted: 1,
    error: err,
  });
  ```
- No refunds after deduction (per plan decision)
- Comprehensive context logging for manual reconciliation

### 1.3 Job Queue Pattern (T-16)

**Queue Enqueuing:**
```typescript
// From T-16 photo upload endpoint
await c.env.PHOTO_QUEUE.send({
  photo_id: photo.id,
  event_id: eventId,
  r2_key: photo.r2Key,
});
```

**Queue Binding:**
- Configured in `wrangler.jsonc`
- Type: `Queue<PhotoJob>` from CloudflareBindings
- Job payload: `{ photo_id: string, event_id: string, r2_key: string }`

**Error Handling Expectation:**
- Queue consumer should return success (no throw) after processing
- Failed jobs should be logged and marked in database
- DLQ monitoring mentioned as [ENG_DEBT] in T-16

### 1.4 Image Processing Patterns (T-14, T-16)

**CF Images Transform Integration (T-16 iter-002):**
- Normalization function: `normalizeImage()` in `apps/api/src/lib/images/normalize.ts`
- Uses temporary R2 storage for CF Images Transform API
- Process: Upload to `tmp/normalize-{timestamp}-{random}` → fetch transformed → cleanup
- Default options:
  ```typescript
  {
    format: "jpeg",
    maxWidth: 4000,
    maxHeight: 4000,
    quality: 90,
    fit: "scale-down",
  }
  ```

**R2 Storage Conventions:**
- QR codes: `qr/${accessCode}.png` (T-13, T-14)
- Photos: `${eventId}/${photoId}.jpg` (T-16)
- Temp files: `tmp/normalize-${timestamp}-${random}` (T-16)

**R2 URL Construction (T-18):**
- Presigned download URLs: AWS SDK v3 for 15min expiry
- CF Images Transform URLs for thumbnails/previews
- Pattern: `${PHOTO_R2_BASE_URL}/${r2Key}?format=jpeg&width=400`

### 1.5 API Patterns

**Authentication & Authorization (T-2, T-3, T-13):**
- `requirePhotographer()` middleware: Sets minimal context `{ id, pdpaConsentAt }`
- `requireConsent()` middleware: Checks pdpaConsentAt not null
- `requireAdmin()` middleware: API key header check
- Ownership checks: Return 404 (not 403) to prevent enumeration

**Validation (T-3, T-5, T-13, T-16):**
- Use `zValidator` from `@hono/zod-validator`
- Pattern: Define schema, use in route, testClient infers types
- File validation: `z.instanceof(File)` with refinements

**Response Envelopes:**
- List endpoints: `{ data: [...] }`
- Single resource: `{ data: {...} }`
- Errors: Zod-like shape (though not validated everywhere)

**Pagination (T-18):**
- Cursor-based pagination (timestamp-based)
- Max limit enforced (50 per page in T-18)
- Response includes cursor for next page

### 1.6 Transaction Patterns (T-9, T-10, T-16)

**Row-Level Locking (T-16):**
```typescript
const db = c.var.db();
await db.transaction(async (tx) => {
  // Lock photographer row for credit check
  const [photographer] = await tx
    .select({ balance: creditBalance })
    .from(photographers)
    .where(eq(photographers.id, photographerId))
    .for("update"); // Row-level lock

  // Deduct credit, create record
  // ...
});
```
- Prevents race conditions in concurrent uploads
- Used for credit deduction with FIFO expiry inheritance

**FIFO Credit Expiry (T-10, T-16):**
- Find oldest unexpired credit: `MIN(expires_at) WHERE expires_at > NOW()`
- Deduction inherits expiry from oldest credit
- Explicit check: abort if no unexpired credits found (data integrity)

**Idempotency via Unique Constraints (T-10):**
- Stripe session: `unique("stripe_session_id")`
- Catch constraint violation, treat as success

---

## 2. Known Limitations & Technical Debt

### 2.1 Test Infrastructure Limitations

**Dashboard Testing (T-6, T-11, T-12, T-15):**
- No UI test infrastructure (Vitest not configured for dashboard)
- Tests written but removed/not run
- [ENG_DEBT] Set up Vitest + React Testing Library

**API FormData Testing (T-16):**
- Hono testClient has FormData handling limitations
- Unit tests structurally correct but fail with 400
- Workaround: Manual testing or integration tests with `@cloudflare/vitest-pool-workers`

### 2.2 Image Processing Limitations

**T-16 Normalization (iter-002):**
- Not truly "in-memory" (uses temp R2 storage)
- Still 2 R2 writes per upload (temp + final)
- [ENG_DEBT] Consider CF Images Upload API or WASM for true in-memory processing

**Temp R2 Cleanup:**
- Cleanup happens in `normalizeImage()` function
- [ENG_DEBT] Monitor for orphaned `tmp/normalize-*` objects
- No TTL policy or cleanup job defined

### 2.3 Post-Deduction Failures

**No Refund Policy (T-16):**
- Credits non-refundable after deduction
- Post-deduction failures require manual reconciliation via logs
- [PM_FOLLOWUP] Define manual refund process for systematic failures

**DLQ Monitoring (T-16):**
- Queue messages that fail all retries go to DLQ
- No monitoring or manual retry process defined
- [ENG_DEBT] Add DLQ monitoring and alerting

### 2.4 Missing Features

**Rate Limiting (T-16):**
- Upload endpoint has no rate limiting
- [PM_FOLLOWUP] Define acceptable upload rate policy

**Idempotency (T-16):**
- No duplicate upload prevention (hash-based deduplication)
- [PM_FOLLOWUP] Decide: accept duplicates vs SHA-256 dedup

**Event Editing/Deletion (T-15):**
- No PATCH /events/:id or DELETE /events/:id endpoints
- [ENG_DEBT] Add if needed for photographer UX

---

## 3. Ops Conventions

### 3.1 Environment Variables

**Naming Conventions:**
- Cloudflare-specific: `CF_ACCOUNT_ID`, `CF_ZONE`
- Service credentials: `AWS_ACCESS_KEY_ID`, `R2_ACCESS_KEY_ID`
- Bucket names: `PHOTO_BUCKET_NAME`
- Base URLs: `PHOTO_R2_BASE_URL`, `APP_BASE_URL`
- Secrets: `ADMIN_API_KEY`, `STRIPE_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`

**Configuration Files:**
- `wrangler.jsonc`: Config vars, bindings
- `.dev.vars`: Local development secrets (gitignored)
- `.dev.vars.example`: Template for team setup

**Type Generation (T-18):**
- `wrangler types` generates `CloudflareBindings` from config
- Run `pnpm cf-typegen` manually when wrangler.jsonc changes
- `types.ts`: `export type Bindings = CloudflareBindings`

### 3.2 Deployment Patterns

**Migration Run Order:**
- T-1: Initial schema creation
- T-9: Added `stripe_customer_id` column
- T-10: Added unique constraint on `stripe_session_id`
- Pattern: Run `pnpm --filter=@sabaipics/db db:push` before deploying code

**No Deployment Blockers:**
- Most tasks are backward-compatible additions
- Migrations are additive (no data changes)

### 3.3 Monitoring & Logging

**Comprehensive Context Logging (T-16):**
- Log photographerId, photoId, eventId, creditsDeducted for failures
- Enables manual reconciliation
- Pattern: Structured logging with actionable context

**Webhook Success Logging (T-4, T-10):**
- Log event type and key identifiers
- Log "already exists, skipping (idempotent)" for duplicate webhooks

---

## 4. Testing Patterns

### 4.1 Unit Test Structure (T-3, T-5, T-7, T-10, T-13, T-16)

**Hono testClient Pattern:**
```typescript
import { testClient } from "hono/testing";

const client = testClient(app, MOCK_ENV);

const res = await client.endpoint.$post({ json: payload });
expect(res.status).toBe(201);
```

**Mock Environment:**
- Create `MOCK_ENV` with all required bindings
- Mock R2: `{ put: vi.fn(), get: vi.fn(), delete: vi.fn() }`
- Mock Queue: `{ send: vi.fn() }`
- Mock DB: Use actual Drizzle with in-memory SQLite

**Test Categories:**
- Auth tests: 401 unauthenticated, 403 no consent
- Validation tests: 400 for invalid input
- Authorization tests: 404 for non-owned resources
- Success path: 200/201 with expected response
- Failure modes: 500 for post-validation failures

### 4.2 Test Coverage Observations

**Good Coverage:**
- T-3: 10 tests for admin CRUD
- T-5: 6 tests for consent flow
- T-10: 9 tests for credit fulfillment
- T-13: 18 tests for events CRUD
- T-16: 12 tests for photo upload

**Limited Coverage:**
- T-4: No webhook tests (difficult to test signature verification)
- T-14: 8 QR tests, but no scannability verification
- T-18: 10 tests for gallery API

**Manual Testing Required:**
- T-6: Full signup flow with Google OAuth
- T-12: Stripe checkout integration
- T-14: QR scannability with iPhone/LINE/Android

---

## 5. Follow-Ups Impacting T-17

### 5.1 Direct Dependencies

**T-16 Photo Upload:**
- Creates photos with status='processing'
- Enqueues PhotoJob: `{ photo_id, event_id, r2_key }`
- T-17 must process these jobs and update status to 'indexed' or 'failed'

**T-1 Database Schema:**
- `photos` table: status enum includes 'processing', 'indexed', 'failed'
- `faces` table: Ready for face records
- T-17 must insert face records and update photo status

### 5.2 Known Gaps T-17 Must Handle

**Photo Status Transitions:**
- 'processing' → 'indexed' (success)
- 'processing' → 'failed' (Rekognition error)
- No transition back to 'processing' (no retry in T-17 scope)

**Face Count Update:**
- T-16 sets `face_count: 0` initially
- T-17 must update after face detection

**Rekognition Collection Management:**
- T-13 sets `rekognition_collection_id: null` on event creation
- Collection creation deferred to "when first photo needs indexing"
- T-17 must handle collection creation on first photo

### 5.3 Monitoring Requirements from Prior Tasks

**Credit Deduction Errors (T-10, T-16):**
- Alert if NO_UNEXPIRED_CREDITS occurs (data integrity issue)
- Track R2/transform/queue failures

**Upload Success Rate (T-16):**
- Target > 95% (track by format: JPEG, PNG, HEIC, WebP)

**For T-17:**
- Track Rekognition success rate
- Track face detection counts (0, 1-5, 6-10, 11+)
- Alert on systematic failures (collection creation, API errors)

---

## 6. Rekognition Integration Patterns

### 6.1 Existing Rekognition Types (T-1)

**From `packages/db/src/schema/faces.ts`:**
```typescript
export type BoundingBox = {
  Width: number;
  Height: number;
  Left: number;
  Top: number;
};

export type FaceDetail = {
  BoundingBox: BoundingBox;
  Confidence: number;
};

export type RekognitionFace = {
  Face: {
    FaceId: string;
    BoundingBox: BoundingBox;
    ImageId: string;
    ExternalImageId: string;
    Confidence: number;
  };
  FaceDetail: FaceDetail;
};

export type RekognitionFaceRecord = {
  FaceRecords: RekognitionFace[];
  UnindexedFaces: {
    Reasons: string[];
    FaceDetail: FaceDetail;
  }[];
};
```

**Usage:**
- `faces.bounding_box`: JSONB typed as `BoundingBox`
- `faces.rekognition_response`: JSONB typed as `RekognitionFaceRecord`

### 6.2 AWS SDK Patterns (T-18)

**T-18 uses AWS SDK v3 for R2 presigned URLs:**
```typescript
import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
```

**Pattern for T-17:**
- Use `@aws-sdk/client-rekognition` for IndexFaces API
- Configure with AWS credentials from env vars
- Endpoint URL for S3 reference: R2 bucket URL

---

## 7. Codebase Organization

### 7.1 File Structure Patterns

**API Routes:**
- `apps/api/src/routes/<resource>.ts` - Main route file
- `apps/api/src/routes/<resource>.test.ts` - Unit tests
- `apps/api/src/routes/<resource>/schema.ts` - Validation schemas (if complex)

**Libraries:**
- `apps/api/src/lib/<domain>/<function>.ts` - Reusable functions
- Examples: `lib/qr/generate.ts`, `lib/images/normalize.ts`
- Pattern: Co-locate related functions in domain folders

**Middleware:**
- `apps/api/src/middleware/<name>.ts` - Middleware functions
- `apps/api/src/middleware/index.ts` - Barrel export

**Database:**
- `packages/db/src/schema/<table>.ts` - Table definitions
- `packages/db/src/schema/common.ts` - Shared helpers
- `packages/db/src/schema/relations.ts` - Drizzle relations
- `packages/db/src/schema/index.ts` - Barrel export

### 7.2 Import Patterns

**Package Imports:**
- `@sabaipics/db` - Database client and schema
- `@sabaipics/db/schema` - Schema exports
- `@sabaipics/auth` - Auth utilities (unused in API, lives in middleware)

**Relative Imports:**
- Same directory: `./helper`
- Parent lib: `../../lib/qr`
- Middleware: `../../middleware`

---

## 8. Recommendations for T-17

### 8.1 Must Follow

1. **Return 200 from queue consumer** - Even on failures (log and mark photo as 'failed')
2. **Use comprehensive logging** - Log photographerId, photoId, eventId, error context
3. **No exceptions in queue handler** - Catch all errors, mark as failed, return success
4. **Idempotent processing** - Check photo status before processing (already 'indexed' → skip)
5. **Update face_count atomically** - Single UPDATE after inserting all faces
6. **Use typed JSONB** - Store full Rekognition response in `rekognition_response` field

### 8.2 Should Consider

1. **Collection creation pattern** - Check if collection exists before IndexFaces
2. **Transaction for status update** - Wrap face inserts + photo update in transaction
3. **R2 image fetching** - Reuse R2 presigned URL pattern from T-18 if needed
4. **AWS SDK v3 client reuse** - Create Rekognition client once, reuse for all jobs
5. **Bounding box normalization** - Rekognition returns 0-1 floats, verify storage format

### 8.3 Testing Strategy

1. **Mock Rekognition client** - Use vi.mock for `@aws-sdk/client-rekognition`
2. **Test status transitions** - 'processing' → 'indexed', 'processing' → 'failed'
3. **Test face count updates** - Verify COUNT(faces) = photo.face_count
4. **Test collection creation** - First photo creates collection, subsequent photos reuse
5. **Test idempotency** - Processing already-indexed photo should skip gracefully

---

## 9. Code Patterns to Reuse

### 9.1 DB Transaction with Error Handling (from T-16)

```typescript
try {
  const result = await db.transaction(async (tx) => {
    // Lock row if needed
    const [record] = await tx
      .select()
      .from(table)
      .where(eq(table.id, id))
      .for("update");
    
    // Perform updates
    await tx.insert(childTable).values(...);
    await tx.update(table).set({ status: "done" }).where(eq(table.id, id));
    
    return record;
  });
} catch (err) {
  console.error("[Context] Transaction failed", { id, error: err });
  throw err;
}
```

### 9.2 Queue Message Processing (Expected Pattern)

```typescript
export default {
  async queue(batch: MessageBatch<PhotoJob>, env: Env) {
    for (const message of batch.messages) {
      try {
        await processPhoto(message.body, env);
        message.ack(); // Mark as successfully processed
      } catch (err) {
        console.error("[PhotoQueue] Failed to process", {
          photoId: message.body.photo_id,
          error: err,
        });
        // Don't throw - let message retry or go to DLQ
        message.retry(); // Or message.ack() if unrecoverable
      }
    }
  },
};
```

### 9.3 Status Enum Update (from T-1)

```typescript
import { photos, photoStatuses } from "@sabaipics/db/schema";

// Update to 'indexed'
await db
  .update(photos)
  .set({ 
    status: "indexed" as typeof photoStatuses[number],
    faceCount: detectedFaces.length,
  })
  .where(eq(photos.id, photoId));

// Update to 'failed'
await db
  .update(photos)
  .set({ status: "failed" })
  .where(eq(photos.id, photoId));
```

---

## 10. Anti-Patterns to Avoid

### 10.1 From Prior Mistakes

1. **Don't use `text` for UUIDs** - Use `uuid` type (corrected in T-1 iter-002)
2. **Don't skip idempotency checks** - Always check before creating records
3. **Don't throw from webhooks/queues** - Return success, log failures
4. **Don't forget row-level locking** - Use `.for("update")` for credit checks
5. **Don't update photo before R2 upload** - Set r2Key in transaction (T-16 pattern)

### 10.2 Testing Anti-Patterns

1. **Don't rely on FormData in Hono tests** - Known limitation, use manual testing
2. **Don't skip manual testing** - Unit tests don't cover integration paths
3. **Don't test scannability in unit tests** - QR/image validation needs real devices

---

## Conclusion

T-17 should follow established patterns for:
- Queue message processing (return 200, comprehensive logging)
- Database transactions (row-level locking if needed)
- Status transitions (processing → indexed/failed)
- Error handling (catch all, no throws)
- Testing (mock Rekognition, verify status updates)

Key dependencies verified:
- T-16 enqueues PhotoJob messages
- T-1 schema ready for face records
- T-13 events have rekognition_collection_id field

Known constraints:
- No refunds after failures (log for manual reconciliation)
- DLQ monitoring not implemented (ENG_DEBT)
- Test infrastructure limitations (manual testing needed)

**Ready to proceed with T-17 implementation following these established patterns.**
