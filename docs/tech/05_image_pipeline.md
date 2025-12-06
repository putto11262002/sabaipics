# Image Pipeline Design

**Status:** Complete
**Last Updated:** 2025-12-04

---

## Overview

```
Upload → Validate → Store → Process → Index → Ready
```

**Components:**
- **R2** - Object storage (original photos)
- **Cloudflare Images** - On-demand transforms (thumbnails, resizing)
- **AWS Rekognition** - Face detection + indexing
- **Cloudflare Workers** - Orchestration
- **Cloudflare Queues** - Async processing

---

## Critical Decision 1: Upload Sources

| Source | Protocol | Flow |
|--------|----------|------|
| **Web Dashboard** | HTTP POST | Direct to API |
| **Desktop App** | HTTP POST | Direct to API |
| **FTP (Pro cameras)** | FTP | VPS proxy → API |
| **Lightroom Plugin** | HTTP POST | Direct to API |

**All paths converge to same API endpoint:** `POST /api/events/:id/photos`

---

## Critical Decision 2: Upload Flow

```
Client                    API                     R2
   │                       │                       │
   │  1. multipart/form-data                       │
   │──────────────────────►│                       │
   │                       │                       │
   │                       │  2. Validate (see below)
   │                       │                       │
   │                       │  3. Deduct credit     │
   │                       │                       │
   │                       │  4. Stream to R2      │
   │                       │──────────────────────►│
   │                       │                       │
   │                       │  5. Insert photo record (pending)
   │                       │                       │
   │  6. Return {id, status: pending}              │
   │◄──────────────────────│                       │
   │                       │                       │
   │                       │  7. Queue processing  │
   │                       │                       │
```

**Validation order:**
1. Auth (photographer owns event)
2. Event published
3. Upload window open (between start/end datetime)
4. Credit balance >= 1
5. File type (JPEG, PNG, HEIC, WebP)
6. File size <= 50MB

**Credit deducted BEFORE R2 upload** - prevents race conditions.

---

## Critical Decision 3: Storage Structure

**R2 bucket:** `facelink-photos`

**Key format:**
```
{event_id}/{photo_id}.{ext}

Example:
550e8400-e29b-41d4-a716-446655440000/7c9e6679-7425-40de-944b-e07fc1f90ae7.jpg
```

**Why this structure:**
- Event-scoped for easy bulk deletion on expiry
- UUID prevents enumeration
- Extension preserved for content-type

**No variants stored** - use Cloudflare Images for on-demand transforms.

---

## Critical Decision 4: Why Queue? (Rekognition Rate Limits)

**Problem:** AWS Rekognition has strict TPS (transactions per second) limits:

| API | ap-southeast-1 (Singapore) | us-west-2 (Oregon) |
|-----|---------------------------|---------------------|
| **IndexFaces** | 5 TPS | 50 TPS |
| **SearchFacesByImage** | 5 TPS | 50 TPS |
| **DetectFaces** | 25 TPS | 100 TPS |

**Region Decision: us-west-2 (Oregon)**
- **10x throughput advantage** (50 TPS vs 5 TPS)
- Latency trade-off: +150-200ms per call (acceptable for <3s search target)
- Zero additional cost (R2 egress to AWS is free)
- PDPA compliant (no data residency requirement in Thailand)

**Scenario:** Photographer bulk uploads 500 photos
- Workers are parallel → could spike 100+ concurrent Rekognition calls
- At 50 TPS limit → `ProvisionedThroughputExceededException`
- AWS docs recommend: *"use a queueing serverless architecture to smooth traffic"*

**Solution:** Queue with rate-limited consumer

**Queue:** Cloudflare Queues (`photo-processing`)

**Consumer config:**
- `max_batch_size`: 25 (process 25 photos per batch)
- `max_concurrency`: 1 (single consumer - simpler coordination)
- `max_wait_time_ms`: 0 or omit (immediate dispatch, no artificial delay)
- Effective rate: ~40-45 TPS (safe under 50 TPS limit)

**Job payload:**
```json
{
  "photo_id": "uuid",
  "event_id": "uuid",
  "r2_key": "event_id/photo_id.jpg"
}
```

**Processing steps:**

