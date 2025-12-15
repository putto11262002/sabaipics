# FTP Server API Integration Plan

**Status:** Planning
**Date:** 2025-12-08
**Purpose:** Refactor FTP server from direct DB/R2 access to API-based architecture

---

## Current Architecture (As Implemented)

```
┌─────────────┐
│ Pro Camera  │
└──────┬──────┘
       │ FTP STOR IMG_1234.jpg
       ▼
┌────────────────────────────────────────────────┐
│         Custom FTP Server (Go)                 │
│                                                │
│  AuthUser() → Direct DB Query                 │──► PostgreSQL
│               SELECT * FROM events             │
│               WHERE ftp_username = $1          │
│               Verify bcrypt hash               │
│                                                │
│  OpenFile() → io.Pipe → Direct R2 Upload     │──► R2 Storage
│               Workers API: R2.put()            │    (via Workers API)
│               Deduct credit from DB            │
└────────────────────────────────────────────────┘
```

**Problems:**
- ❌ FTP server has direct DB access (coupling)
- ❌ FTP server has direct R2 access (bypasses API logic)
- ❌ Credit deduction happens in FTP server (business logic duplication)
- ❌ No centralized auth/upload flow (two code paths: API + FTP)
- ❌ Cannot leverage API middleware (rate limiting, validation, logging)

---

## New Architecture (API-Based)

```
┌─────────────┐
│ Pro Camera  │
└──────┬──────┘
       │ FTP STOR IMG_1234.jpg
       ▼
┌────────────────────────────────────────────────┐
│         Custom FTP Server (Go/VPS)             │
│         Role: Thin Proxy Only                  │
│                                                │
│  AuthUser()                                    │
│    1. POST /api/ftp/auth                      │──┐
│       Body: {username, password}               │  │
│       Response: {token, event_id, expires_at} │  │
│    2. Store JWT + expiration in ClientDriver  │  │
│    3. Set disconnect timer OR wait for 401    │  │
│                                                │  │
│  OpenFile()                                    │  │
│    1. Create io.Pipe for streaming             │  │
│    2. Build FormData with fields:              │  │ HTTP
│       - file: <binary stream>                  │  │ Requests
│       - eventId: <from JWT claims>             │  │
│    3. POST /api/ftp/upload                    │  │
│       Header: Authorization: Bearer <jwt>      │  │
│       Body: multipart/form-data stream         │  │
│    4. Handle response (200 or 401/422)        │  │
│    5. If 401: disconnect client                │  │
└────────────────────────────────────────────────┘  │
                                                     │
                  ┌──────────────────────────────────┘
                  ▼
┌────────────────────────────────────────────────┐
│         Cloudflare Workers API (Hono)          │
│                                                │
│  POST /api/ftp/auth                           │
│    1. Query events table by ftp_username      │──► PostgreSQL
│       (username is random string, not format) │
│    2. Verify bcrypt password                   │
│    3. Check: published, upload window open     │
│    4. Generate JWT (event_id, expires_at)     │
│    5. Return JWT token + metadata              │
│                                                │
│  POST /api/ftp/upload                         │
│    1. Parse FormData (file, eventId)          │
│    2. Verify JWT token → extract claims       │
│    3. Validate image (dimensions, format, etc)│
│    4. Check credit balance                     │──► PostgreSQL
│    5. Deduct 1 credit (optimistic)             │
│    6. Stream to R2 with validation             │──► R2 Storage
│    7. Create photo record in DB                │──► PostgreSQL
│    8. Publish to queue for processing          │──► Queue
│    9. Return photo record                      │
└────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Single source of truth for auth/upload logic
- ✅ FTP server is thin proxy (no business logic, no direct R2 access)
- ✅ Image validation centralized in API (reason for not using presigned URLs)
- ✅ Credit deduction centralized in API
- ✅ Leverage API middleware (rate limiting, validation, tracing)
- ✅ Upload flow uses same validation as web upload
- ✅ Easier to add features (watermarking, dimension checks, format conversion)

---

## Required API Contracts

### 1. FTP Authentication Endpoint

**Endpoint:** `POST /api/ftp/auth`

**Purpose:** Authenticate FTP credentials and issue JWT token

**Request:**
```json
{
  "username": "ftp_a7x9k2p5m8q3",
  "password": "32CharAlphanumericToken..."
}
```

**Response (Success):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "event_id": "clx12345",
  "event_name": "Wedding Photography 2025",
  "upload_window_end": "2025-12-15T23:59:59Z",
  "credits_remaining": 450
}
```

**Response (Failure):**
```json
{
  "error": {
    "code": "FTP_AUTH_FAILED",
    "message": "Invalid credentials or upload window closed"
  }
}
```

