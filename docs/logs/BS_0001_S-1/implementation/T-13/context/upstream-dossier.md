# Upstream Dossier: T-13 (Events API)

**Execution Root:** `BS_0001_S-1`  
**Task:** `T-13` — Events API (CRUD + QR generation)  
**Status:** Pending implementation  
**Primary Surface:** API (`apps/api/src/routes/events.ts`, `apps/api/src/lib/qr/`)

---

## Task Summary

**Goal:** Create events API: POST /events, GET /events, GET /events/:id. Generate QR code on create and upload to R2.

**StoryRefs:** US-5 (Create event), US-6 (QR display/download)

**Type:** `feature`

**Scope:**
- `apps/api/src/routes/events.ts`
- `apps/api/src/lib/qr/`

**Dependencies:**
- `T-1` (DB Schema) — **DONE**
- `T-2` (Auth Middleware) — **DONE**
- `T-14` (QR Library) — **DONE** (PR #18)

---

## Acceptance Criteria

1. **POST /events** creates event with unique `access_code` (6-char)
2. Generates QR PNG with **two URLs** (search + slideshow)
3. Uploads QR to R2 bucket
4. Sets `expires_at = created_at + 30 days`
5. `rekognition_collection_id` starts as NULL
6. **GET /events** returns photographer's events
7. **GET /events/:id** returns single event with QR URL

---

## Dependencies Status

| Dependency | Status | Notes |
|------------|--------|-------|
| T-1 (DB Schema) | ✅ Done | `events` table exists with all required columns |
| T-2 (Auth Middleware) | ✅ Done | `requirePhotographer()` available |
| T-14 (QR Library) | ✅ Done | `@juit/qrcode` wrapper in `apps/api/src/lib/qr/` |

---

## Load-Bearing References

### Research: `docs/logs/BS_0001_S-1/research/qr-code-library.md`

**Key Decision:** Use `@juit/qrcode` for direct PNG generation on Workers.

**Implementation Pattern:**
```typescript
import { generatePngQrCode } from "@juit/qrcode";

const pngBytes = await generatePngQrCode(
  `https://sabaipics.com/search/${accessCode}`,
  { ecLevel: "M", margin: 4 }
);
await env.PHOTOS_BUCKET.put(`qr/${eventId}.png`, pngBytes);
```

**QR Content:** 
- Search URL: `https://sabaipics.com/search/{accessCode}`
- Slideshow URL: `https://sabaipics.com/event/{accessCode}/slideshow`

**Note:** The research doc shows single URL in example, but plan specifies **two URLs**. See Implied Contracts below.

### Plan: `docs/logs/BS_0001_S-1/plan/final.md`

**Relevant Sections:**
- Phase 3: Events (US-5, US-6)
- Database Schema: `events` table
- API Summary: Events endpoints

**Key Requirements:**
- Access code: 6-character unique string
- Event expiry: 30 days from creation
- QR storage: R2 bucket (`PHOTOS_BUCKET`)
- Rekognition collection: Lazy creation (NULL at first)

---

## Implied Contracts

### Endpoints

#### POST /events
**Request:**
```typescript
{
  name: string;           // Required
  start_date?: string;    // ISO date, optional
  end_date?: string;      // ISO date, optional
}
```

**Response:**
```typescript
{
  id: string;
  photographer_id: string;
  name: string;
  start_date?: string;
  end_date?: string;
  access_code: string;    // 6-char unique
  qr_code_url: string;    // R2 public URL
  rekognition_collection_id: null;
  expires_at: string;     // ISO datetime
  created_at: string;
}
```

#### GET /events
**Response:**
```typescript
{
  events: Array<{
    id: string;
    name: string;
    start_date?: string;
    end_date?: string;
    access_code: string;
    qr_code_url: string;
    photo_count?: number;  // [GAP] Should we include counts?
    created_at: string;
  }>;
}
```

#### GET /events/:id
**Response:**
```typescript
{
  id: string;
  photographer_id: string;
  name: string;
  start_date?: string;
  end_date?: string;
  access_code: string;
  qr_code_url: string;
  qr_search_url: string;   // [GAP] Expose URLs separately?
  qr_slideshow_url: string;
  rekognition_collection_id: null;
  expires_at: string;
  created_at: string;
}
```

