# Data Schema Design

**Status:** Draft Complete (may evolve during development)
**Last Updated:** 2025-12-04

---

## Design Principles

1. **Clerk handles auth** - No password storage, reference `clerk_user_id`.
   - Photographers: Google, LINE, or Email OTP (passwordless)
   - Participants: LINE only (need LINE for photo delivery anyway)
2. **Soft deletes** - `deleted_at` timestamp for recoverability
3. **Audit timestamps** - `created_at`, `updated_at` on all tables
4. **UUIDs for public IDs** - Never expose sequential IDs externally
5. **Ledger-style credits** - Immutable transactions, not mutable balance
6. **JSON for extensibility** - Settings, preferences, metadata
7. **Prepared for multi-tenancy** - All queries scoped by `photographer_id`

---

## Storage Distribution

| Data | Storage | Rationale |
|------|---------|-----------|
| Users, Events, Photos metadata | **Postgres (Neon)** | Relational, queryable |
| Audit logs (deliveries, notifications) | **Postgres (Neon)** | Business data, compliance, reporting |
| Rate limiting counters (temporary) | **Durable Objects** | Fast in-memory, per-user isolation |
| Photo files (original, processed, thumb) | **Cloudflare R2** | Object storage, zero egress |
| Face embeddings | **AWS Rekognition** | 1 collection per event, managed by AWS |
| Auth & sessions | **Clerk** | Managed service (LINE, Google, Email OTP) |
| Payment data | **Stripe** | PCI compliant, we store references only |

---

## Core Entities

### 1. Photographer (User)

The primary paying customer. Authenticated via Clerk.

```sql
CREATE TABLE photographers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id   TEXT UNIQUE NOT NULL,  -- From Clerk

    -- Profile (synced from Clerk, can be overridden)
    email           TEXT,  -- Nullable: LINE users may not have email. Stripe doesn't require it.
    display_name    TEXT,
    avatar_url      TEXT,
    phone           TEXT,

    -- Business info
    business_name   TEXT,

    -- Settings (extensible)
    settings        JSONB DEFAULT '{}',
    -- e.g., { "language": "th", "timezone": "Asia/Bangkok", "notifications": {...} }

    -- Stripe
    stripe_customer_id TEXT,  -- Email not required for Stripe. Use LINE for receipts if no email.

    -- Status
    status          TEXT DEFAULT 'active',  -- active, suspended, deleted

    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- Note: If photographer signs up via LINE (no email), prompt them to add email for receipts.
-- Stripe customers can be created without email - send receipts via LINE instead.

CREATE INDEX idx_photographers_clerk ON photographers(clerk_user_id);
CREATE INDEX idx_photographers_email ON photographers(email);
CREATE INDEX idx_photographers_stripe ON photographers(stripe_customer_id);
```

**Settings JSON Examples:**
```json
{
  "language": "th",
  "timezone": "Asia/Bangkok",
  "notifications": {
    "email_on_upload_complete": true,
    "email_on_low_credits": true,
    "low_credit_threshold": 50
  },
  "defaults": {
    "gallery_theme": "dark",
    "watermark_enabled": true
  }
}
```

---

### 2. Participant

Lightweight user for photo searchers. Authenticated via Clerk (LINE only - no Google/Email).

```sql
CREATE TABLE participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id   TEXT UNIQUE NOT NULL,  -- All auth goes through Clerk

    -- Profile (from Clerk / LINE Login)
    display_name    TEXT,
    avatar_url      TEXT,

    -- LINE specific (for messaging)
    line_user_id    TEXT UNIQUE,  -- LINE's U-prefixed ID for push messages (set when signed in via LINE)
    line_linked     BOOLEAN DEFAULT FALSE,  -- Has added our OA as friend (required for push)

    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_participants_clerk ON participants(clerk_user_id);
CREATE INDEX idx_participants_line ON participants(line_user_id) WHERE line_user_id IS NOT NULL;
```

**Note:** Participants are lightweight. We don't store much - just enough to send LINE notifications and track basic analytics.

**Important:** Not all participants need to sign up. Anonymous search is supported:
- Anonymous users can search and view photos without signing in
- Sign-up only required if they want LINE notifications for their matches
- `participant_id` is nullable in `search_sessions` to support anonymous searches