**HTTP Status Codes:**
- `200 OK` - Authentication successful
- `401 Unauthorized` - Invalid credentials
- `422 Unprocessable Entity` - Event not published, upload window closed, or event deleted
- `429 Too Many Requests` - Rate limit exceeded (10 attempts per IP per minute)

**JWT Claims:**
```typescript
{
  "event_id": "clx12345",
  "photographer_id": "user_abc123",
  "exp": 1734307200, // Token expires when upload window ends
  "iat": 1734220800,
  "iss": "sabaipics-api"
}
```

**Validation Rules:**
1. Username must be a random string stored in `events.ftp_username` (NOT predictable format)
2. Password must be verified against `events.ftp_password_hash` (bcrypt)
3. Event must have `status = 'published'`
4. Current time must be within `upload_start_datetime` and `upload_end_datetime`
5. Event must not be soft-deleted (`deleted_at IS NULL`)
6. JWT token expiration matches `upload_end_datetime`

**Rate Limiting:**
- 10 requests per IP per minute (prevent brute force)
- 3 failed attempts → 5 minute cooldown per IP

---

### 2. FTP Upload Endpoint

**Endpoint:** `POST /api/ftp/upload`

**Purpose:** Upload photo file via FormData with validation and storage

**Authentication:** `Authorization: Bearer <jwt_token>`

**Request:**
```
POST /api/ftp/upload
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

------WebKitFormBoundary...
Content-Disposition: form-data; name="eventId"

clx12345
------WebKitFormBoundary...
Content-Disposition: form-data; name="file"; filename="IMG_1234.JPG"
Content-Type: image/jpeg

<binary file data>
------WebKitFormBoundary...--
```

**FormData Fields:**
- `file` (File, required): The image file binary data (filename encoded in Content-Disposition header)
- `eventId` (string, required): Event ID for upload context (must match JWT claim)

**Response (Success):**
```json
{
  "data": {
    "id": "photo_xyz789",
    "status": "pending",
    "filename": "IMG_1234.JPG",
    "size_bytes": 2458624,
    "upload_completed_at": "2025-12-08T10:30:45Z",
    "r2_key": "events/clx12345/photos/photo_xyz789.jpg"
  }
}
```

**Response (Failure - Insufficient Credits):**
```json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Please purchase credits to continue",
    "credits_required": 1,
    "credits_available": 0
  }
}
```

**Response (Failure - Validation Error):**
```json
{
  "error": {
    "code": "INVALID_IMAGE",
    "message": "Image validation failed: dimensions too small",
    "details": {
      "min_width": 1920,
      "min_height": 1080,
      "actual_width": 800,
      "actual_height": 600
    }
  }
}
```

**HTTP Status Codes:**
- `200 OK` - Upload successful, photo record created
- `400 Bad Request` - Missing fields, invalid eventId, or malformed FormData
- `401 Unauthorized` - Invalid or expired JWT token
- `413 Payload Too Large` - File exceeds Worker request limit (100MB Free/Pro, 200MB Business, 500MB Enterprise)
- `422 Unprocessable Entity` - Image validation failed, insufficient credits, or upload window closed
- `429 Too Many Requests` - Rate limit exceeded (100 uploads per event per minute)
- `500 Internal Server Error` - Failed to upload to R2, update DB, or publish to queue

**Validation Rules:**
1. JWT token must be valid and not expired
2. `eventId` from FormData must match `event_id` from JWT claims
3. Event must still have `status = 'published'`
4. Current time must still be within upload window
5. Photographer must have at least 1 credit available
6. File must be valid image format (JPEG, PNG, HEIC, HEIF)
7. Image dimensions must meet minimum requirements (if applicable)
8. File size enforced by Cloudflare edge (before reaching Worker)

**Flow:**
1. Parse FormData (extract `file` and `eventId`)
2. Verify JWT token → extract `event_id` and `photographer_id`
3. Verify `eventId` matches JWT claim
4. Validate image (format, dimensions, integrity)
5. Check credit balance (1 credit required)
6. Generate unique photo ID and R2 key: `events/{event_id}/photos/{photo_id}.{ext}`
7. Stream file to R2 (`R2.put(key, request.body)`)
8. Deduct 1 credit from photographer (optimistic)
9. Create photo record in DB with `status = 'pending'`
10. Publish to queue for face detection processing
11. Return photo record

**Credit Deduction:**
- Credits deducted AFTER successful R2 upload AND validation
- If validation fails → no credit deducted, return 422
- If R2 upload fails → no credit deducted, return 500
- If credit deduction fails (race condition) → delete R2 object, return 422

