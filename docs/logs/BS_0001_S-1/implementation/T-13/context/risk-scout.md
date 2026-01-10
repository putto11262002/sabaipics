# Risk Scout Report

Task: T-13 — Events API (CRUD + QR generation)
Root: BS_0001_S-1
Date: 2026-01-10

## Executive Summary

T-13 implements the Events API with CRUD operations and QR code generation, building on the foundation from T-14 (QR library). This is a **medium-complexity feature task** that introduces the core event entity used throughout the application. Key risks center around access code uniqueness, R2 integration, QR generation reliability, and proper authorization boundaries. The task blocks T-15 (Events UI) and is a dependency for T-16 (Photo Upload API).

---

## Technical Risks

### 1. Access Code Uniqueness and Collision Handling

**Risk:** Generating unique 6-character access codes could fail due to collisions or race conditions.

**Analysis:**
- Schema defines `access_code` as `text("access_code").notNull().unique()` with index
- No existing access code generation pattern in the codebase (no nanoid or similar library)
- 6-character uppercase alphanumeric (A-Z0-9) gives 36^6 = 2,176,782,336 possible combinations
- With proper random generation, collision probability is extremely low
- BUT: database unique constraint violations require retry logic

**Current state:**
- No access code generation utility exists
- No retry pattern for unique constraint violations in existing routes
- Admin credit packages uses database-generated UUIDs

**Potential failure modes:**
```typescript
// What if this happens?
const accessCode = generateAccessCode(); // "ABC123"
await db.insert(events).values({ accessCode, ... });
// ERROR: unique constraint violation (another event created "ABC123" between generate and insert)
```

**Mitigation:**
```typescript
async function generateUniqueAccessCode(db: Database, maxRetries = 5): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const code = generateAccessCode(); // 6-char uppercase A-Z0-9
    try {
      // Attempt insert with unique constraint
      // If successful, return code
      // If unique violation, retry
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      continue;
    }
  }
  throw new Error("Failed to generate unique access code");
}
```

**Alternative approach:** Generate access code AFTER database insert, use UUID as temp, then update

**Severity:** Medium (core functionality, but collision probability is very low)

---

### 2. QR Code Generation Failure Handling

**Risk:** QR code generation or R2 upload failure should not prevent event creation.

**Analysis:**
- T-14 provides `generateEventQR()` that can throw on invalid input
- R2 upload to `PHOTOS_BUCKET` could fail (network, permissions, quota)
- Current plan doesn't specify whether QR generation is optional or required

**From tasks.md (T-13):**
> Generate QR PNG with two URLs (search + slideshow)
> Uploads QR to R2

**Failure modes:**
1. Invalid access code (should never happen if we generate it ourselves)
2. QR library throws unexpected error
3. R2 upload fails (permissions, network, quota)
4. QR uploaded but database insert fails (orphaned R2 object)

**[NEED_DECISION] QR failure handling strategy**

Options:
- A) QR generation is **required** - event creation fails if QR generation fails
- B) QR generation is **optional** - event created, `qr_code_r2_key` is NULL, retry later
- C) QR generation is **async** - event created immediately, QR generated in background

**Recommendation:** Option A (required) for MVP simplicity. If QR generation fails, return 500 error to user with clear message. QR generation is fast (<100ms) and reliable.

**Severity:** Medium (affects user experience, but can fail gracefully)

---

### 3. R2 Integration and Storage Strategy

**Risk:** R2 upload failure or incorrect storage key format could cause QR retrieval issues.

**Analysis:**
- `PHOTOS_BUCKET` binding already configured in `wrangler.jsonc`
- Existing pattern: `apps/api/src/queue/photo-consumer.ts` shows R2 usage for photos
- QR storage path not specified in plan (need to define convention)

**Storage key pattern:**
- Task spec: `qr_code_r2_key` stores R2 key
- T-14 plan suggests: `qr/${eventId}.png` format
- But eventId is not known until AFTER database insert
- Chicken-and-egg problem: need eventId to generate R2 key, need R2 key to insert event

**Options:**
1. Insert event first (NULL qr_code_r2_key), generate QR, update event
2. Generate QR with temp key, insert event, rename in R2
3. Use access code as R2 key (known before insert): `qr/${accessCode}.png`

