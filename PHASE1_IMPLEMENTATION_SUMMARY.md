# Phase 1: FTP Upload Support - Implementation Summary

## Completed Deliverables

All Phase 1 deliverables from `log/021-ftp-upload-support.md` section 1.10 have been implemented:

### 1. Database Schema (`packages/db/src/schema/ftp-credentials.ts`)

- **Table:** `ftp_credentials` with all required columns:
  - `id` (UUID PK, auto-generated)
  - `event_id` (UUID FK → events.id, UNIQUE)
  - `photographer_id` (UUID FK → photographers.id)
  - `username` (TEXT, UNIQUE, globally unique)
  - `password_hash` (TEXT, SHA-256 with salt)
  - `expires_at` (TIMESTAMPTZ, mirrors event.expires_at)
  - `created_at` (TIMESTAMPTZ DEFAULT NOW())
- **Indexes:** event_id, photographer_id, username
- **Exported:** Added to `packages/db/src/schema/index.ts`

### 2. Upload Intents Schema Enhancement

- **Updated:** `packages/db/src/schema/upload-intents.ts`
- **New column:** `source` (TEXT enum: 'dashboard' | 'ftp', defaults to 'dashboard')
- **Modified:** `contentLength` now nullable (optional for FTP presign)
- **Reason:** Allows analytics tracking of upload source and supports FTP's optional file size

### 3. Password Hashing Utility (`apps/api/src/lib/ftp/password.ts`)

- **Export:** `hashPassword(password: string): Promise<string>`
  - Generates random UUID as salt
  - Combines salt + password
  - SHA-256 hash via Web Crypto API
  - Returns `"salt:hash"` (hex-encoded)
- **Export:** `verifyPassword(storedHash: string, candidatePassword: string): Promise<boolean>`
  - Splits stored hash into salt and hash
  - Recomputes hash with candidate password
  - Constant-time comparison
- **Tests:** `apps/api/src/lib/ftp/password.test.ts`
  - Tests hash generation, verification, salt uniqueness, error handling

### 4. JWT Token Management (`apps/api/src/lib/ftp/jwt.ts`)

- **Library:** `jose` v6.x (CF Workers compatible, zero-dependency)
- **Export:** `signFtpToken(secret: string, payload: FtpTokenPayload): Promise<string>`
  - Algorithm: HS256 (HMAC-SHA256)
  - Subject: photographerId
  - Issued At: current timestamp
  - Expiration: 12 hours
  - Audience: 'ftp-upload' (prevents token reuse on Clerk routes)
- **Export:** `verifyFtpToken(secret: string, token: string, previousSecret?: string): Promise<FtpTokenPayload>`
  - Verifies algorithm, audience, and required claims
  - Supports key rotation: tries current secret, then previous secret
- **Tests:** `apps/api/src/lib/ftp/jwt.test.ts`
  - Tests signing, verification, key rotation, required claims

### 5. FTP Auth Middleware (`apps/api/src/middleware/ftp-auth.ts`)

- **Export:** `requireFtpAuth(): MiddlewareHandler`
  - Extracts Bearer token from Authorization header
  - Calls `verifyFtpToken()` with current and previous secrets
  - Sets `ftpAuth` context on success
  - Returns 401 UNAUTHENTICATED on failure
- **Tests:** `apps/api/src/middleware/ftp-auth.test.ts`

### 6. FTP Routes (`apps/api/src/routes/ftp.ts`)

#### POST /api/ftp/auth

- **Input:** `{ username, password }`
- **Steps:**
  1. Look up ftp_credentials by username (with events join)
  2. Verify password hash
  3. Check credential and event expiry
  4. Check photographer credit balance (fail-fast, no lock)
  5. Sign JWT token with eventId and photographerId
  6. Return auth response
- **Output:** `{ token, event_id, event_name, upload_window_end, credits_remaining }`
- **Errors:** UNAUTHENTICATED (404), UNAUTHENTICATED (bad password), UNAUTHENTICATED (expired), GONE (event expired), PAYMENT_REQUIRED (no credits)