**Why Not Presigned URLs:**
- Image validation must happen in API (dimensions, format, integrity)
- Ensures consistent validation with web upload flow
- Single upload path through API (not split between FTP → R2 and API verification)

---

## API Contract Checklist

### Can FTP Team Implement Independently?

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Auth endpoint spec** | ✅ Complete | Request/response schemas defined |
| **Auth error codes** | ✅ Complete | All failure cases documented |
| **JWT format** | ✅ Complete | Claims structure specified |
| **JWT expiration** | ✅ Complete | Expires with upload window |
| **Upload endpoint spec** | ✅ Complete | FormData approach defined |
| **Upload error codes** | ✅ Complete | All failure cases documented |
| **FormData fields** | ✅ Complete | file + eventId (filename in file object) |
| **Rate limits** | ✅ Complete | Per-IP and per-event limits |
| **File size limits** | ✅ Complete | Enforced by Cloudflare edge |
| **Image validation** | ✅ Complete | Format, dimensions, integrity checks |
| **Credit deduction logic** | ✅ Complete | Optimistic after validation |

**Verdict:** ✅ **YES - FTP team can implement independently**

The contracts are complete enough to mock the API responses and build the FTP→API integration without blocking on API implementation.

---

## Implementation Plan for FTP Server

### Phase 1: Create API Client Package

**File:** `internal/apiclient/client.go`

```go
package apiclient

import (
    "context"
    "io"
    "mime/multipart"
    "net/http"
)

type Client struct {
    baseURL    string
    httpClient *http.Client
}

type AuthRequest struct {
    Username string `json:"username"`
    Password string `json:"password"`
}

type AuthResponse struct {
    Token            string `json:"token"`
    EventID          string `json:"event_id"`
    EventName        string `json:"event_name"`
    UploadWindowEnd  string `json:"upload_window_end"`
    CreditsRemaining int    `json:"credits_remaining"`
}

type UploadResponse struct {
    Data struct {
        ID                string `json:"id"`
        Status            string `json:"status"`
        Filename          string `json:"filename"`
        SizeBytes         int64  `json:"size_bytes"`
        UploadCompletedAt string `json:"upload_completed_at"`
        R2Key             string `json:"r2_key"`
    } `json:"data"`
}

type APIError struct {
    Error struct {
        Code    string `json:"code"`
        Message string `json:"message"`
    } `json:"error"`
}

func NewClient(baseURL string) *Client {
    return &Client{
        baseURL: baseURL,
        httpClient: &http.Client{
            Timeout: 30 * time.Minute, // Long timeout for large uploads
        },
    }
}

func (c *Client) Authenticate(ctx context.Context, req AuthRequest) (*AuthResponse, error) {
    // POST /api/ftp/auth
    // Return AuthResponse or APIError
}

func (c *Client) UploadFormData(ctx context.Context, token, eventID, filename string, reader io.Reader) (*UploadResponse, *http.Response, error) {
    // Build FormData with fields: eventId (string), file (binary)
    // POST /api/ftp/upload with Content-Type: multipart/form-data
    // Stream from reader to API using io.Pipe + multipart.Writer
    // Return UploadResponse, http.Response (for status code checking), or error
}
```

### Phase 2: Update MainDriver

**File:** `internal/driver/main_driver.go`

```go
// MainDriver.AuthUser() - Call API instead of DB
func (d *MainDriver) AuthUser(cc ftpserver.ClientContext, user, pass string) (ftpserver.ClientDriver, error) {
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    // Call API for authentication
    authResp, err := d.apiClient.Authenticate(ctx, apiclient.AuthRequest{
        Username: user,
        Password: pass,
    })
    if err != nil {
        d.log().Error().Emitf("FTP auth failed for user=%s: %v", user, err)
        return nil, errors.New("invalid credentials")  // FTP 530
    }

    d.log().Info().Emitf("FTP auth successful: user=%s, event=%s", user, authResp.EventID)

    // Create ClientDriver with JWT token and event context
    clientDriver := client.NewClientDriver(
        authResp.EventID,
        authResp.Token,
        cc.RemoteAddr().String(),
        d.apiClient,
        d.config,
    )

    return clientDriver, nil
}
```

### Phase 3: Update ClientDriver

**File:** `internal/client/client_driver.go`

```go
type ClientDriver struct {
    eventID    string
    jwtToken   string
    clientIP   string
    apiClient  *apiclient.Client
    config     *config.Config
}

func NewClientDriver(eventID, jwtToken, clientIP string, apiClient *apiclient.Client, cfg *config.Config) *ClientDriver {
    return &ClientDriver{
        eventID:   eventID,
        jwtToken:  jwtToken,
        clientIP:  clientIP,
        apiClient: apiClient,
        config:    cfg,
    }
}
```