**[NEED_DECISION] R2 key strategy**

**Recommendation:** Option 3 (use access code as R2 key) - access code is unique and known before insert, no rename needed, simpler logic.

**Severity:** Low (R2 is reliable, but need to decide on key strategy)

---

### 4. Date Validation and Timezone Handling

**Risk:** Event dates could be invalid, ambiguous, or cause timezone issues.

**Analysis:**
- Schema: `start_date` and `end_date` are `timestamptz` (nullable)
- Task spec: "name (required), start/end dates (optional)"
- No timezone specified in requirements
- Thai market: UTC+7, but Cloudflare Workers uses UTC

**Potential issues:**
- User passes `start_date` > `end_date` (invalid range)
- User passes dates in the past (should this be allowed?)
- User passes dates without timezone info (ambiguous)
- Frontend passes ISO 8601 strings (need to validate format)

**Current validation patterns:**
- Admin credit packages: uses Zod for number/string validation
- Credits checkout: minimal validation, mostly database queries
- No date validation examples in existing routes

**Mitigation:**
```typescript
// Add Zod schema for event creation
const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

// Validate in handler
const data = c.req.valid("json");

// Business rule: if both dates provided, start <= end
if (data.startDate && data.endDate && data.startDate > data.endDate) {
  return c.json({
    error: { code: "INVALID_DATE_RANGE", message: "Start date must be before end date" }
  }, 400);
}
```

**Severity:** Low (dates are optional, validation is straightforward)

---

### 5. Authorization and Ownership Verification

**Risk:** Photographers must only access their own events, not others' events.

**Analysis:**
- `requirePhotographer()` middleware ensures authenticated photographer
- `requireConsent()` middleware ensures PDPA consent
- Need to verify photographer owns the event they're trying to access

**From existing patterns:**
- Dashboard route: filters by `photographerId` in WHERE clause
- Credits route: creates resources for authenticated photographer
- Admin routes: uses API key auth, bypasses photographer context

**For T-13:**
- `GET /events` - must filter by `photographerId` (already in context)
- `GET /events/:id` - must verify `event.photographerId === photographer.id`
- `POST /events` - creates event for authenticated photographer (no additional check needed)

**Attack vectors:**
1. Enumerate event IDs by guessing UUIDs
2. Access another photographer's event details
3. Modify another photographer's event (if PATCH/PUT added)

**Mitigation:**
```typescript
// GET /events/:id
const event = await db.select().from(events).where(eq(events.id, id)).limit(1);

if (!event) {
  return c.json({ error: { code: "NOT_FOUND", message: "Event not found" } }, 404);
}

if (event.photographerId !== photographer.id) {
  // Return NOT_FOUND instead of FORBIDDEN to prevent enumeration
  return c.json({ error: { code: "NOT_FOUND", message: "Event not found" } }, 404);
}
```

**Severity:** High (security boundary - must prevent unauthorized access)

---

## Security Concerns

### 1. Access Code Enumeration and Guessing

**Risk:** Attackers could guess access codes to access private event galleries.

**Analysis:**
- 6-character uppercase alphanumeric = 2.1 billion combinations
- If sequential or predictable, significantly easier to guess
- Brute force: 2.1B requests at 1 req/sec = 68 years
- BUT: if photographer creates 1000 events, and access codes are sequential...

**From T-14 risk scout:**
> Generate accessCode as 6-char uppercase alphanumeric (e.g., nanoid(6).toUpperCase())

**[GAP] No decision on access code generation method**