**LINE Integration (VERIFIED - all auth via Clerk):**

Two requirements to send photos via LINE push message:
1. **LINE Login (via Clerk)** - We need their `line_user_id`
2. **OA Friend** - `line_linked` must be TRUE (otherwise push silently fails)

| User State | clerk_user_id | line_user_id | line_linked | Can Send Push? |
|------------|---------------|--------------|-------------|----------------|
| Anonymous (no login) | - | - | - | ❌ No |
| LINE Login only | set | set | FALSE | ❌ No (silent fail) |
| LINE Login + OA friend | set | set | TRUE | ✅ Yes |

**Note:** Participants can ONLY sign in via LINE (no Google/Email option), so `line_user_id` is always set when signed in.

**When `line_linked` is updated:**
- On Clerk LINE Login callback: check `friendship_status_changed` query param
- On follow webhook: set `line_linked = TRUE`
- On unfollow/block webhook: set `line_linked = FALSE` 

---

### 3. Event

A photo event/project created by a photographer.

```sql
CREATE TABLE events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photographer_id     UUID NOT NULL REFERENCES photographers(id),

    -- Basic info
    name                TEXT NOT NULL,
    description         TEXT,

    -- Event timing (supports multi-day events)
    start_datetime      TIMESTAMPTZ,
    end_datetime        TIMESTAMPTZ,

    -- Location (optional, for future features)
    location_name       TEXT,
    location_lat        DECIMAL(10, 8),
    location_lng        DECIMAL(11, 8),

    -- Gallery settings (extensible)
    gallery_settings    JSONB DEFAULT '{}',

    -- Branding
    logo_url            TEXT,  -- R2 path
    watermark_url       TEXT,  -- R2 path

    -- AWS Rekognition
    rekognition_collection_id TEXT,  -- e.g., "facelink-event-{id}"

    -- Status (only stored states - others are derived)
    status              TEXT DEFAULT 'draft',  -- 'draft' or 'published'
    -- Derived states (computed from dates, not stored):
    --   'active'  = published AND NOW() BETWEEN start_datetime AND end_datetime
    --   'closed'  = published AND NOW() > end_datetime
    --   'expired' = NOW() > expires_at
    -- Business rule: Only 'published' events can receive photo uploads

    -- Note: Access control (public/private, password) is handled in event_access table
    -- Event itself doesn't care about access - you need an event_access record to access it

    -- Retention
    retention_days      INT DEFAULT 30,
    expires_at          TIMESTAMPTZ,

    -- Stats (denormalized for performance)
    photo_count         INT DEFAULT 0,
    face_count          INT DEFAULT 0,
    search_count        INT DEFAULT 0,

    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_events_photographer ON events(photographer_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_start ON events(start_datetime);
CREATE INDEX idx_events_expires ON events(expires_at) WHERE deleted_at IS NULL;
```

**Gallery Settings JSON:**
```json
{
  "theme": "dark",
  "primary_color": "#9B8FC7",
  "background_color": "#000000",
  "show_photographer_branding": true,
  "allow_downloads": true,
  "download_quality": "original",
  "language": "th",
  "custom_css": null
}
```

---

### 4. Event Access (QR Codes / Links)

Multiple access methods per event. **Access control lives here, not on the event.**

```sql
CREATE TABLE event_access (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES events(id),

    -- Access type
    type            TEXT NOT NULL,  -- 'qr', 'link'

    -- Unique code/slug (used in URLs, encoded in QR)
    code            TEXT UNIQUE NOT NULL,  -- Short code for URLs, e.g., "abc123"

    -- Access control
    access_code     TEXT,  -- Optional password/PIN to access. NULL = no password required.

    -- Optional restrictions
    max_uses        INT,
    used_count      INT DEFAULT 0,
    expires_at      TIMESTAMPTZ,

    -- Status
    is_active       BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Access flow: User scans QR → gets `code` → if `access_code` is set, prompt for it
-- This allows different access codes for different groups (e.g., VIP vs general)

CREATE INDEX idx_event_access_event ON event_access(event_id);
CREATE INDEX idx_event_access_code ON event_access(code);
```