### Phase 4: Update UploadTransfer

**File:** `internal/transfer/upload_transfer.go`

```go
// streamToAPI() - Replace streamToR2()
func (t *UploadTransfer) streamToAPI() {
    defer close(t.uploadDone)

    ctx := t.uploadTransaction.Context()

    // Upload via FormData to API
    uploadResp, httpResp, err := t.apiClient.UploadFormData(
        ctx,
        t.jwtToken,
        t.eventID,
        t.filename,
        t.pipeReader, // Stream directly from FTP client pipe
    )

    if err != nil {
        // Check for 401 (token expired)
        if httpResp != nil && httpResp.StatusCode == 401 {
            t.log().Error().Emitf("Auth expired for file=%s: %v", t.filename, err)
            t.uploadDone <- ErrAuthExpired // Triggers client disconnection
            return
        }

        t.log().Error().Emitf("API upload failed for file=%s: %v", t.filename, err)
        t.uploadDone <- err
        return
    }

    t.log().Info().Emitf("Upload successful: file=%s, photo_id=%s, size=%d bytes",
        t.filename, uploadResp.Data.ID, uploadResp.Data.SizeBytes)

    t.uploadDone <- nil
}
```

### Phase 5: Configuration

**File:** `internal/config/config.go`

Add new environment variable:

```go
type Config struct {
    // ... existing fields ...

    // API Configuration
    APIURL string // e.g., "https://api.sabaipics.com"
}
```

**File:** `.env.example`

```bash
# API Configuration
API_URL=https://api.sabaipics.com
```

### Phase 6: Testing with Mock API

Create mock API server for local testing:

**File:** `scripts/mock-api-server.go`

```go
// Simple HTTP server that implements /api/ftp/auth and /api/ftp/upload
// Returns success responses for testing
// Run with: go run scripts/mock-api-server.go
```

---

## Migration Plan

### Step 1: Implement API Client (No Breaking Changes)

- Create `internal/apiclient` package
- Add configuration for API URL
- Write unit tests with mock HTTP responses
- **FTP server still uses direct DB/R2** (no change yet)

### Step 2: Add Feature Flag

```go
// config.go
UseAPIIntegration bool // Default: false (use direct DB/R2)
```

### Step 3: Implement API Code Path (Parallel)

- Update MainDriver with API-based auth (behind flag)
- Update UploadTransfer with API-based upload (behind flag)
- Test with mock API server
- **FTP server has both code paths**

### Step 4: Deploy & Test

- Deploy FTP server with `USE_API_INTEGRATION=false` (current behavior)
- Deploy API with new `/api/ftp/*` endpoints
- Enable feature flag: `USE_API_INTEGRATION=true`
- Test end-to-end with real camera
- Monitor Sentry for errors

### Step 5: Remove Legacy Code

- Remove direct DB access code
- Remove direct R2 upload code
- Remove feature flag
- **FTP server only uses API**

---

## Architecture Decisions (Resolved)

### Decision 1: Upload Implementation - FORMDATA THROUGH API ✅

**Research Summary:**
- Workers CAN stream to R2 without buffering (`R2.put(key, request.body)`)
- Request body size limits enforced by Cloudflare edge (100MB Free/Pro, 200MB Business, 500MB Enterprise)
- Streaming does NOT bypass these limits - enforced before reaching Worker
- Memory limit (128MB) is NOT the issue - streaming uses minimal memory

**DECISION: Direct FormData upload through API (NOT presigned URLs)**

**Why:**
1. ✅ Image validation must happen in API (dimensions, format, integrity)
2. ✅ Consistent with web upload flow (same validation path)
3. ✅ VPS role is simple proxy (FTP → HTTP only, no direct R2 access)
4. ✅ Single source of truth for upload logic
5. ✅ Easier to add future validation (watermarking, format conversion)

**Architecture:**
```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│ FTP Server  │────1───>│ Hono Worker  │────2───>│ R2 Storage  │
│   (VPS)     │         │   (API)      │         │             │
│ Thin Proxy  │<────3───│  Validates   │         │             │
│             │         │   Images     │         │             │
└─────────────┘         └──────────────┘         └─────────────┘

1. POST /api/ftp/upload (FormData: file + eventId)
2. Worker validates image → streams to R2
3. Response: photo record or validation error
```

**Implementation:**
- FTP server builds FormData with fields: `file` (binary), `eventId` (string)
- API parses FormData, validates image, streams to R2
- Filename encoded in file object (Content-Disposition header)
- No presigned URLs, no CORS configuration needed