Options:
- A) Cryptographically random (nanoid with custom alphabet) - recommended
- B) Sequential with obfuscation (easier, but predictable)
- C) Database auto-increment encoded (very predictable, don't use)

**Recommendation:** Option A with nanoid or crypto.getRandomValues()

**Mitigation:**
```typescript
// Use nanoid with custom alphabet (A-Z0-9, no ambiguous chars)
import { customAlphabet } from 'nanoid';
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; // 36 chars
const nanoid = customAlphabet(alphabet, 6);
const accessCode = nanoid(); // e.g., "A1B2C3"
```

**Severity:** Medium (access codes are the primary authentication mechanism for event access)

---

### 2. QR Code URL Injection (Already Mitigated)

**Risk:** Malicious access code could inject unwanted URLs into QR code.

**Status:** Already mitigated by T-14 validation
- T-14's `generateEventQR()` validates format: `/^[A-Z0-9]{6}$/`
- URL construction uses template literal with validated input
- No additional mitigation needed in T-13

**Severity:** Very Low (mitigated in T-14)

---

### 3. Event Enumeration via QR URLs

**Risk:** Exposed QR codes could reveal event access patterns.

**Analysis:**
- QR encodes `https://sabaipics.com/search/{accessCode}`
- Access codes are not sequential (if using random generation)
- No authentication required to search (public endpoint)
- This is by design - attendees can scan QR without login

**[GAP] Should event search be rate-limited?**

Options:
- A) No rate limit (simplest, allows public access)
- B) IP-based rate limit (prevents abuse)
- C) Captcha after N attempts (more complex)

**Recommendation:** Option B (IP rate limit) if abuse detected, else Option A for MVP

**Severity:** Low (designed behavior, not a vulnerability)

---

## Hidden Coupling

### Upstream Dependencies

**T-13 depends on:**
- **T-1 (DB Schema)** - `events` table must exist with all columns
- **T-2 (Auth Middleware)** - `requirePhotographer()`, `requireConsent()`
- **T-14 (QR Library)** - `generateEventQR()` function must be available

**Blocked by:**
- T-14 (must be merged first)

---

### Downstream Consumers

**T-13 blocks:**
- **T-15 (Events UI)** - needs `GET /events`, `GET /events/:id`, QR URL
- **T-16 (Upload API)** - needs `events.id` and `events.accessCode` for photo uploads
- **T-18 (Gallery API)** - depends on events existing

**Expected usage:**
```typescript
// T-15 UI will call:
GET /events // List photographer's events
GET /events/:id // Get single event with QR URL

// T-16 Upload will:
// 1. Verify event exists and photographer owns it
// 2. Check event is not expired
// 3. Deduct credit and upload photo
```

---

### Implicit Dependencies

**Environment variables:**
- `APP_BASE_URL` - must be set for QR generation (already configured in wrangler.jsonc)
- `PHOTOS_BUCKET` - R2 binding for QR storage (already configured)

**Database indexes:**
- `events_photographer_id_idx` - for efficient queries by photographer
- `events_access_code_idx` - for unique constraint enforcement

**R2 lifecycle rules:**
- Plan mentions: "delete QR codes after 30 days"
- Not configured yet (needs R2 lifecycle rule setup)

---

### Integration Points

**File locations (T-13 deliverables):**
- `apps/api/src/routes/events.ts` - Main events router (NEW)
- `apps/api/src/routes/events/index.ts` - Export (NEW)
- `apps/api/src/routes/events/test.ts` - Tests (NEW)
- `apps/api/src/lib/access-code.ts` - Access code generation utility (NEW)
- Update `apps/api/src/index.ts` - Register events router

**Router registration:**
```typescript
// apps/api/src/index.ts
import { eventsRouter } from "./routes/events";

// After requirePhotographer middleware
.route("/events", eventsRouter)
```

**Route pattern:**
```typescript
// POST /events - Create event (auth required)
// GET /events - List photographer's events (auth required)
// GET /events/:id - Get single event (auth required, ownership verified)
// Future: PATCH /events/:id - Update event (not in scope for T-13)
// Future: DELETE /events/:id - Delete event (not in scope for T-13)
```

---

## HI Gates (Need Approval Before Proceeding)

### [NEED_DECISION] QR Failure Handling Strategy

**Question:** If QR generation or R2 upload fails, should event creation fail or proceed?

**Options:**
- A) Required - Event creation fails, return 500 error (recommended for MVP)
- B) Optional - Event created, `qr_code_r2_key` NULL, retry later
- C) Async - Event created immediately, QR generated in background job

**Impact:** Affects error handling, user experience, and complexity

**Recommendation:** Option A (required)

**Blocker:** Medium - can proceed with Option A as default, but should be confirmed

---

### [NEED_DECISION] R2 Key Strategy

**Question:** What should be the R2 key format for QR codes?