---

### 5. Photo

Photo metadata. Actual files stored in R2.

```sql
CREATE TABLE photos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID NOT NULL REFERENCES events(id),
    photographer_id     UUID NOT NULL REFERENCES photographers(id),

    -- File info
    filename_original   TEXT NOT NULL,
    file_size_bytes     BIGINT,
    mime_type           TEXT DEFAULT 'image/jpeg',

    -- R2 path (original only - use Cloudflare Images for on-the-fly transforms)
    r2_key              TEXT NOT NULL,  -- Original upload. Thumbnails/variants generated via CF Images on-demand.

    -- Image metadata (EXIF)
    width               INT,
    height              INT,
    taken_at            TIMESTAMPTZ,    -- From EXIF
    camera_make         TEXT,
    camera_model        TEXT,

    -- Processing status
    status              TEXT DEFAULT 'pending',  -- pending, processing, ready, failed
    processing_error    TEXT,

    -- Face detection results
    face_count          INT DEFAULT 0,
    faces_indexed       BOOLEAN DEFAULT FALSE,


    -- Quality filter (v1.1)
    quality_score       DECIMAL(3, 2),  -- 0.00-1.00
    is_blurry           BOOLEAN,
    has_closed_eyes     BOOLEAN,

    -- Timestamps
    uploaded_at         TIMESTAMPTZ DEFAULT NOW(),
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_photos_event ON photos(event_id);
CREATE INDEX idx_photos_photographer ON photos(photographer_id);
CREATE INDEX idx_photos_status ON photos(status);
CREATE INDEX idx_photos_uploaded ON photos(uploaded_at);
```

---

### 6. Face

Detected faces in photos. References AWS Rekognition face IDs. Stores all face attributes from Rekognition for filtering and analytics.

```sql
CREATE TABLE faces (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id            UUID NOT NULL REFERENCES photos(id),
    event_id            UUID NOT NULL REFERENCES events(id),

    -- AWS Rekognition reference
    rekognition_face_id TEXT NOT NULL,  -- AWS's face ID in collection

    -- Bounding box (for UI highlighting) - 0.0-1.0 relative coordinates
    bbox_left           DECIMAL(5, 4),
    bbox_top            DECIMAL(5, 4),
    bbox_width          DECIMAL(5, 4),
    bbox_height         DECIMAL(5, 4),

    -- Detection confidence
    confidence          DECIMAL(5, 2),  -- 0-100%

    -- ===== FACE ATTRIBUTES (from Rekognition FaceDetail) =====

    -- Age estimate
    age_low             SMALLINT,       -- Estimated age range low
    age_high            SMALLINT,       -- Estimated age range high

    -- Gender
    gender              TEXT,           -- 'Male' | 'Female'
    gender_confidence   DECIMAL(5, 2),

    -- Smile
    smile               BOOLEAN,
    smile_confidence    DECIMAL(5, 2),

    -- Eyes
    eyes_open           BOOLEAN,
    eyes_open_confidence DECIMAL(5, 2),
    eyeglasses          BOOLEAN,
    eyeglasses_confidence DECIMAL(5, 2),
    sunglasses          BOOLEAN,
    sunglasses_confidence DECIMAL(5, 2),

    -- Mouth
    mouth_open          BOOLEAN,
    mouth_open_confidence DECIMAL(5, 2),

    -- Facial hair
    beard               BOOLEAN,
    beard_confidence    DECIMAL(5, 2),
    mustache            BOOLEAN,
    mustache_confidence DECIMAL(5, 2),

    -- Face quality (for filtering bad photos)
    quality_brightness  DECIMAL(5, 2),  -- 0-100
    quality_sharpness   DECIMAL(5, 2),  -- 0-100

    -- Face pose (head rotation)
    pose_pitch          DECIMAL(6, 2),  -- -180 to 180
    pose_roll           DECIMAL(6, 2),  -- -180 to 180
    pose_yaw            DECIMAL(6, 2),  -- -180 to 180

    -- Eye direction (gaze)
    eye_direction_pitch DECIMAL(6, 2),  -- -180 to 180
    eye_direction_yaw   DECIMAL(6, 2),  -- -180 to 180
    eye_direction_confidence DECIMAL(5, 2),

    -- Face occlusion (useful for filtering unusable faces)
    face_occluded       BOOLEAN,
    face_occluded_confidence DECIMAL(5, 2),

    -- Dominant emotion (extracted from emotions array)
    emotion_primary     TEXT,           -- 'HAPPY' | 'SAD' | 'ANGRY' | 'CONFUSED' | 'DISGUSTED' | 'SURPRISED' | 'CALM' | 'FEAR' | 'UNKNOWN'
    emotion_primary_confidence DECIMAL(5, 2),

    -- Full data for analytics and future features
    emotions_json       JSONB,          -- Full emotions array: [{Type, Confidence}, ...]
    landmarks_json      JSONB,          -- Full landmarks array: [{Type, X, Y}, ...] - 29 points

    -- ===== END FACE ATTRIBUTES =====

    -- Claimed identity (set when participant searches and matches this face)
    participant_id      UUID REFERENCES participants(id),  -- NULL until someone claims
    claimed_at          TIMESTAMPTZ,
    claim_similarity    DECIMAL(5, 2),  -- Similarity score when claimed

    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Primary lookups
CREATE INDEX idx_faces_photo ON faces(photo_id);
CREATE INDEX idx_faces_event ON faces(event_id);
CREATE INDEX idx_faces_rekognition ON faces(rekognition_face_id);
CREATE INDEX idx_faces_participant ON faces(participant_id) WHERE participant_id IS NOT NULL;

-- Filtering indexes (common queries)
CREATE INDEX idx_faces_smile ON faces(event_id, smile) WHERE smile = TRUE;
CREATE INDEX idx_faces_quality ON faces(event_id, quality_sharpness, quality_brightness);
CREATE INDEX idx_faces_emotion ON faces(event_id, emotion_primary);
CREATE INDEX idx_faces_eyes_open ON faces(event_id, eyes_open) WHERE eyes_open = TRUE;
```

