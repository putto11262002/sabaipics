# Image Pipeline Design

**Status:** Complete
**Last Updated:** 2025-12-08

---

## Overview

```
Upload → Validate → Store → Queue → [Process → Index → Ready]
         ▲                    │
         │                    │
      This doc            See 10_aws_rekognition_integration.md
```

**This doc covers:** Upload through queue (synchronous path)
**For processing:** See `10_aws_rekognition_integration.md` (async path)

**Components:**

- **R2** - Object storage (original photos)
- **Cloudflare Images** - On-demand transforms (thumbnails, resizing)
- **Cloudflare Queues** - Async processing handoff
- **AWS Rekognition** - Face detection + indexing (see `10_aws_rekognition_integration.md`)

---

## Critical Decision 1: Upload Sources

| Source                | Protocol  | Flow            |
| --------------------- | --------- | --------------- |
| **Web Dashboard**     | HTTP POST | Direct to API   |
| **Desktop App**       | HTTP POST | Direct to API   |
| **FTP (Pro cameras)** | FTP       | VPS proxy → API |
| **Lightroom Plugin**  | HTTP POST | Direct to API   |

**All paths converge to same API endpoint:** `POST /api/events/:id/photos`

---

## Critical Decision 2: Upload Flow

```
Client                    API                     R2                Queue
   │                       │                       │                  │
   │  1. multipart/form-data                       │                  │
   │──────────────────────►│                       │                  │
   │                       │                       │                  │
   │                       │  2. Validate          │                  │
   │                       │                       │                  │
   │                       │  3. Deduct credit     │                  │
   │                       │                       │                  │
   │                       │  4. Stream to R2      │                  │
   │                       │──────────────────────►│                  │
   │                       │                       │                  │
   │                       │  5. Insert photo (status=pending)        │
   │                       │                       │                  │
   │                       │  6. Enqueue job       │                  │
   │                       │─────────────────────────────────────────►│
   │                       │                       │                  │
   │  7. Return {id, status: pending}              │                  │
   │◄──────────────────────│                       │                  │
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

**R2 bucket:** `sabaipics-photos`

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

## Critical Decision 4: Queue Job Payload

**Queue:** `photo-processing`

**Job payload:**

```json
{
  "photo_id": "uuid",
  "event_id": "uuid",
  "r2_key": "event_id/photo_id.jpg"
}
```

**Why queue?**

- AWS Rekognition has 50 TPS limit (us-west-2)
- Direct calls from Workers would burst and get throttled
- Queue smooths traffic, handles backpressure
- See `10_aws_rekognition_integration.md` for rate limiting details

**Wrangler config (producer side):**

```jsonc
{
  "queues": {
    "producers": [
      {
        "queue": "photo-processing",
        "binding": "PHOTO_QUEUE",
      },
    ],
  },
}
```

**Enqueue code:**

```typescript
await env.PHOTO_QUEUE.send({
  photo_id: photo.id,
  event_id: event.id,
  r2_key: `${event.id}/${photo.id}.${ext}`,
});
```

---

## Critical Decision 5: Image Delivery

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

## Critical Decision 6: Face Search

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

## Critical Decision 7: FTP Proxy

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

## Critical Decision 8: Upload Failure Handling

**Upload failure (before R2):**

- No credit charged
- Return error to client

**Upload failure (after credit, before R2):**

- Shouldn't happen (credit + R2 in same transaction)
- If it does: credit already deducted, no refund

**Processing failure (after queue):**

- See `10_aws_rekognition_integration.md` for retry/DLQ handling

---

## Critical Decision 9: Cleanup on Event Expiry

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

| Status       | Meaning                         | Set By          |
| ------------ | ------------------------------- | --------------- |
| `pending`    | Uploaded to R2, queued          | Upload endpoint |
| `processing` | Consumer picked up              | Queue consumer  |
| `ready`      | Faces indexed, searchable       | Queue consumer  |
| `failed`     | Processing failed after retries | Queue consumer  |

---

## Performance Targets

| Metric               | Target                                  | Notes                                 |
| -------------------- | --------------------------------------- | ------------------------------------- |
| Upload response      | < 2s                                    | Return `pending` status immediately   |
| Processing time      | See `10_aws_rekognition_integration.md` |                                       |
| Search response      | < 3s                                    | SearchFacesByImage + DB lookup        |
| Thumbnail generation | < 500ms                                 | Cloudflare Images on-demand transform |

---

## References

- `10_aws_rekognition_integration.md` - Queue consumer, rate limiting, Rekognition details
- `00_business_rules.md` - Validation rules, processing rules
- `01_data_schema.md` - Photos table, faces table
- `docs/research/rekognition_collection_pricing.md` - Pricing details
