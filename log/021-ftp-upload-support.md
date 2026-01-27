# 021 - FTP Upload Support

Implementation plan for connecting the existing Go FTP server to the API using the presigned URL upload flow.

## Context

The Go FTP server (`apps/ftp-server`) is fully built but its two expected API endpoints do not exist:

- `POST /api/ftp/auth` -- authenticate FTP credentials, return JWT
- `POST /api/ftp/upload` -- stream photo upload via FormData

The decision is to use **Option B: Presigned URL flow** instead of direct FormData upload. This means:

- The FTP server will call a presign endpoint to get an R2 PUT URL
- Stream the file directly to R2 (no CF Worker body buffering)
- The existing `upload-consumer` queue handles normalization, credit deduction, photo creation, and face detection enqueueing

This decouples the heavy data transfer (camera → FTP server → R2) from the lightweight API calls (presign, auth), and lets the queue absorb burst uploads.

## Architecture

```
Camera (FTP/FTPS)
  │
  ▼
FTP Server (Go, VPS)
  │
  ├─ AUTH ──► POST /api/ftp/auth ──► CF Worker (validate credentials, sign JWT)
  │                                     │
  │                                     ▼
  │                              Return JWT + event metadata
  │
  ├─ STOR ──► Step 1: POST /api/ftp/presign ──► CF Worker (verify JWT, create upload_intent, return presigned R2 PUT URL)
  │           Step 2: PUT to R2 presigned URL ──► R2 (direct, no Worker involved)
  │
  ▼
R2 Event Notification
  │
  ▼
upload-processing queue (existing)
  │
  ▼
upload-consumer (existing): validate → normalize → credit deduct → photo record → enqueue face detection
```

---

## Phase 1: API Implementation

### 1.1 Database: `ftp_credentials` table

New table in `packages/db/src/schema/ftp-credentials.ts`:

```
ftp_credentials
├── id              UUID PK (gen_random_uuid)
├── event_id        UUID FK → events.id (unique -- one credential set per event)
├── photographer_id UUID FK → photographers.id
├── username        TEXT NOT NULL UNIQUE (auto-generated, e.g. "evt-{short_id}")
├── password_hash   TEXT NOT NULL (bcrypt or argon2)
├── expires_at      TIMESTAMPTZ NOT NULL (mirrors event.expires_at)
├── created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Key decisions:

- **One credential per event** (`event_id` UNIQUE). Photographer generates credentials from the dashboard for a specific event. Simplifies the auth → event mapping.
- **Username is globally unique** so the FTP server can authenticate without knowing the event upfront. The API looks up the username, finds the event, verifies the password.
- **Password stored hashed.** Plaintext shown once at generation time, never retrievable again.
- **expires_at** tied to event expiry. Auth endpoint rejects expired credentials.

Migration: standard Drizzle `drizzle-kit generate` + `drizzle-kit migrate`.

### 1.2 JWT Module: `apps/api/src/lib/ftp/jwt.ts`

Library: **`jose`** (v6.x, zero-dependency, explicitly CF Workers compatible, uses `crypto.subtle`).

```typescript
// Sign
import { SignJWT } from 'jose';

export async function signFtpToken(secret: string, payload: FtpTokenPayload): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({
    eventId: payload.eventId,
    photographerId: payload.photographerId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.photographerId)
    .setIssuedAt()
    .setExpirationTime('12h')
    .setAudience('ftp-upload')
    .sign(key);
}

// Verify
import { jwtVerify } from 'jose';

export async function verifyFtpToken(secret: string, token: string): Promise<FtpTokenPayload> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, {
    algorithms: ['HS256'],
    audience: 'ftp-upload',
    requiredClaims: ['eventId', 'photographerId'],
  });
  return {
    eventId: payload.eventId as string,
    photographerId: payload.photographerId as string,
  };
}
```

Algorithm: **HS256** (symmetric HMAC-SHA256).

- Same Worker signs and verifies -- no need for asymmetric keys.
- Secret stored as Wrangler secret: `FTP_JWT_SECRET` (generated via `openssl rand -base64 32`).
- 12h expiry covers a full event day. Camera reconnects get a fresh token.
- `aud: 'ftp-upload'` prevents token reuse on Clerk-authenticated routes.

Key rotation: support `FTP_JWT_SECRET` + `FTP_JWT_SECRET_PREVIOUS` in the verify path. Sign with current only, verify against both. Zero-downtime rotation.

### 1.3 Password Hashing

Use Web Crypto API directly (no extra dependency). The approach:

- **Hash:** SHA-256 of `salt + password` stored as `salt:hash` (both hex).
- Alternative: use a lightweight `bcrypt` WASM package if available for CF Workers. But SHA-256 with a per-credential random salt is sufficient for this use case -- these are auto-generated high-entropy passwords, not user-chosen passwords.

```typescript
// Generate
const password = crypto.randomUUID(); // 36-char high-entropy
const salt = crypto.randomUUID();
const hash = await sha256(salt + password);
// Store: `${salt}:${hash}`