**Face Attributes Stored:**

| Category | Attributes | Use Case |
|----------|------------|----------|
| Demographics | age_low/high, gender | Analytics, filtering |
| Expression | smile, emotion_primary | "Show me smiling photos" |
| Eyes | eyes_open, eyeglasses, sunglasses | Filter out blinks/occlusions |
| Face Quality | quality_brightness, quality_sharpness | Auto-filter bad photos |
| Pose | pitch, roll, yaw | Filter extreme angles |
| Occlusion | face_occluded | Filter covered faces |
| Raw Data | emotions_json, landmarks_json | Future features, analytics |

**Landmarks (29 points):**
`eyeLeft`, `eyeRight`, `nose`, `mouthLeft`, `mouthRight`, `leftEyeBrowLeft`, `leftEyeBrowRight`, `leftEyeBrowUp`, `rightEyeBrowLeft`, `rightEyeBrowRight`, `rightEyeBrowUp`, `leftEyeLeft`, `leftEyeRight`, `leftEyeUp`, `leftEyeDown`, `rightEyeLeft`, `rightEyeRight`, `rightEyeUp`, `rightEyeDown`, `noseLeft`, `noseRight`, `mouthUp`, `mouthDown`, `leftPupil`, `rightPupil`, `upperJawlineLeft`, `midJawlineLeft`, `chinBottom`, `midJawlineRight`, `upperJawlineRight`

**Emotions (9 types):**
`HAPPY`, `SAD`, `ANGRY`, `CONFUSED`, `DISGUSTED`, `SURPRISED`, `CALM`, `FEAR`, `UNKNOWN`

**Face Claiming Logic:**
- When a signed-in participant searches and gets high-confidence matches (>90%), we set `participant_id` on matched faces
- This enables "Find all my photos" without re-running Rekognition
- Low-confidence matches don't get claimed (recorded in `search_results` only)
- Same face can only be claimed once (first high-confidence match wins)

**Note:** We don't store embeddings locally. AWS Rekognition manages face vectors in collections. We only store the `rekognition_face_id` for reference.

**Embedding Export:** Researched - AWS Rekognition does **NOT** return or expose face embeddings. The vectors are proprietary and stored internally. We cannot store them locally even if we wanted to. See `dev/research/rekognition_embedding_export.md`.