#### POST /api/ftp/presign

- **Auth:** Requires FTP JWT (requireFtpAuth middleware)
- **Input:** `{ filename, contentType, contentLength? }`
- **Steps:**
  1. Verify JWT and extract eventId, photographerId
  2. Verify event exists and not expired
  3. Check credit balance (fail-fast)
  4. Generate unique R2 key: `uploads/{eventId}/{uploadId}-{timestamp}`
  5. Generate presigned URL (contentLength optional, uses 20MB default if omitted)
  6. Create upload_intents record with source: 'ftp'
  7. Return presigned URL response
- **Output:** `{ upload_id, put_url, object_key, expires_at, required_headers: { Content-Type } }`
- **Errors:** UNAUTHENTICATED (no token), NOT_FOUND (event), GONE (event expired), PAYMENT_REQUIRED (no credits), INTERNAL_ERROR

#### POST /events/:id/ftp-credentials (Photographer Auth)

- **Auth:** Requires Clerk authentication (requirePhotographer middleware)
- **Input:** None (event ID from URL)
- **Steps:**
  1. Verify event exists and owned by photographer
  2. Check if credentials already exist (fail if yes - CONFLICT)
  3. Generate username: `evt-{random-8-hex}`
  4. Generate high-entropy password: `crypto.randomUUID()`
  5. Hash password
  6. Create ftp_credentials record
  7. Return credentials (password shown only once)
- **Output:** `{ id, username, password, expiresAt, createdAt }`
- **Errors:** NOT_FOUND (event), CONFLICT (credentials exist)

#### GET /events/:id/ftp-credentials (Photographer Auth)

- **Auth:** Requires Clerk authentication
- **Input:** Event ID from URL
- **Steps:**
  1. Verify event exists and owned by photographer
  2. Look up ftp_credentials by eventId
  3. Return credential metadata (no password)
- **Output:** `{ id, username, expiresAt, createdAt }`
- **Errors:** NOT_FOUND (event or credentials)

#### DELETE /events/:id/ftp-credentials (Photographer Auth)

- **Auth:** Requires Clerk authentication
- **Input:** Event ID from URL
- **Steps:**
  1. Verify event exists and owned by photographer
  2. Delete ftp_credentials by eventId
  3. Return success message
- **Output:** `{ message: 'FTP credentials revoked' }`
- **Errors:** NOT_FOUND (event or credentials)

### 7. Types Enhancement (`apps/api/src/types.ts`)

- **Added to Bindings:**
  - `FTP_JWT_SECRET: string` (required)
  - `FTP_JWT_SECRET_PREVIOUS?: string` (optional, for key rotation)

### 8. Error Codes

- **Updated:** `apps/api/src/lib/error/index.ts`
- **Added:** `UNAUTHENTICATED: 401` (maps to API_ERROR_STATUS)

### 9. Router Mounting (`apps/api/src/index.ts`)

- **Mounted:** `ftpRouter` at `/api/ftp`
- **Position:** BEFORE Clerk middleware (since FTP routes use own JWT auth)
- **Import:** Added `import { ftpRouter } from './routes/ftp'`

### 10. Dependencies (`apps/api/package.json`)

- **Added:** `jose: ^6.0.0`
- **Reason:** Zero-dependency JWT library, CF Workers compatible, HS256 support

### 11. Test Files

- **Password Tests:** `apps/api/src/lib/ftp/password.test.ts`
- **JWT Tests:** `apps/api/src/lib/ftp/jwt.test.ts`
- **Middleware Tests:** `apps/api/src/middleware/ftp-auth.test.ts`
- **Routes Tests:** `apps/api/src/routes/ftp.test.ts` (placeholder for integration tests)

### 12. Documentation

- **Secrets Setup:** `WRANGLER_FTP_SECRETS.md` (instructions for setting FTP_JWT_SECRET)
- **This Summary:** `PHASE1_IMPLEMENTATION_SUMMARY.md`

## Key Design Decisions