**Options:**
- A) `qr/${accessCode}.png` - Uses access code (unique, known before insert)
- B) `qr/${eventId}.png` - Uses UUID (need to insert event first, then update)
- C) `qr/${photographerId}/${accessCode}.png` - Namespaced by photographer

**Impact:** Affects implementation order and complexity

**Recommendation:** Option A (simplest, no race conditions)

**Blocker:** Low - any option works, just need consistency

---

### [NEED_DECISION] Access Code Generation Method

**Question:** How should access codes be generated?

**Options:**
- A) nanoid with custom alphabet (cryptographically random, recommended)
- B) crypto.getRandomValues() with base36 encoding
- C) Sequential with prefix (predictable, don't use)

**Impact:** Affects security (guessability) and collision rate

**Recommendation:** Option A (nanoid)

**Prerequisite:** Need to install nanoid package

**Blocker:** Medium - need to choose method before implementation

---

### [NEED_DECISION] Event Name Validation

**Question:** Should event names have any restrictions?

**Current plan:** "name (required)" with no length specified

**Options:**
- A) 1-200 characters (reasonable default, matches credit packages)
- B) 1-100 characters (stricter)
- C) No limit (not recommended)

**Recommendation:** Option A (1-200 chars)

**Blocker:** Low - can choose reasonable default

---

### [NEED_DECISION] Event Expiration Policy

**Question:** When should events expire?

**From plan:** "Set `expires_at = created_at + 30 days`"

**Options:**
- A) Fixed 30 days from creation (simple, per plan)
- B) Configurable by photographer (not in scope for T-13)
- C) Based on end_date + 30 days (more complex)

**Recommendation:** Option A (per plan)

**Blocker:** Low - decision already made in plan

---

### [GAP] nanoid Package Not Installed

**Question:** Should we use nanoid or write custom access code generator?

**Current state:**
- No nanoid in `apps/api/package.json`
- No access code generation utility exists

**Options:**
- A) Install nanoid: `pnpm --filter=@sabaipics/api add nanoid`
- B) Use Web Crypto API directly (no dependency)
- C) Use another library (custom-alphabet, randomstring)

**Recommendation:** Option A (nanoid is widely used, well-tested)

**Prerequisite:** Add to dependencies

**Blocker:** Low - simple to add

---

## Mitigation Strategies

### For Technical Risks

1. **Access Code Uniqueness:**
   - Use retry logic with max retries (3-5)
   - Log collision events for monitoring
   - Consider using database trigger or unique index on insert
   - If max retries exceeded, return 500 error

2. **QR Generation Failure:**
   - Wrap QR generation in try-catch
   - Log errors to Sentry
   - Return user-friendly error message
   - Consider retry once on transient failures

3. **R2 Upload Failure:**
   - Verify `PHOTOS_BUCKET` binding in tests
   - Use access code as R2 key (known before insert)
   - Set proper content-type: `image/png`
   - Log upload failures

4. **Date Validation:**
   - Use Zod schema for format validation
   - Add business rule: startDate <= endDate
   - Allow nullable dates (optional)
   - Return clear error messages

5. **Authorization:**
   - Always filter by photographerId in queries
   - Verify ownership for single event fetch
   - Return NOT_FOUND instead of FORBIDDEN (prevent enumeration)
   - Add tests for authorization bypass attempts

---

### For Security Concerns

1. **Access Code Generation:**
   - Use cryptographically secure random generation
   - Install nanoid package
   - Configure custom alphabet (A-Z0-9)
   - Test for uniqueness under load

2. **Rate Limiting (if needed):**
   - Add Cloudflare Workers rate limiting
   - Use IP-based limits for public endpoints
   - Monitor for abuse patterns
   - Not required for MVP

3. **Event Enumeration:**
   - Use NOT_FOUND for unauthorized access attempts
   - Don't reveal if event exists vs doesn't exist
   - Log failed access attempts
   - Monitor for suspicious patterns

---

### For Integration Risks

1. **T-14 Coordination:**
   - Verify T-14 is merged before starting T-13
   - Test `generateEventQR()` integration
   - Confirm APP_BASE_URL is configured
   - Validate QR output format

2. **Router Registration:**
   - Add events router to main app
   - Ensure proper middleware order
   - Test all endpoints
   - Update API documentation