**Trade-offs:**
- ❌ File size limited by Worker request limits (100-500MB depending on plan)
- ❌ Upload data flows through Worker (bandwidth costs)
- ✅ Image validation in API (required for quality control)
- ✅ Simpler architecture (2 endpoints, not 3)

### Decision 2: JWT Lifecycle Management - REACTIVE (401 DETECTION) ✅

**User Question:** "Set timer for disconnect or wait til 401?"

**ANSWER: Wait for 401 (Reactive Approach) ✅**

**Why:**
1. ✅ **Simpler implementation**: No timer management, no cleanup logic
2. ✅ **Scales better**: No goroutine overhead per connection (100 connections = 100 timers avoided)
3. ✅ **More robust**: Handles ALL auth failure scenarios (token expired, revoked, API changed expiration, clock skew)
4. ✅ **Stateless**: Works across FTP server restarts (no timers to restore)
5. ✅ **Natural error flow**: Upload fails with 401 → disconnect client

**Implementation:**
```go
// In UploadTransfer.streamToAPI()
uploadResp, httpResp, err := t.apiClient.UploadFormData(ctx, jwtToken, eventID, filename, reader)
if err != nil {
    if httpResp != nil && httpResp.StatusCode == 401 {
        // Token expired - disconnect client gracefully
        t.log().Error().Emitf("Auth expired, disconnecting client")
        return ErrAuthExpired // MainDriver disconnects client
    }
    return err
}
```

**Alternative (Proactive Timer) - NOT CHOSEN:**
```go
// Store expiration time in ClientDriver
expiresAt := parseJWT(token).ExpiresAt
disconnectTimer := time.AfterFunc(time.Until(expiresAt), func() {
    client.Disconnect("Session expired")
})
defer disconnectTimer.Stop()
```

**Why NOT proactive timer:**
- ❌ **Memory overhead**: One goroutine per connected client (100 connections = 100 timer goroutines)
- ❌ **Cleanup complexity**: Must cancel timers on early disconnection, handle server restarts
- ❌ **Edge cases**: Doesn't handle token revocation, clock skew between servers
- ❌ **No UX benefit**: User gets disconnected either way - no difference in experience

**Cost Analysis: "Does keeping time around expensive?"**
- Storing expiration timestamp (int64): **NO - 8 bytes per connection, negligible**
- Running timer goroutine per connection: **YES - goroutine overhead + cleanup logic**
- With 100 concurrent connections: 800 bytes for timestamps vs. 100 timer goroutines

**Conclusion: Reactive 401 detection is simpler, more robust, and more efficient.**

### Decision 3: JWT Secret Sharing - ENVIRONMENT VARIABLE ✅

**DECISION: Shared secret via environment variable (Option A)**

**Implementation:**
```bash
# In both API (Workers) and FTP server (VPS)
JWT_SECRET=<256-bit-secret-generated-once>

# Stored in:
# - GitHub Secrets for CI/CD
# - Cloudflare Workers Secrets (wrangler secret put JWT_SECRET)
# - VPS environment file (.env)
```

**Why:**
- ✅ Simple to implement (standard JWT library support)
- ✅ No additional API calls needed (FTP validates locally)
- ✅ Fast validation (no network roundtrip)
- ✅ Secure if secret properly managed

**Secret Generation:**
```bash
# Generate 256-bit secret (one time)
openssl rand -base64 32
```

**JWT Validation in FTP Server:**
```go
token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
    if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
        return nil, fmt.Errorf("unexpected signing method")
    }
    return []byte(os.Getenv("JWT_SECRET")), nil
})
```

### Decision 4: Rate Limiting - TRUST API ✅

**DECISION: FTP server trusts API rate limiting (Option A)**

**Implementation:**
- API enforces all upload rate limits (100/min per event)
- API returns `429 Too Many Requests` when limit exceeded
- FTP server receives 429, translates to FTP status code, logs, and returns to client
- FTP server maintains independent connection limits (100 concurrent per event, 50 per IP)

**Why:**
- ✅ Single source of truth for business rules
- ✅ No state synchronization needed
- ✅ API controls all upload costs (credits, bandwidth)
- ✅ FTP server stays stateless (can scale horizontally)

**FTP-Specific Limits (Independent):**
```go
// In MainDriver.ClientConnected()
type ConnectionLimits struct {
    MaxPerEvent int // 100
    MaxPerIP    int // 50
}

// Track in memory (per FTP server instance)
// If limit exceeded → FTP 421 "Too many connections"
```

**API Upload Limits (Authoritative):**
- 100 uploads per event per minute
- Enforced by API rate limiter
- FTP server propagates 429 to client

---

## Testing Strategy

### Unit Tests

- API client request/response parsing
- JWT token validation
- Error handling and retries

