# API Design

**Status:** Complete
**Last Updated:** 2025-12-04

---

## Critical Decision 1: Framework & Hosting

**Decision:** Hono on Cloudflare Workers

**Why:**
- Lightweight, fast, serverless-native
- Built-in TypeScript support
- Runs on Cloudflare edge (low latency in Thailand)
- Free tier sufficient for MVP
- RPC-style with type safety

---

## Critical Decision 2: API Style

**Decision:** REST-ish with RPC patterns

**Not pure REST because:**
- Actions like `publish`, `search` don't map cleanly to CRUD
- Hono RPC gives end-to-end type safety
- Simpler mental model for frontend devs

**Pattern:**
```
# Resources (REST-like)
GET    /api/events
POST   /api/events
GET    /api/events/:id
PATCH  /api/events/:id
DELETE /api/events/:id

# Actions (RPC-like)
POST   /api/events/:id/publish
POST   /api/events/:id/access-codes
POST   /api/search
POST   /api/photos/upload
```

---

## Critical Decision 3: URL Structure

```
/api
├── /auth
│   └── /me                    GET     Current user profile
│
├── /photographers
│   └── /:id                   GET, PATCH
│
├── /credits
│   ├── /balance               GET     Current balance
│   ├── /history               GET     Ledger entries
│   └── /purchase              POST    Create Stripe checkout
│
├── /events
│   ├── /                      GET, POST
│   ├── /:id                   GET, PATCH, DELETE
│   ├── /:id/publish           POST    Publish event
│   ├── /:id/photos            GET, POST (upload)
│   ├── /:id/access-codes      GET, POST
│   └── /:id/stats             GET     Dashboard stats
│
├── /photos
│   ├── /:id                   GET, DELETE
│   └── /:id/download          GET     Signed download URL
│
├── /access/:code              GET     Validate access code
│
├── /search                    POST    Face search (selfie → photos)
│
├── /line
│   └── /send                  POST    Send photos to LINE
│
└── /webhooks
    ├── /clerk                 POST    Clerk user events
    ├── /stripe                POST    Payment events
    └── /line                  POST    LINE follow/unfollow
```

---

## Critical Decision 4: Authentication

**Header:**
```
Authorization: Bearer <clerk_session_token>
```

**Public endpoints (no auth):**
- `GET /api/access/:code` - Validate access code
- `POST /api/search` - Face search
- `GET /api/photos/:id/download` - Download (with signed URL)

**Authenticated endpoints:**
- All `/api/events/*` - Photographer only
- All `/api/credits/*` - Photographer only
- All `/api/photographers/*` - Photographer only
- `POST /api/line/send` - Participant (LINE auth)

**Middleware order:**
1. CORS
2. Rate limiting
3. Auth (Clerk JWT verify)
4. Request validation
5. Handler

---

## Critical Decision 5: Request/Response Format

**Content-Type:** `application/json` (except file uploads)

**File uploads:** `multipart/form-data`

**Response envelope:**
```typescript
// Success
{
  "data": { ... },
  "meta": {
    "total": 100,      // for paginated
    "page": 1,
    "limit": 20
  }
}

FEEDBACK: Just do  {data, page, limit, total} for now.

// Error
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Please purchase credits to continue"
  }
}
```

**No envelope for simple responses:**
```typescript
// GET /api/credits/balance
{ "balance": 450 }
```

---

## Critical Decision 6: Error Handling

**HTTP Status Codes:**

| Status | Use |
|--------|-----|
| 200 | Success |
| 201 | Created |
| 400 | Validation error, bad request |
| 401 | Not authenticated |
| 403 | Not authorized (wrong user) |
| 404 | Resource not found |
| 409 | Conflict (duplicate, state error) |
| 422 | Business rule violation |
| 429 | Rate limited |
| 500 | Server error |

**Error codes (from business rules):**

| Code | HTTP | Message |
|------|------|---------|
| `EVENT_NOT_FOUND` | 404 | Event not found |
| `EVENT_NOT_PUBLISHED` | 422 | Event not available |
| `EVENT_EXPIRED` | 422 | Event has expired |
| `EVENT_NOT_STARTED` | 422 | Event hasn't started yet |
| `EVENT_UPLOAD_CLOSED` | 422 | Upload period has ended |
| `INSUFFICIENT_CREDITS` | 422 | Please purchase credits |
| `INVALID_FILE_TYPE` | 400 | Please upload an image file |
| `FILE_TOO_LARGE` | 400 | File too large (max 50MB) |
| `NO_FACE_DETECTED` | 422 | No face detected |
| `ACCESS_CODE_INVALID` | 404 | Invalid access code |
| `ACCESS_CODE_EXPIRED` | 422 | This link has expired |
| `ACCESS_PIN_REQUIRED` | 401 | Please enter the access code |
| `ACCESS_PIN_WRONG` | 401 | Incorrect access code |
| `LINE_NOT_LINKED` | 422 | Please add us as a friend on LINE |