### Database Tables

**events:**
```sql
INSERT INTO events (
  photographer_id,
  name,
  start_date,
  end_date,
  access_code,          -- 6-char unique
  qr_code_r2_key,       -- "qr/{event_id}.png"
  rekognition_collection_id,  -- NULL initially
  expires_at,           -- created_at + 30 days
  created_at
)
```

**Constraints:**
- `access_code` must be unique across all events
- `photographer_id` from auth middleware
- `rekognition_collection_id` nullable

### R2 Storage

**QR Code Key Pattern:** `qr/{event_id}.png`

**Content-Type:** `image/png`

**Lifecycle:** 30-day expiry (per plan section "Data Retention & Cleanup")

---

## Uncertainties & Gaps

### [GAP] Two URLs in Single QR or Two QRs?
The plan specifies "QR PNG with **two URLs** (search + slideshow)" but doesn't specify:
- Single QR containing both URLs (how? multi-URL encoding?)
- Two separate QR codes generated
- QR encodes one URL, other is metadata

**Likely interpretation:** QR encodes search URL, slideshow URL is stored in DB but not encoded in QR. Need validation.

### [GAP] Access Code Generation
- Algorithm: Random alphanumeric? Base62?
- Collision handling: Retry on duplicate?
- Length: Exactly 6 chars? More for safety?

### [GAP] Photo Count in GET /events
Should the list endpoint include `photo_count`? Dashboard UI (T-11) shows "photo count" on event cards, but API contract not explicit.

### [GAP] QR URL Format
- Should QR be publicly accessible via R2 public bucket?
- Or served through API endpoint (proxy)?
- Environment variable for base URL?

### [NEED_DECISION] Error Correction Level
Research recommends M (15%), but plan doesn't specify. Photographers may print QRs for events—consider Q (25%) for print durability.

### [NEED_VALIDATION] Start/End Date Storage
Plan shows `start_date`/`end_date` in table but optional in API. Are these:
- Event duration (photographing window)?
- Display purposes only?
- Validated for logical consistency (start ≤ end)?

---

## Constraints & Requirements

### Technical Constraints
- Runtime: Cloudflare Workers
- QR Library: `@juit/qrcode` (already installed via T-14)
- R2 Bucket: `PHOTOS_BUCKET` environment variable
- Auth: `requirePhotographer()` middleware
- Database: Drizzle ORM with Neon Postgres

### Business Rules
- Access code must be unique
- Events expire after 30 days
- QR codes deleted after 30 days (R2 lifecycle rule)
- Rekognition collection created on first photo upload (lazy)

### API Contract Requirements
- All endpoints require photographer auth
- Events scoped to authenticated photographer
- 404 if event not found or doesn't belong to photographer
- Return 409 if access code collision occurs (if retry logic implemented)

---

## Testing Notes

**Unit Tests:**
- Access code generation (uniqueness, format)
- QR generation (verifiable output)
- Event creation with/without dates

**Integration Tests:**
- Full POST /events flow (create → QR → R2)
- GET /events pagination (if applicable)
- GET /events/:id with invalid IDs

**Manual Tests:**
- Scan QR with mobile camera (iOS/Android)
- Verify both URLs accessible
- Print QR test (error correction validation)

---

## Risk Assessment

**Medium Risk:**
- QR scanning reliability (critical user-facing feature)
- Access code uniqueness (collision handling)
- R2 upload failures (retry logic?)

**Low Risk:**
- Straightforward CRUD operations
- Dependencies complete
- Library already validated

**Rollout Plan:**
- Test QR generation with real access codes
- Scan with multiple devices
- Verify R2 upload and public URL accessibility

---

## References

- Task Definition: `docs/logs/BS_0001_S-1/tasks.md#T-13`
- Plan: `docs/logs/BS_0001_S-1/plan/final.md` (Phase 3)
- Research: `docs/logs/BS_0001_S-1/research/qr-code-library.md`
- Dependency (T-14): PR #18 (QR library wrapper)
