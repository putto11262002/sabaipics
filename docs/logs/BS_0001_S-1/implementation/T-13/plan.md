# Implementation Plan

Task: `T-13 — Events API (CRUD + QR generation)`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-10`
Owner: `implementv3`

## Inputs
- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: `T-13`)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-13/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-13/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-13/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-13/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-13/context/risk-scout.md`

## Goal / non-goals

**Goal:**
- Implement Events CRUD API with QR code generation on event creation
- Generate unique 6-character access codes
- Upload QR codes to R2 storage
- Enable photographer-scoped event listing and retrieval

**Non-goals:**
- PATCH/DELETE endpoints (not in T-13 scope)
- Public event search endpoint (future task)
- Event photo upload handling (T-16)
- Rekognition collection creation (lazy, done in T-17)

## Approach (data-driven)

### 1. Access Code Generation
**Pattern from:** `apps/api/src/lib/qr/generate.ts` (T-14)

Use `nanoid` with custom alphabet for cryptographically random 6-char codes:
```typescript
import { customAlphabet } from 'nanoid';
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; // 36 chars
const nanoid6 = customAlphabet(alphabet, 6);
const accessCode = nanoid6(); // e.g., "A1B2C3"
```

Retry logic on unique constraint violation (max 5 attempts).

### 2. Event Creation Flow
**Pattern from:** `apps/api/src/routes/admin/credit-packages.ts` (T-3)

Sequence:
1. Validate request (Zod schema)
2. Generate unique access code with retry
3. Generate QR PNG using `generateEventQR()` from T-14
4. Upload QR to R2 with key `qr/${accessCode}.png` (access code known before insert)
5. Insert event record with 30-day expiry
6. Return 201 with event data

**R2 key strategy:** Use access code (not eventId) - avoids chicken-and-egg problem.

### 3. Route Structure
**Pattern from:** `apps/api/src/routes/admin/credit-packages.ts`, `apps/api/src/routes/consent.ts`

```typescript
type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

export const eventsRouter = new Hono<Env>()
  .post("/", requirePhotographer(), requireConsent(), ...)  // Create
  .get("/", requirePhotographer(), requireConsent(), ...)   // List
  .get("/:id", requirePhotographer(), requireConsent(), ...); // Get single
```

### 4. Authorization
**Pattern from:** `apps/api/src/routes/dashboard/route.ts`

- List endpoint: Filter by `photographerId` in WHERE clause
- Single endpoint: Return NOT_FOUND (not FORBIDDEN) if photographer doesn't own event
- Prevents enumeration attack

### 5. Response Shape
**Pattern from:** All prior API tasks

```typescript
// Success
{ data: { ... } }  // 200 or 201

// Error
{ error: { code: "STRING_CODE", message: "..." } }  // 400, 404, etc.
```

## Contracts (only if touched)

### API Endpoints

**POST /events**
```typescript
Request: {
  name: string;           // 1-200 chars
  startDate?: string;     // ISO 8601 datetime, nullable
  endDate?: string;       // ISO 8601 datetime, nullable
}

Response (201): {
  data: {
    id: string;
    photographerId: string;
    name: string;
    startDate?: string;
    endDate?: string;
    accessCode: string;
    qrCodeUrl: string;        // R2 public URL
    rekognitionCollectionId: null;
    expiresAt: string;
    createdAt: string;
  }
}
```

**GET /events**
```typescript
Response (200): {
  data: [{
    id: string;
    name: string;
    startDate?: string;
    endDate?: string;
    accessCode: string;
    qrCodeUrl: string;
    createdAt: string;
  }]
}
```

**GET /events/:id**
```typescript
Response (200): {
  data: {
    id: string;
    photographerId: string;
    name: string;
    startDate?: string;
    endDate?: string;
    accessCode: string;
    qrCodeUrl: string;
    rekognitionCollectionId: null;
    expiresAt: string;
    createdAt: string;
  }
}
```

### Database
No schema changes required (events table exists from T-1).

Insert pattern:
```typescript
const expiresAt = new Date();
expiresAt.setDate(expiresAt.getDate() + 30);

await db.insert(events).values({
  photographerId: photographer.id,
  name,
  startDate,
  endDate,
  accessCode,
  qrCodeR2Key: `qr/${accessCode}.png`,
  rekognitionCollectionId: null,
  expiresAt: expiresAt.toISOString(),
});
```

### R2 Storage
Key pattern: `qr/${accessCode}.png`
Content-Type: `image/png`

## Success path

### POST /events
1. Authenticated photographer with consent
2. Request validated (Zod)
3. Access code generated (unique after max 5 retries)
4. QR PNG generated using `generateEventQR(accessCode, APP_BASE_URL)`
5. QR uploaded to `PHOTOS_BUCKET` at `qr/${accessCode}.png`
6. Event inserted with 30-day expiry
7. Returns 201 with event data including `qrCodeUrl`