```
Queue Consumer                DB                    Rekognition (us-west-2)
      │                        │                         │
      │  1. Update status=processing                     │
      │───────────────────────►│                         │
      │                        │                         │
      │  2. IndexFaces (detects + indexes + returns attrs)
      │     - Auto-detects all faces in image            │
      │     - Indexes each to collection                 │
      │     - Returns all face attributes                │
      │─────────────────────────────────────────────────►│
      │                        │                         │
      │  3. Insert face records (with all attributes)    │
      │───────────────────────►│                         │
      │                        │                         │
      │  4. Update photo (status=ready, face_count)      │
      │───────────────────────►│                         │
      │                        │                         │
      │  5. Update event stats │                         │
      │───────────────────────►│                         │
      │                        │                         │
      │  6. Notify via WebSocket (if connected)          │
      │                        │                         │
```

**Key insight: IndexFaces does it all**
- **Single API call** - no need for separate DetectFaces
- IndexFaces automatically detects faces AND indexes them
- Returns all face attributes via `DetectionAttributes: ['ALL']`
- 50% fewer API calls = 2x faster processing

**Why not direct call from Worker?**
- Workers parallelize automatically
- Can't control outbound request rate
- Bulk upload = instant spike = throttling
- Queue smooths traffic, handles backpressure

**Rate limiting configuration:**

| Layer | Setting | Value | Purpose |
|-------|---------|-------|---------|
| **Queue (wrangler.toml)** | `queue` | `photo-processing` | Queue name |
| | `max_batch_size` | 25 | Photos per worker invocation |
| | `max_concurrency` | 1 | Single consumer instance |
| | `max_retries` | 3 | Retry failed photos 3x |
| | `dead_letter_queue` | `photo-processing-dlq` | Failed after retries |
| | `max_wait_time_ms` | 0 or omit | Immediate dispatch, no wait |
| **Worker (Bottleneck library)** | `maxConcurrent` | 25 | Max API calls in-flight simultaneously |
| | `minTime` | 20 | Min 20ms spacing between starts |
| | `reservoir` | 50 | Start with 50 tokens |
| | `reservoirRefreshAmount` | 50 | Refill to 50 tokens |
| | `reservoirRefreshInterval` | 1000 | Refill every 1 second (1000ms) |

**Why three rate limits in worker?**
- `maxConcurrent: 25` - Prevents too many simultaneous in-flight requests (max 25 waiting for response)
- `minTime: 20` - Smooths distribution (20ms spacing = max 50 starts/sec)
- `reservoir: 50/1s` - Hard cap at 50 calls per second (matches AWS quota exactly)

**Combined effect:** Guaranteed ≤50 TPS with smooth, evenly-distributed load

**Behavior:**
- Sparse uploads (2 photos): Process immediately, no artificial wait
- Bulk uploads (500 photos): Process in ~10-15 seconds total (40-45 TPS effective rate)
- Single consumer = simple coordination (no distributed rate limiting needed)
- All three limits enforced within single worker instance

---

## Critical Decision 5: Rekognition Integration

**Region:** us-west-2 (Oregon)

**Collection:** 1 per event, created on event publish

**Collection ID:** `facelink-{event_uuid}`

**IndexFaces call (single API call does everything):**
```javascript
{
  CollectionId: 'facelink-{event_uuid}',
  Image: {
    S3Object: {
      Bucket: 'facelink-photos',
      Name: '{event_id}/{photo_id}.jpg'
    }
    // OR
    Bytes: base64EncodedImageData  // For non-S3 sources
  },
  ExternalImageId: photo_id,
  DetectionAttributes: ['ALL'],  // Returns all face attributes
  MaxFaces: 100,
  QualityFilter: 'AUTO'
}
```

**What IndexFaces returns:**
- `FaceRecords[]` - Array of detected faces
  - `Face` - Stored face metadata (FaceId, BoundingBox, Confidence)
  - `FaceDetail` - All facial attributes (when DetectionAttributes: ['ALL'])

**Face attributes stored (all from FaceDetail):**
- Demographics: age_low, age_high, gender, gender_confidence
- Expression: smile, smile_confidence, emotions_json (array with all emotions + confidence)
- Eyes: eyes_open, eyes_open_confidence, eyeglasses, eyeglasses_confidence, sunglasses, sunglasses_confidence
- Facial hair: beard, beard_confidence, mustache, mustache_confidence
- Mouth: mouth_open, mouth_open_confidence
- Quality: brightness, sharpness
- Pose: pitch, roll, yaw
- Occlusion: face_occluded, face_occluded_confidence
- Eye direction: eye_direction_pitch, eye_direction_yaw, eye_direction_confidence
- Landmarks: landmarks_json (array of 27-29 facial landmark points)

See `01_data_schema.md` faces table for full schema.