### Integration Tests

1. **Mock API Server**
   - Start mock HTTP server
   - FTP server connects to mock
   - Upload file via FTP client
   - Verify mock received correct requests

2. **Real API (Staging)**
   - Deploy API to staging
   - FTP server connects to staging API
   - Upload file via FTP client
   - Verify file appears in staging R2
   - Verify photo record in staging DB

### Load Tests

- 100 concurrent FTP connections
- Each uploads 10 photos (5MB each)
- Measure: API latency, throughput, error rate
- Compare: Direct R2 vs API-based upload performance

---

## Performance Considerations

### Latency Added by API Layer

**Current:** FTP → R2 (single hop)
**New:** FTP → API → R2 (two hops)

**Expected overhead:** +50-100ms per upload
- Network roundtrip: ~30ms (US-West-2 to Cloudflare edge)
- API processing: ~20ms (JWT validation, DB query, queue publish)
- Acceptable for professional photographer workflow

### Streaming Performance

**Critical:** API must not buffer entire file
- Workers should use `request.body.pipeTo(R2.put())`
- If buffering required → uploads >10MB will fail (Workers memory limit)
- Alternative: FTP server gets presigned R2 URL from API, uploads directly

---

## Documentation Updates Required

1. **`docs/tech/05_ftp_upload.md`**
   - Update architecture diagram (FTP → API → R2)
   - Update authentication section (API-based, JWT)
   - Update upload flow (API endpoint, not direct R2)

2. **`docs/tech/03_api_design.md`**
   - Add `/api/ftp/auth` endpoint
   - Add `/api/ftp/upload` endpoint
   - Update endpoint summary table

3. **`apps/ftp-server/README.md`**
   - Update configuration (add API_URL)
   - Update architecture diagram
   - Update deployment instructions

4. **`log/005-ftp-server-bootstrap.md`**
   - Add Phase 14: API Integration Refactor
   - Document migration from direct DB/R2 to API-based

---

## Summary

### Current State
- ✅ FTP server uses direct DB access for auth
- ✅ FTP server uses direct R2 upload
- ❌ Business logic duplicated (FTP + API)
- ❌ No image validation in upload pipeline

### Target State
- ✅ FTP server uses API for auth (JWT-based)
- ✅ FTP server uses API for FormData upload (image validation in API)
- ✅ Single source of truth for business logic
- ✅ VPS acts as thin proxy only (no direct R2 access)
- ✅ Image validation centralized in API
- ✅ FTP username is random string (not predictable format)
- ✅ JWT lifecycle managed reactively (disconnect on 401)

### Implementation Readiness
- ✅ API contracts defined (auth + upload endpoints)
- ✅ Error codes specified
- ✅ FormData structure documented (file + eventId fields)
- ✅ JWT format documented (shared secret via ENV)
- ✅ Rate limits defined (trust API)
- ✅ Upload approach decided (FormData through API with validation)
- ✅ JWT lifecycle decided (reactive 401 detection)
- ✅ FTP team can implement independently (mock API for testing)

### Next Steps
1. API team implements `/api/ftp/auth` and `/api/ftp/upload`
2. API team adds image validation logic (dimensions, format, integrity)
3. FTP team implements `internal/apiclient` package with FormData support
4. Deploy both with feature flag
5. Test end-to-end with real camera
6. Remove legacy direct DB/R2 code

---

## Appendix A: Complete Implementation Examples

### API: FormData Upload (Hono + Workers)