// Verify
const [salt, storedHash] = stored.split(':');
const hash = await sha256(salt + candidatePassword);
return hash === storedHash;
```

### 1.4 Route: `POST /api/ftp/auth`

New file: `apps/api/src/routes/ftp.ts`

Mounted in `index.ts` BEFORE Clerk middleware (FTP routes use their own auth):

```typescript
// in index.ts, between admin routes and clerk middleware:
.route('/api/ftp', ftpRouter)
```

**`POST /api/ftp/auth` handler:**

1. Accept JSON `{ username, password }`
2. Look up `ftp_credentials` by `username` (single DB query with JOIN to events + photographers)
3. Verify password hash
4. Check `expires_at > NOW()`
5. Check credit balance (fail-fast, no lock -- same pattern as `uploads.ts`)
6. Sign JWT with `{ eventId, photographerId }`
7. Return:

```json
{
  "token": "<jwt>",
  "event_id": "<uuid>",
  "event_name": "<string>",
  "upload_window_end": "<iso_datetime>",
  "credits_remaining": 42
}
```

This matches the `AuthResponse` struct the Go FTP server already expects (`client.go:36-43`).

Error responses use the `{ error: { code, message } }` format the Go client already parses (`client.go:57-63`).

### 1.5 Route: `POST /api/ftp/presign`

**New endpoint** (not in the original FTP server -- requires Go-side changes in Phase 2).

**`POST /api/ftp/presign` handler:**

1. Extract Bearer token from `Authorization` header
2. Verify JWT via `verifyFtpToken()`
3. Accept JSON `{ filename, contentType, contentLength? }`
   - `contentType` required -- Go side infers from filename extension (`.jpg` → `image/jpeg`)
   - `contentLength` **optional** -- FTP protocol doesn't guarantee file size before transfer. When omitted, presigned URL is generated without Content-Length signing condition. The upload consumer validates size after the fact via HEAD request.
4. Validate: event not expired, credit balance > 0 (fail-fast)
5. Generate upload intent + presigned R2 PUT URL (reuse `generatePresignedPutUrl` from `apps/api/src/lib/r2/presign.ts`)
6. Create `upload_intents` record (same table the existing presigned flow uses)
7. Return:

```json
{
  "data": {
    "upload_id": "<uuid>",
    "put_url": "<presigned_r2_url>",
    "object_key": "<r2_key>",
    "expires_at": "<iso_datetime>",
    "required_headers": {
      "Content-Type": "<mime>"
    }
  }
}
```

Key point: the `upload_intents` record is identical to what the dashboard presigned flow creates. The `upload-consumer` queue processes it the same way -- no consumer changes needed. The only difference is the `upload_intents.source` could optionally be tagged as `'ftp'` for analytics (new nullable column).

### 1.5.1 Content-Type Detection (Decision: infer from filename, no buffering)

The FTP server cannot know the true content type or file size before data starts streaming. Options considered:

| Option              | Approach                                                        | Verdict                                             |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| Infer from filename | `.jpg` → `image/jpeg` at STOR time                              | **Chosen.** Zero buffering, instant presign.        |
| Buffer to disk      | Stream to temp file, read magic bytes, then presign + re-stream | Rejected. Doubles I/O, breaks zero-disk design.     |
| Buffer to memory    | Same but in RAM. 10 concurrent 15MB JPEGs = 150MB               | Rejected. Memory pressure, breaks streaming design. |

Why filename inference is safe:

- Professional cameras use strict naming (`.JPG`, `.CR2`, `.NEF`, `.ARW`). They don't lie about extensions.
- The upload consumer validates magic bytes _after_ the file lands in R2, so a wrong extension doesn't create a security hole -- it just fails at processing time with a clear error.
- If the extension is unrecognized, Go side sends `application/octet-stream`. Consumer handles it.

### 1.6 FTP JWT Middleware

```typescript
// apps/api/src/middleware/ftp-auth.ts
export function requireFtpAuth(): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Missing token' } }, 401);
    }
    const token = authHeader.slice(7);
    try {
      const payload = await verifyFtpToken(c.env.FTP_JWT_SECRET, token);
      c.set('ftpAuth', payload);
    } catch {
      return c.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } },
        401,
      );
    }
    return next();
  };
}
```

### 1.7 Route Mounting in `index.ts`

The FTP routes must be mounted **before** the Clerk middleware since they use their own JWT auth:

```typescript
const app = new Hono<Env>()
  .use(/* db injection */)
  .route('/local/r2', r2Router)
  .route('/webhooks', webhookRouter)
  .use('/*' /* cors */)
  .route('/participant', participantRouter)
  .route('/admin', adminRouter)
  .route('/api/ftp', ftpRouter) // <-- NEW: before Clerk
  .use('/*', createClerkAuth());