**Vendor Lock-in Risk:** If we switch face recognition providers, we must re-index all faces from original photos. Mitigated by keeping original photos in R2.

---

### 7. Credit Ledger

Immutable ledger for credit transactions. Balance is computed, not stored.

```sql
CREATE TABLE credit_ledger (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photographer_id     UUID NOT NULL REFERENCES photographers(id),

    -- Transaction type
    type                TEXT NOT NULL,  -- 'purchase', 'bonus', 'promo', 'usage', 'refund', 'expired'

    -- Amount in CREDITS (not money). 1 credit = 1 photo upload.
    -- Positive = add credits, Negative = deduct credits
    amount              INT NOT NULL,  -- Credits, not currency. Money is in `payments` table.

    -- For tracking source
    source              TEXT,  -- 'stripe', 'signup', 'referral', 'admin', 'system'
    source_reference    TEXT,  -- e.g., Stripe payment intent ID, promo code

    -- For usage tracking
    event_id            UUID REFERENCES events(id),
    photo_id            UUID REFERENCES photos(id),

    -- Expiration (for non-usage entries)
    expires_at          TIMESTAMPTZ,

    -- Running balance (denormalized for performance)
    balance_after       INT NOT NULL,

    -- Description
    description         TEXT,

    -- Metadata
    metadata            JSONB DEFAULT '{}',

    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_ledger_photographer ON credit_ledger(photographer_id);
CREATE INDEX idx_credit_ledger_type ON credit_ledger(type);
CREATE INDEX idx_credit_ledger_expires ON credit_ledger(expires_at)
    WHERE type IN ('purchase', 'bonus', 'promo') AND expires_at IS NOT NULL;
CREATE INDEX idx_credit_ledger_created ON credit_ledger(created_at);
```