```typescript
import { Hono } from 'hono';
import { jwt } from 'hono/jwt';

const app = new Hono();

// JWT middleware
app.use('/api/ftp/*', jwt({ secret: c.env.JWT_SECRET }));

// Upload endpoint with FormData
app.post('/api/ftp/upload', async (c) => {
  const payload = c.get('jwtPayload');

  // Parse FormData
  const formData = await c.req.formData();
  const eventId = formData.get('eventId') as string;
  const file = formData.get('file') as File;

  // Validate FormData fields
  if (!eventId || !file) {
    return c.json({
      error: { code: 'MISSING_FIELDS', message: 'eventId and file are required' }
    }, 400);
  }

  // Verify eventId matches JWT claim
  if (eventId !== payload.event_id) {
    return c.json({
      error: { code: 'EVENT_MISMATCH', message: 'eventId does not match token' }
    }, 400);
  }

  // Validate image format
  const validTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
  if (!validTypes.includes(file.type)) {
    return c.json({
      error: {
        code: 'INVALID_FORMAT',
        message: `Unsupported format: ${file.type}`,
        details: { allowed_formats: validTypes }
      }
    }, 422);
  }

  // Check credit balance
  const photographer = await db.query.photographers.findFirst({
    where: eq(photographers.id, payload.photographer_id),
  });

  if (photographer.credit_balance < 1) {
    return c.json({
      error: {
        code: 'INSUFFICIENT_CREDITS',
        message: 'Please purchase credits',
        credits_required: 1,
        credits_available: photographer.credit_balance,
      },
    }, 422);
  }

  // Optional: Validate image dimensions (requires reading file)
  // This is a trade-off: validation vs. performance
  // For now, we trust the client and validate async in queue worker

  // Generate unique photo ID and R2 key
  const photoId = `photo_${crypto.randomUUID()}`;
  const ext = file.name.split('.').pop();
  const r2Key = `events/${payload.event_id}/photos/${photoId}.${ext}`;

  // Stream to R2 (no buffering)
  const r2 = c.env.MY_BUCKET;
  await r2.put(r2Key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      event_id: payload.event_id,
      photographer_id: payload.photographer_id,
      uploaded_at: new Date().toISOString(),
      original_filename: file.name,
    },
  });

  // Deduct credit (optimistic)
  const result = await db.update(photographers)
    .set({ credit_balance: sql`credit_balance - 1` })
    .where(
      and(
        eq(photographers.id, payload.photographer_id),
        gte(photographers.credit_balance, 1), // Atomic check
      )
    );

  if (result.rowsAffected === 0) {
    // Insufficient credits (race condition) - clean up
    await r2.delete(r2Key);
    return c.json({
      error: {
        code: 'INSUFFICIENT_CREDITS',
        message: 'Credit deduction failed (race condition)',
      }
    }, 422);
  }

  // Create photo record
  const sizeBytes = file.size;
  await db.insert(photos).values({
    id: photoId,
    event_id: payload.event_id,
    photographer_id: payload.photographer_id,
    filename: file.name,
    r2_key: r2Key,
    status: 'pending',
    size_bytes: sizeBytes,
    upload_completed_at: new Date(),
    created_at: new Date(),
  });

  // Publish to queue for face detection processing
  await c.env.PHOTO_QUEUE.send({
    photo_id: photoId,
    event_id: payload.event_id,
    r2_key: r2Key,
  });

  return c.json({
    data: {
      id: photoId,
      status: 'pending',
      filename: file.name,
      size_bytes: sizeBytes,
      upload_completed_at: new Date().toISOString(),
      r2_key: r2Key,
    },
  });
});
```

**Key Points:**
- `file.stream()` allows streaming to R2 without buffering entire file in memory
- FormData parsing is built into Hono: `c.req.formData()`
- File size limits enforced by Cloudflare edge (100-500MB depending on plan)
- Filename extracted from `file.name` (encoded in Content-Disposition header)
- No CORS configuration needed (not using presigned URLs)

### FTP Server: API Client Implementation

```go
// internal/apiclient/client.go
package apiclient

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "mime/multipart"
    "net/http"
    "time"
)

type Client struct {
    baseURL    string
    httpClient *http.Client
}

func NewClient(baseURL string) *Client {
    return &Client{
        baseURL: baseURL,
        httpClient: &http.Client{
            Timeout: 30 * time.Minute,
        },
    }
}

type AuthRequest struct {
    Username string `json:"username"`
    Password string `json:"password"`
}

type AuthResponse struct {
    Token            string `json:"token"`
    EventID          string `json:"event_id"`
    EventName        string `json:"event_name"`
    UploadWindowEnd  string `json:"upload_window_end"`
    CreditsRemaining int    `json:"credits_remaining"`
}

type UploadResponse struct {
    Data struct {
        ID                string `json:"id"`
        Status            string `json:"status"`
        Filename          string `json:"filename"`
        SizeBytes         int64  `json:"size_bytes"`
        UploadCompletedAt string `json:"upload_completed_at"`
        R2Key             string `json:"r2_key"`
    } `json:"data"`
}

type APIError struct {
    Error struct {
        Code    string `json:"code"`
        Message string `json:"message"`
    } `json:"error"`
}

func (c *Client) Authenticate(ctx context.Context, req AuthRequest) (*AuthResponse, error) {
    body, _ := json.Marshal(req)
    httpReq, _ := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/ftp/auth", bytes.NewReader(body))
    httpReq.Header.Set("Content-Type", "application/json")

    resp, err := c.httpClient.Do(httpReq)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != 200 {
        var apiErr APIError
        json.NewDecoder(resp.Body).Decode(&apiErr)
        return nil, fmt.Errorf("auth failed: %s", apiErr.Error.Message)
    }

    var authResp AuthResponse
    json.NewDecoder(resp.Body).Decode(&authResp)
    return &authResp, nil
}

func (c *Client) UploadFormData(ctx context.Context, token, eventID, filename string, reader io.Reader) (*UploadResponse, *http.Response, error) {
    // Create pipe for multipart writer
    pipeReader, pipeWriter := io.Pipe()

    // Create multipart writer
    writer := multipart.NewWriter(pipeWriter)

    // Write FormData fields in background goroutine
    go func() {
        defer pipeWriter.Close()
        defer writer.Close()

        // Write eventId field
        writer.WriteField("eventId", eventID)

        // Write file field
        part, err := writer.CreateFormFile("file", filename)
        if err != nil {
            pipeWriter.CloseWithError(err)
            return
        }

        // Stream file data
        _, err = io.Copy(part, reader)
        if err != nil {
            pipeWriter.CloseWithError(err)
            return
        }
    }()

    // Create HTTP request with streaming body
    httpReq, _ := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/ftp/upload", pipeReader)
    httpReq.Header.Set("Content-Type", writer.FormDataContentType())
    httpReq.Header.Set("Authorization", "Bearer "+token)

    // Execute request
    resp, err := c.httpClient.Do(httpReq)
    if err != nil {
        return nil, nil, err
    }

    if resp.StatusCode != 200 {
        // Parse error response
        var apiErr APIError
        json.NewDecoder(resp.Body).Decode(&apiErr)
        resp.Body.Close()
        return nil, resp, fmt.Errorf("upload failed (%d): %s", resp.StatusCode, apiErr.Error.Message)
    }

    // Parse success response
    var uploadResp UploadResponse
    json.NewDecoder(resp.Body).Decode(&uploadResp)
    resp.Body.Close()

    return &uploadResp, resp, nil
}
```