3. **Database Queries:**
   - Use indexes efficiently
   - Avoid N+1 queries
   - Test with realistic data volumes
   - Monitor query performance

---

## Merge Conflict Hotspots

### Medium Risk: apps/api/src/index.ts

**File:** Main router registration

**Reason:** Multiple tasks may add new routers (T-13 events, T-16 photos, T-18 gallery)

**Conflict potential:** High if multiple tasks add routes simultaneously

**Mitigation:**
- Add events router in separate PR
- Keep router registration additive
- Use consistent pattern

```typescript
// Pattern to follow:
.route("/events", eventsRouter)  // T-13
// .route("/photos", photosRouter)  // T-16 (future)
// .route("/webhooks", webhooksRouter)  // Existing
```

---

### Low Risk: apps/api/package.json

**File:** Dependencies

**Reason:** May need to add nanoid package

**Conflict potential:** Low (lock file handles merges)

**Mitigation:**
- Add nanoid if needed
- Accept both additions if conflict

---

### Low Risk: New Routes File

**File:** `apps/api/src/routes/events.ts` (NEW)

**Reason:** New file, no conflicts expected

**Mitigation:** None needed

---

## Testing Strategy

### Unit Tests (Must Have)

```typescript
// apps/api/src/routes/events.test.ts

describe("POST /events", () => {
  it("creates event with QR code for valid input", async () => {
    // Test successful event creation
    // Verify access code format
    // Verify QR uploaded to R2
    // Verify database record
  });

  it("rejects invalid event names", async () => {
    // Test name too long, empty, etc.
  });

  it("validates date range", async () => {
    // Test startDate > endDate
  });

  it("retries on access code collision", async () => {
    // Mock database unique constraint violation
    // Verify retry logic
  });

  it("fails if QR generation fails", async () => {
    // Mock generateEventQR to throw
    // Verify error handling
  });
});

describe("GET /events", () => {
  it("returns photographer's events only", async () => {
    // Verify filtering by photographerId
  });

  it("returns empty array for new photographer", async () => {
    // Test empty state
  });

  it("orders by createdAt desc", async () => {
    // Verify sorting
  });
});

describe("GET /events/:id", () => {
  it("returns event if photographer owns it", async () => {
    // Test successful fetch
  });

  it("returns 404 if event not found", async () => {
    // Test not found
  });

  it("returns 404 if photographer doesn't own event", async () => {
    // Test authorization (returns NOT_FOUND, not FORBIDDEN)
  });
});
```

---

### Integration Tests (Should Have)

```typescript
// Test R2 upload integration
it("uploads QR to R2 with correct key", async () => {
  const event = await createEvent(photographerId);
  const qrKey = `qr/${event.accessCode}.png`;
  const qrObject = await env.PHOTOS_BUCKET.get(qrKey);
  expect(qrObject).toBeTruthy();
  expect(qrObject?.httpMetadata?.contentType).toBe("image/png");
});

// Test QR scannability
it("generates scannable QR code", async () => {
  const event = await createEvent(photographerId);
  const qrPng = await env.PHOTOS_BUCKET.get(event.qrCodeR2Key);
  // Verify PNG is valid and scannable (manual or with QR decoder)
});
```

---

### Manual Tests (Required Before Merge)

- [ ] Create event with valid data
- [ ] Create event with dates (startDate < endDate)
- [ ] Create event with invalid dates (startDate > endDate) - verify error
- [ ] Create event with very long name - verify error
- [ ] List events for photographer
- [ ] Fetch event by ID (owner)
- [ ] Fetch event by ID (non-owner) - verify 404
- [ ] Fetch non-existent event - verify 404
- [ ] Scan generated QR with iPhone camera
- [ ] Scan generated QR with LINE app
- [ ] Verify QR URL redirects correctly

---

## Implementation Checklist

### Pre-Implementation

- [ ] Verify T-14 is merged and `generateEventQR()` is available
- [ ] Decide on QR failure handling strategy (default: required)
- [ ] Decide on R2 key strategy (default: `qr/${accessCode}.png`)
- [ ] Decide on access code generation method (default: nanoid)
- [ ] Install nanoid if needed: `pnpm --filter=@sabaipics/api add nanoid`