// ... rest unchanged
```

### 1.8 Wrangler Config

Add `FTP_JWT_SECRET` as a secret (not in wrangler.jsonc -- set via `wrangler secret put`).

Add to `Bindings` type in `apps/api/src/types.ts`:

```typescript
FTP_JWT_SECRET: string;
```

### 1.9 Dashboard: FTP Credentials Management

Out of scope for this plan (separate slice). But the API needs these endpoints for the dashboard to call later:

- `POST /events/:eventId/ftp-credentials` -- generate credentials (Clerk auth, photographer owns event)
- `GET /events/:eventId/ftp-credentials` -- get username + masked password status (never return plaintext after creation)
- `DELETE /events/:eventId/ftp-credentials` -- revoke

These use Clerk auth (photographer middleware), not FTP JWT. They're standard CRUD on `ftp_credentials` table.

### 1.10 Implementation Order

```
1. Add `jose` dependency to apps/api
2. Create ftp_credentials schema + migration
3. Implement password hashing utility (lib/ftp/password.ts)
4. Implement JWT sign/verify (lib/ftp/jwt.ts)
5. Implement FTP auth middleware (middleware/ftp-auth.ts)
6. Implement POST /api/ftp/auth route
7. Implement POST /api/ftp/presign route
8. Mount routes in index.ts (before Clerk)
9. Add FTP_JWT_SECRET to wrangler secrets (dev/staging/production)
10. Implement credential CRUD routes (POST/GET/DELETE /events/:id/ftp-credentials)
11. Write tests for auth + presign + JWT
```

---

## Phase 2: FTP Server Implementation (Go changes)

### 2.1 API Client Changes

The Go API client (`internal/apiclient/client.go`) currently has two methods:

- `Authenticate()` -- calls `POST /api/ftp/auth` (no change needed, API matches expected contract)
- `UploadFormData()` -- calls `POST /api/ftp/upload` (must be replaced)

**New method: `Presign()`**

```go
// PresignRequest represents the presign request
type PresignRequest struct {
    Filename      string `json:"filename"`
    ContentType   string `json:"content_type"`
    ContentLength int64  `json:"content_length"`
}

// PresignResponse represents the presign response
type PresignResponse struct {
    Data struct {
        UploadID        string            `json:"upload_id"`
        PutURL          string            `json:"put_url"`
        ObjectKey       string            `json:"object_key"`
        ExpiresAt       string            `json:"expires_at"`
        RequiredHeaders map[string]string `json:"required_headers"`
    } `json:"data"`
}