**Key Points:**
- Uses `io.Pipe` to stream FormData without buffering entire file
- `multipart.Writer` builds FormData incrementally
- FormData fields written in order: `eventId` (string), then `file` (binary)
- Returns `*http.Response` to allow caller to check status code (e.g., 401 for expired token)

### FTP Server: Upload Flow Integration

```go
// internal/transfer/upload_transfer.go
func (t *UploadTransfer) streamToAPI() {
    defer close(t.uploadDone)

    ctx := t.uploadTransaction.Context()

    // Upload via FormData to API
    uploadResp, httpResp, err := t.apiClient.UploadFormData(
        ctx,
        t.jwtToken,
        t.eventID,
        t.filename,
        t.pipeReader, // Stream directly from FTP client pipe
    )

    if err != nil {
        // Check for 401 (token expired)
        if httpResp != nil && httpResp.StatusCode == 401 {
            t.log().Error().Emitf("Auth expired for file=%s: %v", t.filename, err)
            t.uploadDone <- ErrAuthExpired // Triggers client disconnection
            return
        }

        t.log().Error().Emitf("API upload failed for file=%s: %v", t.filename, err)
        t.uploadDone <- err
        return
    }

    t.log().Info().Emitf("Upload successful: file=%s, photo_id=%s, size=%d bytes",
        t.filename, uploadResp.Data.ID, uploadResp.Data.SizeBytes)

    t.uploadDone <- nil
}
```

**Error Handling:**
- 401 response → return `ErrAuthExpired` → MainDriver disconnects client
- 422 response → validation error → log and return to FTP client (550 error)
- 429 response → rate limit → log and return to FTP client (421 error)
- 500 response → server error → log and return to FTP client (450 error)

---

## Documents to Review

Before implementing, please review:

### Primary Documents
1. **`docs/tech/05_ftp_api_integration_plan.md`** (THIS DOCUMENT)
   - Architecture decisions
   - API contracts
   - Implementation examples

2. **`docs/tech/03_api_design.md`**
   - Overall API design patterns
   - Authentication approach
   - Error handling conventions

3. **`docs/tech/05_ftp_upload.md`**
   - Current FTP server architecture (will be updated)
   - Business rules for upload
   - Upload window validation

### Supporting Documents
4. **`docs/tech/01_data_schema.md`**
   - `photos` table schema
   - Credit ledger schema
   - Event schema

5. **`docs/tech/00_business_rules.md`**
   - Credit deduction rules
   - Upload window validation
   - File size limits

6. **`apps/ftp-server/README.md`**
   - Current implementation details
   - Configuration options
   - Testing procedures

### Implementation Order
1. Review architecture decisions (Section: Architecture Decisions Resolved)
2. Review API contracts (Section: Required API Contracts)
3. Review implementation examples (Section: Appendix A)
4. Implement API endpoints first (can be mocked initially)
5. Implement FTP client changes (use mock API for testing)
6. Deploy with feature flag
7. Test end-to-end
8. Remove legacy code