### GET /events
1. Authenticated photographer with consent
2. Query filtered by `photographerId`
3. Ordered by `createdAt` desc
4. Returns 200 with array of events

### GET /events/:id
1. Authenticated photographer with consent
2. Event fetched by ID
3. Ownership verified (`event.photographerId === photographer.id`)
4. Returns 200 with event data or 404 if not found/not owned

## Failure modes / edge cases (major only)

### Access Code Collision
- Retry generation up to 5 times
- If still colliding, return 500 with `ACCESS_CODE_GENERATION_FAILED`

### QR Generation Failure
- QR generation is **required** for event creation
- If `generateEventQR()` throws, return 500 with `QR_GENERATION_FAILED`
- Event not created if QR fails

### R2 Upload Failure
- If R2 put fails, return 500 with `QR_UPLOAD_FAILED`
- Event not created if upload fails

### Invalid Date Range
- If `startDate > endDate`, return 400 with `INVALID_DATE_RANGE`

### Unauthorized Access
- Non-owner accessing `GET /events/:id` returns 404 (not FORBIDDEN)
- Prevents event enumeration

### No Auth
- All endpoints return 401 without `requirePhotographer()`

### No Consent
- All endpoints return 403 without `requireConsent()`

## Validation plan

### Tests to add

**Unit tests:** `apps/api/src/routes/events.test.ts`
- POST /events: success, validation errors, auth failures
- GET /events: empty list, filtered by photographer
- GET /events/:id: success, not found, not owned
- Access code generation: uniqueness, format retry logic

**Manual tests (required before merge):**
- Create event via API
- Scan QR with iPhone camera
- Scan QR with LINE app
- Verify ownership isolation

### Commands to run
```bash
# Install nanoid dependency
pnpm --filter=@sabaipics/api add nanoid

# Run unit tests
pnpm --filter=@sabaipics/api test

# Build API
pnpm --filter=@sabaipics/api build
```

## Rollout / rollback

### Flags/env
- `APP_BASE_URL` - Already configured in wrangler.jsonc
- `PHOTOS_BUCKET` - Already configured in wrangler.jsonc

### Migrations/run order
No database migrations required (schema exists from T-1).

### Rollback
Delete route registration from `apps/api/src/index.ts` to disable endpoint.

## Open questions

### [NEED_DECISION] QR Failure Handling
- **Question:** If QR generation or R2 upload fails, should event creation fail or proceed?
- **Options:**
  - A) Required - Event creation fails, return 500 error (recommended for MVP)
  - B) Optional - Event created, `qr_code_r2_key` NULL, retry later
  - C) Async - Event created immediately, QR generated in background job
- **Recommendation:** Option A (required)
- **Impact:** Affects error handling and user experience

### [NEED_DECISION] R2 Key Strategy
- **Question:** What should be the R2 key format for QR codes?
- **Options:**
  - A) `qr/${accessCode}.png` - Uses access code (unique, known before insert)
  - B) `qr/${eventId}.png` - Uses UUID (need to insert event first, then update)
  - C) `qr/${photographerId}/${accessCode}.png` - Namespaced by photographer
- **Recommendation:** Option A (simplest, no race conditions)
- **Impact:** Affects implementation order and complexity

### [NEED_DECISION] Access Code Generation Method
- **Question:** How should access codes be generated?
- **Options:**
  - A) nanoid with custom alphabet (cryptographically random, recommended)
  - B) crypto.getRandomValues() with base36 encoding
  - C) Sequential with prefix (predictable, don't use)
- **Recommendation:** Option A (nanoid)
- **Impact:** Affects security (guessability) and collision rate
- **Prerequisite:** Need to install nanoid package

### [NEED_DECISION] Event Name Validation
- **Question:** Should event names have any restrictions?
- **Options:**
  - A) 1-200 characters (reasonable default, matches credit packages)
  - B) 1-100 characters (stricter)
  - C) No limit (not recommended)
- **Recommendation:** Option A (1-200 chars)
- **Impact:** Affects validation schema

### [GAP] Photo Count in GET /events
- **Question:** Should the list endpoint include `photo_count`?
- **Analysis:** Dashboard UI (T-11) shows photo count on event cards, but API contract not explicit.
- **Resolution:** Exclude for T-13 (can be added later if needed by UI)

### [GAP] QR URL Format
- **Question:** How to construct QR URL from R2 key?
- **Resolution:** Use R2 public URL pattern (to be confirmed with existing R2 configuration)

### [NEED_VALIDATION] Start/End Date Handling
- **Question:** Are startDate/endDate validated for logical consistency?
- **Resolution:** Yes, validate `startDate <= endDate` if both provided