1. **Password Hashing:** SHA-256 with random salt (not bcrypt)
   - Reason: High-entropy auto-generated passwords, no user input, sufficient security
   - Storage: `"salt:hash"` format (both hex-encoded)

2. **JWT Algorithm:** HS256 (symmetric)
   - Reason: Same service signs and verifies, no need for asymmetric keys
   - 12h expiry: Covers full event day, camera reconnects get fresh tokens
   - Audience: 'ftp-upload' prevents reuse on Clerk-authenticated routes

3. **ContentLength Optional in FTP Presign:**
   - Reason: FTP protocol doesn't guarantee file size before transfer
   - Fallback: 20MB default for presigning purposes
   - Validation: Happens post-upload in consumer (magic bytes check)

4. **Credential Lifecycle:**
   - One credential set per event (unique eventId)
   - Username globally unique (FTP server can authenticate without knowing event)
   - Password shown only at creation time (never retrievable)
   - Expires at event.expiresAt (synced, no separate credential expiry management)

5. **Credit Balance Check:**
   - Pattern: Fail-fast, no locking
   - Timing: At both auth and presign time
   - Reason: Same pattern as dashboard uploads (simple, good enough)
   - Queue consumer does final deduction under transaction lock

6. **Upload Intent Source:**
   - New field: `source` ('dashboard' | 'ftp')
   - Purpose: Analytics and debugging
   - Default: 'dashboard' (for backward compatibility)
   - FTP presign sets: 'ftp'

## Migration Strategy

Since schema is defined in TypeScript:

1. Run `pnpm -F @sabaipics/db drizzle-kit generate`
2. Generates SQL migration in `packages/db/drizzle/`
3. Deploy via `pnpm -F @sabaipics/db migrate`

The new migration will:

- Create `ftp_credentials` table
- Add `source` column to `upload_intents`
- Make `contentLength` nullable in `upload_intents`

## Setup Checklist

- [ ] Run migrations (`drizzle-kit generate` + `migrate`)
- [ ] Set `FTP_JWT_SECRET` in Wrangler secrets:
  - [ ] Development: `wrangler secret put FTP_JWT_SECRET --env development`
  - [ ] Staging: `wrangler secret put FTP_JWT_SECRET --env staging`
  - [ ] Production: `wrangler secret put FTP_JWT_SECRET --env production`
- [ ] Optionally set `FTP_JWT_SECRET_PREVIOUS` for key rotation
- [ ] Run tests: `pnpm -F @sabaipics/api test`
- [ ] Deploy: `pnpm -F @sabaipics/api deploy:staging` then `deploy:prod`

## API Response Formats

### Auth Response (POST /api/ftp/auth)

```json
{
  "token": "<jwt>",
  "event_id": "<uuid>",
  "event_name": "<string>",
  "upload_window_end": "<iso_datetime>",
  "credits_remaining": 42
}
```

### Presign Response (POST /api/ftp/presign)

```json
{
  "upload_id": "<uuid>",
  "put_url": "<presigned_r2_url>",
  "object_key": "<r2_key>",
  "expires_at": "<iso_datetime>",
  "required_headers": {
    "Content-Type": "<mime>"
  }
}
```

### Credentials Response (POST /events/:id/ftp-credentials)

```json
{
  "id": "<uuid>",
  "username": "evt-xxxxxxxx",
  "password": "<uuid>",
  "expiresAt": "<iso_datetime>",
  "createdAt": "<iso_datetime>"
}
```

### Credentials Get Response (GET /events/:id/ftp-credentials)

```json
{
  "id": "<uuid>",
  "username": "evt-xxxxxxxx",
  "expiresAt": "<iso_datetime>",
  "createdAt": "<iso_datetime>"
}
```

## Error Response Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "User-friendly message"
  }
}
```

## Next Steps (Phase 2)

Phase 2 will implement Go FTP server changes:

- Add Presign() and UploadToPresignedURL() methods to API client
- Modify UploadTransfer to call presign before streaming
- Update ClientDriver.OpenFile() to presign upfront
- Change error handling for two-stage flow (presign vs R2 PUT)
- Implement retry logic with exponential backoff for presign 429s