func (c *Client) Presign(ctx context.Context, token, eventID, filename, contentType string, contentLength int64) (*PresignResponse, *http.Response, error)
```

Implementation: standard JSON POST to `POST /api/ftp/presign` with Bearer token. Lightweight call, short timeout (10s).

**New method: `UploadToPresignedURL()`**

```go
func (c *Client) UploadToPresignedURL(ctx context.Context, putURL string, headers map[string]string, reader io.Reader) (*http.Response, error)
```

Implementation: HTTP PUT to the presigned R2 URL with the required headers. The `reader` is the same `io.PipeReader` from the FTP data channel. Long timeout (30min, same as before).

**Keep `UploadFormData()` or remove?** Remove. The direct upload path is being replaced entirely. The `APIClient` interface changes:

```go
type APIClient interface {
    Authenticate(ctx context.Context, req AuthRequest) (*AuthResponse, error)
    Presign(ctx context.Context, token, eventID, filename, contentType string, contentLength int64) (*PresignResponse, *http.Response, error)
    UploadToPresignedURL(ctx context.Context, putURL string, headers map[string]string, reader io.Reader) (*http.Response, error)
}
```

### 2.2 UploadTransfer Changes

Current flow (`internal/transfer/upload_transfer.go`):

1. `Write()` -- camera data → `pipeWriter`
2. Background goroutine: `pipeReader` → `UploadFormData()` → API
3. `Close()` -- wait for API response on `uploadDone` channel

New flow:

1. On `OpenFile()` (before any `Write()`): call `Presign()` to get the R2 PUT URL
2. `Write()` -- camera data → `pipeWriter` (unchanged)
3. Background goroutine: `pipeReader` → `UploadToPresignedURL()` → R2 directly
4. `Close()` -- wait for R2 PUT response on `uploadDone` channel

Key change: the presign call happens synchronously when the FTP STOR command is received (before data transfer begins). This is the right place because:

- We know the filename at STOR time
- The presign is fast (~50ms network round trip)
- If presign fails (no credits, expired event), we can return an FTP error before the camera sends any data

Content-Type detection: cameras typically send `.jpg` files over FTP. We detect MIME from the filename extension at STOR time. The API validates magic bytes in the consumer anyway.

Content-Length: FTP clients may or may not send `SIZE` before `STOR`. If unknown, we can use a reasonable upper bound (e.g. 50MB) or omit it from the presigned URL (the R2 PUT will succeed regardless; the consumer validates size after upload).

### 2.3 Error Handling Changes

Current error mapping (`upload_transfer.go:153-214`):

| HTTP Status  | Current Action                  |
| ------------ | ------------------------------- |
| 401 from API | `EventAuthExpired` → disconnect |
| 429 from API | `EventRateLimited` → disconnect |
| Other        | `EventUploadFailed` → log only  |

New error mapping -- two-step flow with distinct handling per stage:

#### Presign errors (from `POST /api/ftp/presign`)

These happen _before_ any file data flows. The camera hasn't sent anything yet, so we can fail fast and cleanly.

| HTTP Status | FTP Response                 | Connection                            | Rationale                                            |
| ----------- | ---------------------------- | ------------------------------------- | ---------------------------------------------------- |
| 401         | N/A                          | **Disconnect** via `EventAuthExpired` | JWT expired. Must re-auth to get fresh token.        |
| 402         | `550 Insufficient credits`   | **Keep open**                         | Photographer can top up credits and retry STOR.      |
| 404         | `550 Event not found`        | Keep open                             | Shouldn't happen if JWT is valid.                    |
| 410         | `550 Event expired`          | Keep open                             | No more uploads possible, but don't force reconnect. |
| 429         | `451 Server busy, try again` | **Keep open** (with retry)            | See below.                                           |
| 5xx         | `451 Temporary failure`      | Keep open                             | Camera/client will auto-retry STOR.                  |

**429 handling change: retry with backoff instead of disconnect.**

The old design disconnected on 429 because the FormData upload was heavyweight -- a 429 mid-stream meant the entire file transfer was wasted. With presigned URLs, the 429 only hits the lightweight presign call (no file data involved). Retrying is cheap.

```
On 429 from presign:
  1. Read Retry-After header if present (seconds to wait)
  2. Otherwise exponential backoff: 1s → 2s → 4s (3 attempts max)
  3. If all retries exhausted → return FTP 451 "Server busy, try again"
  4. Connection stays open -- next STOR command can try again