**Performance:**
- IndexFaces latency: ~500-700ms per call (us-west-2 from Thailand)
- Single API call per photo (vs 2 calls in old architecture)
- 500 photos processed in ~10-15 seconds with queue rate limiting

---

## Critical Decision 6: Image Delivery

**Original downloads:**
- Generate R2 signed URL (1 hour expiry)
- Client downloads directly from R2

**Thumbnails/gallery display:**
- Cloudflare Images on-demand transforms
- URL pattern: `/cdn-cgi/image/width=400,quality=80/{r2_url}`
- No signed URL (Cloudflare Images has internal R2 access)

**CDN caching:**
- Signed URLs: Cache 1 day (private)
- Transforms: Cache 30 days (immutable)

**Business rules:** See `00_business_rules.md` Section 8 (Delivery Tracking)

---

## Critical Decision 7: Face Search

**Endpoint:** `POST /api/search`

**Input:** Selfie image + event access code

**Flow:**
```
1. Validate event access
2. Check cache (event_id + selfie_hash)
3. If cached → return cached results
4. SearchFacesByImage against event collection
5. Get matching face_ids + similarity scores
6. Lookup photos by face_ids
7. Cache results
8. Return photos sorted by similarity
```

**Rekognition SearchFacesByImage:**
```
Input: Selfie image, CollectionId
MaxFaces: 100
FaceMatchThreshold: 70 (TBD - tune during testing)
Output: Array of {FaceId, Similarity}
```

**Cache:**
- Key: `search:{event_id}:{selfie_hash}`
- TTL: Until event expires (1 month from start)
- Storage: KV or D1

---

## Critical Decision 8: FTP Proxy

**Server:** Self-hosted VPS (DigitalOcean, $4/month)

**Role:** Thin proxy, no storage

**Auth:**
- Username: `{photographer_id}_{event_id}`
- Password: Generated token (stored in DB, per-event)

**Flow:**
```
Camera → FTP Server → Validate creds with API → Stream to API upload endpoint
```

**No local storage** - files streamed directly to API.

**Monitoring:** Health check endpoint, alert on failure.

---

## Critical Decision 9: Failure Handling

**Upload failure (before R2):**
- No credit charged
- Return error to client

**Upload failure (after credit, before R2):**
- Shouldn't happen (credit + R2 in same transaction)
- If it does: credit already deducted, no refund

**Processing failure:**
- Photo status = `failed`
- Store error in `processing_error`
- Credit NOT refunded (cost already incurred)
- Photographer notified

**Retry policy:**
- Auto-retry 3x with exponential backoff
- After 3 failures: mark as failed, stop

---

## Critical Decision 10: Cleanup on Event Expiry

**Trigger:** Daily cron job

**When:** 1 month after event start_datetime

**Actions:**
1. Delete Rekognition collection
2. List all R2 objects with prefix `{event_id}/`
3. Bulk delete R2 objects
4. Delete face records from DB
5. Delete search session records
6. Mark event as expired

**Order matters:** Delete Rekognition first (prevents new searches), then R2.

---

## Photo Status Lifecycle

```
pending → processing → ready
                    ↘ failed
```

| Status | Meaning |
|--------|---------|
| `pending` | Uploaded to R2, waiting for queue |
| `processing` | Queue picked up, calling Rekognition |
| `ready` | Faces indexed, searchable |
| `failed` | Processing failed after retries |

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Upload response | < 2s | Return `pending` status immediately |
| Processing time (single photo) | < 2s | IndexFaces + DB updates |
| Processing time (500 photos bulk) | ~10-15s | Queue rate-limited to 40-45 TPS |
| Search response | < 3s | SearchFacesByImage + DB lookup |
| Thumbnail generation | < 500ms | Cloudflare Images on-demand transform |

**Throughput:**
- IndexFaces: 40-45 TPS sustained (us-west-2, 50 TPS quota)
- SearchFacesByImage: 40-45 TPS sustained
- Can handle 10+ concurrent events uploading simultaneously

---

## What's NOT in This Doc

Implementation details for CONTEXT files:
- R2 SDK code
- Rekognition SDK code
- Queue consumer implementation
- Cloudflare Images URL generation
- FTP server setup
- Retry logic implementation

---

## References

- `docs/tech/03_tech_decisions.md` - R2, Rekognition, Workers decisions
- `dev/tech/00_flows.md` - Flow #4 (upload), #5 (FTP), #6 (search)
- `dev/tech/00_business_rules.md` - Validation rules, processing rules
- `dev/tech/01_data_schema.md` - Photos table, faces table
- `dev/research/rekognition_embedding_export.md` - Rekognition API details