**Credit Source Expiration Rules:**
- `purchase`: 6 months from purchase (per business rules)
- `bonus` (signup): 1 month
- `promo`: Variable, set per promo
- `usage`: No expiration (it's consumption)
- `refund`: No expiration
- `expired`: Records when credits expire

**FIFO Consumption Logic:**
When deducting credits, consume from the entry with the soonest `expires_at` first.

---

### 8. Credit Balance View

Computed view for current balance.

```sql
CREATE VIEW photographer_credit_balance AS
SELECT
    photographer_id,
    SUM(amount) AS total_balance,
    SUM(CASE WHEN type IN ('purchase', 'bonus', 'promo', 'refund')
             AND (expires_at IS NULL OR expires_at > NOW())
        THEN amount ELSE 0 END) AS available_balance,
    SUM(CASE WHEN type = 'usage' THEN ABS(amount) ELSE 0 END) AS total_used,
    SUM(CASE WHEN type = 'expired' THEN ABS(amount) ELSE 0 END) AS total_expired
FROM credit_ledger
GROUP BY photographer_id;
```

**When to use this view vs latest ledger entry:**
- **Latest ledger `balance_after`**: Fast check for "do I have enough credits?" (single row lookup)
- **This view**: Dashboard display, admin panel, reporting (aggregate stats across all transactions)

This view is **optional/convenience** - most operations just check `balance_after` on latest entry.

---

### 9. Payment History

Stripe payment records.

```sql
CREATE TABLE payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photographer_id         UUID NOT NULL REFERENCES photographers(id),

    -- Stripe references
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_checkout_session_id TEXT,
    stripe_invoice_id       TEXT,

    -- Amount
    amount_cents            INT NOT NULL,
    currency                TEXT DEFAULT 'thb',

    -- What was purchased
    credits_purchased       INT,
    package_name            TEXT,  -- 'starter', 'growth', 'professional', 'studio'

    -- Status
    status                  TEXT DEFAULT 'pending',  -- pending, succeeded, failed, refunded

    -- Metadata
    metadata                JSONB DEFAULT '{}',

    -- Timestamps
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    completed_at            TIMESTAMPTZ
);

CREATE INDEX idx_payments_photographer ON payments(photographer_id);
CREATE INDEX idx_payments_stripe ON payments(stripe_payment_intent_id);
CREATE INDEX idx_payments_status ON payments(status);
```

---

### 10. Search Session

Track participant searches for analytics and **caching**.

**Caching use case:** If same participant searches same event again, we can return cached results from `search_results` instead of hitting Rekognition again (saves cost).

```sql
CREATE TABLE search_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID NOT NULL REFERENCES events(id),
    participant_id      UUID REFERENCES participants(id),  -- NULL if anonymous

    -- Search input
    selfie_r2_key       TEXT,  -- Stored selfie for debugging/support

    -- Results
    match_count         INT DEFAULT 0,

    -- Timing
    search_duration_ms  INT,

    -- Source
    source              TEXT,  -- 'web', 'app'

    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_search_sessions_event ON search_sessions(event_id);
CREATE INDEX idx_search_sessions_participant ON search_sessions(participant_id);
CREATE INDEX idx_search_sessions_created ON search_sessions(created_at);
```

---

### 11. Search Results

Individual matches from a search. **Kept separate from `faces.participant_id` because they serve different purposes:**

| `faces.participant_id` | `search_results` |
|------------------------|------------------|
| "This face IS you" (identity claim) | "You searched and found this" (session log) |
| Set on high-confidence matches only | Logs ALL matches regardless of confidence |
| 1 participant per face | Same face can appear in many sessions |
| Fast "my photos" lookup | Analytics, caching, action tracking |

```sql
CREATE TABLE search_results (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_session_id   UUID NOT NULL REFERENCES search_sessions(id),
    photo_id            UUID NOT NULL REFERENCES photos(id),
    face_id             UUID REFERENCES faces(id),

    -- Match quality
    similarity_score    DECIMAL(5, 2),  -- From Rekognition

    -- Participant actions
    viewed              BOOLEAN DEFAULT FALSE,
    downloaded          BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_search_results_session ON search_results(search_session_id);
CREATE INDEX idx_search_results_photo ON search_results(photo_id);
```

**AWS Rekognition SearchFacesByImage Response** (researched - see `dev/research/rekognition_embedding_export.md`):
```json
{
  "FaceMatches": [
    {
      "Similarity": 98.5,  // 0-100 float → stored in similarity_score
      "Face": {
        "FaceId": "uuid",  // → used to lookup our faces table
        "BoundingBox": {...},
        "ExternalImageId": "photo-123",  // → our photo ID
        "Confidence": 99.9
      }
    }
  ]
}
```

---

### 12. Deliveries

Track all photo deliveries for photographer analytics and audit trail.

```sql
CREATE TABLE deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES events(id),
    photo_id        UUID NOT NULL REFERENCES photos(id),
    participant_id  UUID REFERENCES participants(id),  -- NULL if anonymous download

    -- Delivery type
    type            TEXT NOT NULL,  -- 'download' | 'line'

    -- Audit trail
    ip_address      INET,  -- For compliance/audit (nullable for LINE deliveries)

    -- Timestamps
    delivered_at    TIMESTAMPTZ DEFAULT NOW()
);

-- For photographer dashboard queries
CREATE INDEX idx_deliveries_event ON deliveries(event_id, delivered_at);
CREATE INDEX idx_deliveries_photo ON deliveries(photo_id);
CREATE INDEX idx_deliveries_type ON deliveries(event_id, type);
```

**Note:** This is separate from `line_notifications` which tracks LINE API status. A single LINE send may include multiple photos, each recorded as a separate delivery.

---

### 13. LINE Notifications

Track LINE messages sent (API status tracking + quota monitoring).

```sql
CREATE TABLE line_notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photographer_id     UUID NOT NULL REFERENCES photographers(id),  -- Who sent (for quota tracking)
    participant_id      UUID REFERENCES participants(id),
    event_id            UUID REFERENCES events(id),
    search_session_id   UUID REFERENCES search_sessions(id),

    -- Message content
    photo_count         INT NOT NULL DEFAULT 0,  -- How many photos in message

    -- LINE API
    line_user_id        TEXT NOT NULL,
    message_type        TEXT,  -- 'carousel', 'text', 'flex'

    -- Status
    status              TEXT DEFAULT 'pending',  -- pending, sent, failed
    error_message       TEXT,

    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    sent_at             TIMESTAMPTZ
);

CREATE INDEX idx_line_notifications_participant ON line_notifications(participant_id);
CREATE INDEX idx_line_notifications_photographer ON line_notifications(photographer_id, sent_at);  -- For quota tracking
CREATE INDEX idx_line_notifications_status ON line_notifications(status);
```

**Usage:**
- `photographer_id` + `sent_at` index for quota queries: "How many LINE messages sent this month?"
- `photo_count` for analytics: "Total photos delivered via LINE"

---

### 14. Consent Records

PDPA compliance: Track explicit consent from photographers and participants for biometric data processing.

```sql
CREATE TABLE consent_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who consented
    user_type               TEXT NOT NULL,  -- 'photographer' | 'participant'
    user_id                 UUID,  -- photographer_id or participant_id (nullable for anonymous)

    -- Context
    event_id                UUID REFERENCES events(id),  -- NULL for photographer registration
    search_session_id       UUID REFERENCES search_sessions(id),  -- For linking anonymous consent to session

    -- Consent details
    consent_type            TEXT NOT NULL,  -- 'photographer_registration' | 'face_search'
    privacy_policy_version  TEXT,  -- e.g., "1.0.0" for audit trail

    -- Audit trail
    ip_address              INET,
    user_agent              TEXT,

    -- Timestamps
    consented_at            TIMESTAMPTZ DEFAULT NOW(),
    withdrawn_at            TIMESTAMPTZ  -- NULL = consent still valid
);

CREATE INDEX idx_consent_records_user ON consent_records(user_type, user_id);
CREATE INDEX idx_consent_records_event ON consent_records(event_id);
CREATE INDEX idx_consent_records_session ON consent_records(search_session_id);
CREATE INDEX idx_consent_records_type ON consent_records(consent_type, consented_at);
```

**Consent types:**

| Type | When | user_id | event_id | Description |
|------|------|---------|----------|-------------|
| `photographer_registration` | Photographer signup | photographer_id | NULL | "I confirm I obtained consent from photographed individuals" |
| `face_search` | Participant search | participant_id or NULL | event_id | "I consent to facial recognition processing" |

**Key fields:**

| Field | Purpose |
|-------|---------|
| `user_id` | NULL for anonymous participants (tracked via `search_session_id`) |
| `search_session_id` | Links anonymous consent to specific search session |
| `privacy_policy_version` | Audit trail for which policy version user consented to |
| `withdrawn_at` | When user withdrew consent (for data subject rights) |

**Retention:** 3 years (PDPA legal requirement for consent records).

**Anonymous participant flow:**
1. Anonymous user searches (no login)
2. User checks consent box
3. Create consent_record with `user_id = NULL`, `search_session_id = <session_id>`
4. If user searches again same event: ask for consent again (can't track them)

**Logged-in participant flow:**
1. Participant logged in with LINE
2. Check if consent already given for this event: `SELECT WHERE user_id = X AND event_id = Y AND withdrawn_at IS NULL`
3. If no existing consent: show checkbox
4. Create consent_record with `user_id = participant_id`, `event_id = <event_id>`

---

## Future-Ready Extensions

### For v1.1: Photo Sales

```sql
-- Future: Photo pricing by photographer
CREATE TABLE photo_pricing (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID NOT NULL REFERENCES events(id),
    photographer_id     UUID NOT NULL REFERENCES photographers(id),

    -- Pricing
    price_cents         INT NOT NULL,
    currency            TEXT DEFAULT 'thb',

    -- Applies to
    applies_to          TEXT DEFAULT 'all',  -- 'all', 'selected'

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Future: Participant purchases
CREATE TABLE photo_purchases (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id      UUID NOT NULL REFERENCES participants(id),
    photo_id            UUID NOT NULL REFERENCES photos(id),

    -- Payment
    amount_cents        INT NOT NULL,
    currency            TEXT DEFAULT 'thb',
    stripe_payment_intent_id TEXT,

    -- Revenue split
    photographer_share_cents INT,  -- 90%
    platform_fee_cents  INT,       -- 10%

    -- Status
    status              TEXT DEFAULT 'pending',

    created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### For v2: Teams/Agencies

```sql
-- Future: Team/organization support
CREATE TABLE teams (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    owner_id            UUID NOT NULL REFERENCES photographers(id),

    settings            JSONB DEFAULT '{}',

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE team_members (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id             UUID NOT NULL REFERENCES teams(id),
    photographer_id     UUID NOT NULL REFERENCES photographers(id),

    role                TEXT DEFAULT 'member',  -- owner, admin, member

    created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐
│  photographers  │───────│    payments     │
│                 │       └─────────────────┘
│  clerk_user_id  │
│  stripe_cust_id │───────┌─────────────────┐
│  settings{}     │       │  credit_ledger  │
└────────┬────────┘       │                 │
         │                │  type, amount   │
         │                │  expires_at     │
         │                │  balance_after  │
         │                └─────────────────┘
         │
         │ 1:many
         ▼
┌─────────────────┐       ┌─────────────────┐
│     events      │───────│  event_access   │
│                 │       │  (QR/links)     │
│  gallery_set{}  │       └─────────────────┘
│  rekognition_id │
└────────┬────────┘
         │
         │ 1:many
         ▼
┌─────────────────┐       ┌─────────────────┐
│     photos      │───────│     faces       │
│                 │       │                 │
│  r2_key         │       │  rekog_face_id  │
│  status         │       │  bbox           │
│  face_count     │       │  participant_id │◄───┐ (claimed identity)
└────────┬────────┘       └─────────────────┘    │
         │                                       │
         │ 1:many                                │
         ▼                                       │
┌─────────────────┐                              │
│   deliveries    │                              │
│                 │                              │
│  type           │  (download/line)             │
│  participant_id │──────────────────────────────┤
│  delivered_at   │                              │
└─────────────────┘                              │
                                                 │
┌─────────────────┐       ┌─────────────────┐    │
│ search_sessions │───────│ search_results  │    │
│                 │       │                 │    │
│  participant_id │       │  similarity     │    │
│  match_count    │       │  downloaded     │    │
└─────────────────┘       └─────────────────┘    │
         │                                       │
         │                                       │
         ▼                                       │
┌─────────────────┐                              │
│  participants   │──────────────────────────────┘
│                 │
│  clerk_user_id  │
│  line_user_id   │
└─────────────────┘
```

---

## Query Patterns & Indexes

| Query Pattern | Index |
|---------------|-------|
| Get photographer by Clerk ID | `idx_photographers_clerk` |
| Get events for photographer | `idx_events_photographer` |
| Get photos for event | `idx_photos_event` |
| Get faces for photo | `idx_faces_photo` |
| Get all faces for participant ("my photos") | `idx_faces_participant` |
| Get credit history | `idx_credit_ledger_photographer` |
| Find expiring credits | `idx_credit_ledger_expires` |
| Get search history for event | `idx_search_sessions_event` |
| Get delivery stats for event | `idx_deliveries_event` |
| Get delivery count per photo | `idx_deliveries_photo` |
| Get deliveries by type (download/line) | `idx_deliveries_type` |
| Check existing consent for user | `idx_consent_records_user` |
| Get consent records for event | `idx_consent_records_event` |
| Get consent for search session | `idx_consent_records_session` |

---

## Data Retention

| Data | Retention | Action |
|------|-----------|--------|
| Event + Photos | `retention_days` (default 30) | Soft delete, then hard delete after 7 days |
| Rekognition Collection | Same as event | Delete collection on event expiry |
| R2 Photo Files | Same as event | Delete objects on event expiry |
| Search Sessions | 90 days | Archive to cold storage |
| Consent Records | 3 years | PDPA legal requirement for consent audit trail |
| Credit Ledger | Forever | Immutable audit trail |
| Payments | Forever | Legal requirement |

---

## Migration Notes

1. **Use UUID everywhere** - Never expose sequential IDs
2. **Timestamps with timezone** - Always `TIMESTAMPTZ`
3. **Soft deletes first** - Add `deleted_at`, hard delete in background job
4. **JSON for flexibility** - Settings, metadata can evolve without migrations
5. **Denormalize counts** - `photo_count`, `face_count` on events for performance
6. **Audit trail** - Credit ledger is append-only, never update/delete
