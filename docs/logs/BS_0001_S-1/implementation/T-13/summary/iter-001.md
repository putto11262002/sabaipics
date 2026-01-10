# Implementation Summary (iter-001)

Task: `T-13 — Events API (CRUD + QR generation)`
Root: `BS_0001_S-1`
Branch: `task/T-13-events-api`
PR: `pending`
Date: `2026-01-10`

## Outcome

Successfully implemented the Events CRUD API with QR code generation. All three endpoints (POST /events, GET /events, GET /events/:id) are working with proper authentication, authorization, and validation.

## Key code changes

### `apps/api/src/lib/access-code.ts` (NEW)
- Access code generation utility using `nanoid`
- 6-character uppercase alphanumeric codes (A-Z0-9)
- Excludes ambiguous characters (I, O, 0, 1) for readability
- Provides `generateAccessCode()` and `isValidAccessCode()` functions

### `apps/api/src/routes/events.ts` (NEW)
- POST /events: Create event with unique access code and QR code
  - Generates unique access code with retry logic (max 5 attempts)
  - Generates QR PNG using T-14's `generateEventQR()` function
  - Uploads QR to R2 at `qr/${accessCode}.png`
  - Sets 30-day expiry from creation date
  - Validates date range (startDate <= endDate)
- GET /events: List photographer's events
  - Filters by photographer_id for authorization
  - Ordered by createdAt desc
  - Returns photo count via subquery (not implemented in T-13)
- GET /events/:id: Get single event
  - Returns NOT_FOUND if not owned (prevents enumeration)
  - Authorization: photographer_id check

### `apps/api/src/routes/events.test.ts` (NEW)
- 18 tests covering auth, validation, success paths, and edge cases
- Tests for access code collision retry logic
- Tests for date range validation
- Tests for authorization (ownership checks)

### `apps/api/src/index.ts` (MODIFIED)
- Imported and registered `eventsRouter` after auth middleware

### `apps/api/package.json` (MODIFIED)
- Added `nanoid` dependency

## Behavioral notes

### Success path
1. Authenticated photographer with consent calls POST /events
2. Request validated (Zod schema: name 1-200 chars, optional dates)
3. Access code generated with collision retry (max 5 attempts)
4. QR PNG generated using `generateEventQR(accessCode, APP_BASE_URL)`
5. QR uploaded to R2 at `qr/${accessCode}.png`
6. Event inserted with 30-day expiry
7. Returns 201 with event data including `qrCodeUrl`

### Key failure modes handled
- **Access code collision:** Retries up to 5 times, returns 500 if all fail
- **QR generation failure:** Returns 500 with `QR_GENERATION_FAILED`
- **R2 upload failure:** Returns 500 with `QR_UPLOAD_FAILED`
- **Invalid date range:** Returns 400 with `INVALID_DATE_RANGE`
- **Unauthorized access:** Returns 401/403 via auth middleware
- **Event enumeration:** Returns NOT_FOUND (not FORBIDDEN) for non-owned events

### [KNOWN_LIMITATION]
- **QR URL format:** Uses `${APP_BASE_URL}/r2/${r2Key}` pattern - may need adjustment based on R2 public URL configuration
- **Photo count in list:** Not included in T-13 (can be added if needed by UI)

## Ops / rollout

### Flags/env
- `APP_BASE_URL` — Already configured in wrangler.jsonc
- `PHOTOS_BUCKET` — Already configured in wrangler.jsonc

### Migrations/run order
- No database migrations required (events table exists from T-1)

## How to validate

### Commands run
```bash
pnpm --filter=@sabaipics/api add nanoid          # Install dependency
pnpm --filter=@sabaipics/api test                 # Run tests (127 passed)
pnpm check-types                                   # Typecheck (all passed)
```

### Manual testing checklist (before merge)
1. Create event via API and verify QR code is generated
2. Scan QR with iPhone camera
3. Scan QR with LINE app
4. Verify photographer isolation (can't access other's events)
5. Verify access code uniqueness (create multiple events)

## Follow-ups

### [ENG_DEBT]
- Consider adding R2 public URL helper function if pattern differs
- Photo count aggregation in GET /events if UI needs it

### [PM_FOLLOWUP]
- Manual QR scannability testing required (iPhone, LINE, Android)