---

## Critical Decision 7: Pagination

**Query params:**
```
GET /api/events?page=1&limit=20&sort=-created_at
```

**Response:**
```json
{
  "data": [...],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

**Defaults:**
- `page`: 1
- `limit`: 20 (max 100)
- `sort`: `-created_at` (newest first)

---

## Critical Decision 8: File Upload

**Endpoint:** `POST /api/events/:id/photos`

**Method:** `multipart/form-data`

**Flow:**
1. Validate auth + credits
2. Deduct 1 credit (before upload)
3. Stream to R2 (no buffering in Worker)
4. Return photo record (status: pending)
5. Queue async processing

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "status": "pending",
    "filename": "IMG_1234.jpg"
  }
}
```

**Bulk upload:** Client sends multiple requests in parallel. No batch endpoint.

---

## Critical Decision 9: Rate Limits

**API endpoint rate limits:**

| Endpoint | Limit | Window | By | Reason |
|----------|-------|--------|-----|--------|
| `POST /api/search` | 600 | 1 min | IP | 10 TPS per IP (Rekognition has 50 TPS capacity in us-west-2) |
| `POST /api/search` (global) | 1800 | 1 min | All | 30 TPS total (leaves 20 TPS headroom for queue processing) |
| `POST /api/events/:id/photos` | 100 | 1 min | User | Credit abuse prevention |
| `POST /api/line/send` | 10 | 1 min | User | Per-user spam prevention |
| `POST /api/auth/*` | 10 | 1 min | IP | Credential stuffing protection |
| `POST /api/webhooks/*` | 100 | 1 min | IP | Provider protection (Clerk, Stripe, LINE) |
| All other endpoints | 120 | 1 min | IP/User | General protection |

**Response when limited:**

| Component | Value |
|-----------|-------|
| Status | `429 Too Many Requests` |
| Header | `Retry-After: {seconds}` |
| Body | `{"error": {"code": "RATE_LIMITED", "message": "Too many requests"}}` |

**Implementation:** See `08_security.md` for enforcement pattern

---

## Critical Decision 10: Webhooks (Incoming)

**Clerk:** `POST /api/webhooks/clerk`
- `user.created` → Create photographer/participant
- `user.updated` → Sync profile
- `user.deleted` → Soft delete

**Stripe:** `POST /api/webhooks/stripe`
- `checkout.session.completed` → Add credits
- `payment_intent.succeeded` → Confirm payment

**LINE:** `POST /api/webhooks/line`
- `follow` → Set `line_linked = true`
- `unfollow` → Set `line_linked = false`

**Security:** Verify signatures for all webhooks.

---

## Endpoint Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/auth/me` | Yes | Current user |
| GET | `/api/credits/balance` | Yes | Credit balance |
| GET | `/api/credits/history` | Yes | Credit ledger |
| POST | `/api/credits/purchase` | Yes | Start Stripe checkout |
| GET | `/api/events` | Yes | List my events |
| POST | `/api/events` | Yes | Create event |
| GET | `/api/events/:id` | Yes | Get event |
| PATCH | `/api/events/:id` | Yes | Update event |
| DELETE | `/api/events/:id` | Yes | Delete event |
| POST | `/api/events/:id/publish` | Yes | Publish event |
| GET | `/api/events/:id/photos` | Yes | List photos |
| POST | `/api/events/:id/photos` | Yes | Upload photo |
| GET | `/api/events/:id/access-codes` | Yes | List access codes |
| POST | `/api/events/:id/access-codes` | Yes | Create access code |
| GET | `/api/events/:id/stats` | Yes | Event dashboard |
| GET | `/api/photos/:id` | Yes | Get photo |
| DELETE | `/api/photos/:id` | Yes | Delete photo |
| GET | `/api/photos/:id/download` | No* | Download URL |
| GET | `/api/access/:code` | No | Validate access |
| POST | `/api/search` | No | Face search |
| POST | `/api/line/send` | LINE | Send to LINE |

*Download requires valid access code or ownership

---

## What's NOT in This Doc

Implementation details for CONTEXT files:
- Hono route definitions
- Middleware implementations
- Zod validation schemas
- Database query patterns
- R2 upload code
- Stripe integration code

---

## References

- `docs/tech/03_tech_decisions.md` - Hono + Workers decision
- `dev/tech/00_use_cases.md` - Use cases driving endpoints
- `dev/tech/00_business_rules.md` - Error codes, validation rules
- `dev/tech/00_flows.md` - Request flows
- `dev/tech/02_auth.md` - Auth patterns