---

### Implementation (T-13 Scope)

**Create utility:**
- [ ] Create `apps/api/src/lib/access-code.ts`
  - [ ] Export `generateAccessCode(): string`
  - [ ] Use nanoid with custom alphabet (A-Z0-9)
  - [ ] Add unit tests

**Create routes:**
- [ ] Create `apps/api/src/routes/events.ts`
  - [ ] POST /events - Create event with QR
  - [ ] GET /events - List photographer's events
  - [ ] GET /events/:id - Get single event
  - [ ] Add Zod validation schemas
  - [ ] Add error helpers
  - [ ] Add authorization checks

**Register router:**
- [ ] Update `apps/api/src/index.ts`
  - [ ] Import events router
  - [ ] Register `/events` route after auth middleware

**Tests:**
- [ ] Create `apps/api/src/routes/events.test.ts`
  - [ ] Unit tests for all endpoints
  - [ ] Authorization tests
  - [ ] Validation tests
  - [ ] Error handling tests

**Integration:**
- [ ] Test QR generation integration
- [ ] Test R2 upload
- [ ] Manual QR scanning tests
- [ ] Update API documentation

---

### Validation (T-13 Acceptance)

- [ ] All unit tests pass
- [ ] POST /events creates event with unique access code
- [ ] QR code uploaded to R2
- [ ] GET /events returns photographer's events only
- [ ] GET /events/:id returns 404 for non-owner
- [ ] Generated QR is scannable
- [ ] Access code format validated
- [ ] Date validation works
- [ ] Authorization prevents unauthorized access

---

### Handoff to T-15

- [ ] Document API endpoints
- [ ] Provide example requests/responses
- [ ] Confirm QR URL format
- [ ] Confirm event response shape

---

## Open Questions for Human Review

1. **QR Failure Handling** - Should event creation fail if QR generation fails? (recommendation: yes)

2. **R2 Key Format** - Use access code or event ID in R2 key? (recommendation: access code)

3. **Access Code Generation** - Use nanoid or custom implementation? (recommendation: nanoid)

4. **Event Name Limits** - Max length for event names? (recommendation: 200 chars)

5. **Rate Limiting** - Should event search be rate-limited? (recommendation: no for MVP)

6. **Error Messages** - Thai or English? (recommendation: English for MVP, Thai later)

---

## Provenance

**Files examined:**
- `docs/logs/BS_0001_S-1/tasks.md` - Task definition for T-13
- `docs/logs/BS_0001_S-1/plan/final.md` - Execution plan with events API requirements
- `docs/logs/BS_0001_S-1/research/qr-code-library.md` - QR library selection
- `docs/logs/BS_0001_S-1/implementation/T-14/context/risk-scout.md` - T-14 risks
- `docs/logs/BS_0001_S-1/implementation/T-14/plan.md` - T-14 implementation plan
- `packages/db/src/schema/events.ts` - Events table schema
- `apps/api/src/routes/credits.ts` - Exemplar for validation patterns
- `apps/api/src/routes/dashboard/route.ts` - Exemplar for authorization patterns
- `apps/api/src/routes/admin/credit-packages.ts` - Exemplar for CRUD patterns
- `apps/api/src/routes/consent.ts` - Exemplar for error handling
- `apps/api/src/middleware/require-photographer.ts` - Auth middleware
- `apps/api/src/lib/qr/generate.ts` - QR generation function (T-14)
- `apps/api/src/index.ts` - Main router registration
- `apps/api/wrangler.jsonc` - Environment configuration
- `apps/api/package.json` - Dependencies

**Decisions referenced:**
- Plan decision #7: QR codes (eager generation, two URLs) - clarified to single URL
- Plan decision: 30-day event expiration
- T-14 decision: Search URL only in QR (not two URLs)
- T-14 decision: Error correction level M (15%)

**Patterns identified:**
- Use Zod for request validation
- Use custom error objects with `{ error: { code, message } }` shape
- Use `requirePhotographer()` and `requireConsent()` middleware
- Return NOT_FOUND instead of FORBIDDEN for authorization failures
- Filter by photographerId in all queries
- Use Hono method chaining for type inference