```

This is a deliberate change from `manager.go:154-158` (which disconnects on 429). The presign call is idempotent and retriable, so aggressive disconnection is disproportionate.

#### R2 PUT errors (direct upload to R2)

These happen _during_ file data transfer. The camera is actively sending bytes.

| Scenario                        | FTP Response            | Connection | Rationale                                                                   |
| ------------------------------- | ----------------------- | ---------- | --------------------------------------------------------------------------- |
| 200 OK                          | `226 Transfer complete` | Keep open  | Success.                                                                    |
| Network error mid-stream        | `426 Transfer aborted`  | Keep open  | Camera can retry STOR (gets new presign).                                   |
| 403 Forbidden (presign expired) | `451 Temporary failure` | Keep open  | Shouldn't happen -- presign TTL 5min >> transfer time. Camera retries STOR. |
| 500/503 (R2 internal)           | `451 Temporary failure` | Keep open  | Camera retries STOR.                                                        |

**R2 does not return 429.** Object storage PUTs have no rate limits in any practical sense. This is the core reason Option B eliminates backpressure -- the data path (camera → FTP server → R2) has no throttling point.

#### Async processing errors (after FTP transfer completes)

These happen in the `upload-consumer` queue _after_ the camera got `226 Transfer complete`. The FTP server is not involved.

| Error                               | Handled By                                         | Photographer Sees       |
| ----------------------------------- | -------------------------------------------------- | ----------------------- |
| Invalid magic bytes                 | Consumer marks `upload_intents.status = 'failed'`  | Dashboard upload status |
| Normalization failure               | Consumer retries, then marks failed                | Dashboard upload status |
| Insufficient credits (at deduction) | Consumer marks failed                              | Dashboard upload status |
| Face detection failure              | Photo marked `status = 'failed', retryable = true` | Dashboard photo status  |

The photographer monitors upload progress in the dashboard via status polling. The FTP server and camera are completely decoupled from processing errors.

#### Error flow diagram

```
STOR DSC_0001.JPG
  │
  ├─ Presign ─── 200 ──► Stream to R2 ─── 200 ──► FTP 226 (done, async processing starts)
  │                           │
  │                           ├── network error ──► FTP 426 (camera retries STOR)
  │                           ├── 403 ──► FTP 451 (camera retries STOR, gets new presign)
  │                           └── 5xx ──► FTP 451 (camera retries STOR)
  │
  ├── 401 ──► disconnect (camera reconnects, re-auths, gets fresh JWT)
  ├── 402 ──► FTP 550 "No credits" (connection stays open)
  ├── 410 ──► FTP 550 "Event expired" (connection stays open)
  ├── 429 ──► retry 1s/2s/4s ──► still 429 ──► FTP 451 (connection stays open, camera retries STOR)
  └── 5xx ──► FTP 451 (connection stays open, camera retries STOR)
```

### 2.4 ClientDriver Changes

`internal/client/client_driver.go` -- `OpenFile()` currently creates an `UploadTransfer` and returns it. The change is:

- `OpenFile()` now also calls `Presign()` before creating the transfer
- Pass the presigned URL + headers into `UploadTransfer`
- If presign fails, return an FTP error immediately (no transfer created)

### 2.5 Implementation Order

```
1. Add PresignRequest/PresignResponse types to apiclient
2. Implement Presign() method
3. Implement UploadToPresignedURL() method
4. Update APIClient interface (remove UploadFormData, add new methods)
5. Modify UploadTransfer to accept presigned URL + use UploadToPresignedURL
6. Modify ClientDriver.OpenFile() to call Presign before creating transfer
7. Update error handling for two-step flow
8. Remove UploadFormData() method
9. Update tests
10. E2E test: camera → FTP → presign → R2 → consumer → photo indexed
```

---

## Decisions Made

1. **Content-Type detection:** Infer from filename extension at STOR time. No buffering. See section 1.5.1.

2. **Content-Length at presign time:** Made optional in the FTP presign endpoint. FTP protocol doesn't guarantee file size before transfer. The upload consumer validates size after the fact via HEAD request. See section 1.5.

3. **MIME type detection:** Go side maps extensions to MIME types (`.jpg`/`.jpeg` → `image/jpeg`, `.png` → `image/png`, etc.). Unknown extensions use `application/octet-stream`. Consumer validates magic bytes regardless.

4. **429 handling:** Retry with exponential backoff (1s/2s/4s, 3 attempts) instead of disconnect. See section 2.3.

5. **Async error visibility:** Processing errors after FTP 226 are invisible to the FTP server/camera. Photographer monitors via dashboard upload status polling. See section 2.3.

## Open Questions / Future Work

1. **Dashboard FTP credentials UI.** Separate implementation slice. The API endpoints (1.9) provide the backend; dashboard just needs a "Generate FTP Access" button per event.

2. **RAW file support.** Current pipeline only accepts JPEG/PNG/HEIC/HEIF/WebP. RAW files (CR2, NEF, ARW) would fail at magic byte validation. Not in scope -- cameras typically send JPEG over FTP. Can be added later by extending the consumer's validation + normalization.

3. **Rate limiting on `/api/ftp/auth`.** Should add a CF rate limiter binding (e.g., 10 req/60s per IP) to prevent brute-force on FTP credentials. Low priority -- credentials are auto-generated high-entropy strings.
