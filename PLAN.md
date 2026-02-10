# Auto Color Grading (Slice 3) Plan

Date: 2026-02-10

Goal

- Give photographers a Studio-managed LUT library (.cube upload or reference image -> LUT generation).
- Let events enable color grading and pick a LUT + per-event settings.
- Apply color grading automatically to NEW photo uploads for that event during normalization.
- Provide LUT preview in Studio and Event settings via ephemeral image upload (no persistence).

Non-goals (v1)

- No retroactive reprocessing of existing photos.
- No "Lab" that saves sample images or produces new LUTs from tweaks.
- No shared "typed upload infra" refactor; duplication is acceptable.

---

## UX / User Journey

Studio (LUTs)

- Create LUT
  - Upload .cube OR upload reference image
  - Upload is direct-to-R2 via presigned PUT
  - Async processing via queue; UI polls status
- Manage LUTs
  - List/search, rename
  - Download LUT via presigned GET
  - Delete LUT (blocked if in-use by any event)
- Preview LUT
  - Upload a sample image (ephemeral)
  - Adjust intensity + include-luminance; preview renders server-side

Event Settings (Color Grade)

- Enable/disable color grade
- Select LUT from Studio library
- Set per-event intensity + include-luminance
- Optional preview (same ephemeral upload flow as Studio)

Photo Upload Pipeline

- For new uploads in an event with color grade enabled and a valid LUT selected:
  - Apply LUT during normalization in `upload-processing` consumer
  - Store final graded JPEG in R2; proceed with credit deduction + DB insert as normal

---

## Data Model

### 1) New table: photographer LUT library

Add table (name TBD; suggested: `photo_luts`) in `packages/db/src/schema/`.

Required fields (v1)

- `id` (uuid, PK)
- `photographerId` (uuid, FK)
- `name` (text)
- `sourceType` (enum: `cube | reference_image`)
- `status` (enum: `pending | processing | completed | failed | expired`)
- `uploadR2Key` (text, unique) // temp key under `lut-uploads/...`
- `lutR2Key` (text, nullable) // final key under `luts/...`
- `contentType` (text)
- `contentLength` (int)
- `errorCode` (text, nullable)
- `errorMessage` (text, nullable)
- `createdAt`, `expiresAt`, `completedAt` (timestamptz)

Optional metadata (nice-to-have)

- `lutSize` (int)
- `title` (text)
- `domainMin`, `domainMax` (jsonb)
- `sha256` (text)

### 2) Event settings JSONB

Add `settings` (jsonb) to `packages/db/src/schema/events.ts` and type it at the application layer.

Shape (v1)

```ts
type EventSettings = {
  colorGrade?: {
    enabled: boolean;
    lutId: string | null;
    intensity: number; // 0-100
    includeLuminance: boolean;
  };
};
```

Defaults

- `enabled=false`
- `lutId=null`
- `intensity=75`
- `includeLuminance=false`

Note: Event -> LUT relationship is stored in JSONB (no FK). API must validate LUT ownership.

---

## R2 Storage

- Temp uploads: `lut-uploads/{lutId}-{timestamp}`
- Final LUT: `luts/{photographerId}/{lutId}.cube`

---

## API Design

All endpoints require photographer auth unless stated.

### Studio LUT endpoints (new)

- `GET /studio/luts`
  - List LUTs owned by photographer
- `POST /studio/luts/cube/presign`
  - Body: `{ name: string, contentLength: number }`
  - Returns: `{ lutId, putUrl, requiredHeaders, expiresAt }`
- `POST /studio/luts/reference/presign`
  - Body: `{ name: string, contentType: 'image/jpeg'|'image/png'|'image/webp', contentLength: number }`
  - Returns: `{ lutId, putUrl, requiredHeaders, expiresAt }`
- `GET /studio/luts/status?id={lutId}`
  - Poll LUT processing status
- `PATCH /studio/luts/:id`
  - Rename LUT
- `GET /studio/luts/:id/download`
  - Returns presigned GET URL for final `.cube`
- `DELETE /studio/luts/:id`
  - Block if any event references it; else delete DB row + R2 object

### LUT preview endpoint (ephemeral)

- `POST /studio/luts/:id/preview`
  - Form: `{ image: File, intensity: number, includeLuminance: boolean }`
  - Response: `image/jpeg` (preview-sized)
  - No persistence of the sample image

### Event color grade endpoints

- `GET /events/:id/color-grade`
  - Returns effective settings + selected LUT summary
- `PUT /events/:id/color-grade`
  - Body: `{ enabled, lutId, intensity, includeLuminance }`
  - Validates event ownership and LUT ownership (if `lutId` set)

---

## Queue / Async Processing

### New queue: `lut-processing-*`

Add a new queue consumer similar to logo processing.

Flow

- R2 notification for `lut-uploads/` emits an event to `lut-processing-*` queue
- Consumer (`apps/api/src/queue/lut-processing-consumer.ts`) does:
  - find LUT row by `uploadR2Key`
  - if expired: mark `expired`, delete temp object, ack
  - if `sourceType=cube`:
    - download text -> parse/validate `.cube` -> write final LUT -> mark completed
  - if `sourceType=reference_image`:
    - download bytes -> validate magic bytes -> decode -> compute stats -> generate LUT -> write final -> mark completed
  - failures:
    - non-retryable: mark failed + error details, delete temp, ack
    - retryable: throw so queue retries

Wrangler wiring

- Add producer/consumer entries in `apps/api/wrangler.jsonc` for dev/staging/prod.
- Add routing in `apps/api/src/index.ts` based on `batch.queue.startsWith('lut-processing')`.

Ops wiring (required)

- Add Cloudflare R2 bucket notification:
  - Prefix: `lut-uploads/`
  - Destination: `lut-processing-*` queue

---

## Photo Upload Pipeline Integration

### Extend photon normalization with a post-process hook

Modify `apps/api/src/lib/images/normalize.ts`:

- Extend `normalizeWithPhoton(imageBytes, postProcess?)` where `postProcess` receives resized RGBA pixels.
- Pipeline:
  - photon decode -> resize -> get_raw_pixels -> postProcess -> new PhotonImage(raw, w, h) -> encode JPEG

### Apply LUT during `upload-processing` consumer

Update `apps/api/src/queue/upload-consumer.ts`:

- Load event settings; if color grade enabled + LUT selected:
  - load LUT row from DB; ensure status=completed
  - fetch `.cube` from R2; parse and cache parsed LUT per batch
  - pass `postProcess` to `normalizeWithPhoton`
- If LUT missing/invalid:
  - warn to Sentry and proceed without grading (do not block photo uploads)

Performance note (v1 defaults)

- LUT size: prefer 33 (safe) for generated LUTs; accept common sizes for uploaded LUTs.
- Include-luminance: implement a cheap luma preservation (Rec.709) per pixel rather than full per-pixel LAB.

---

## Dashboard (UI)

### Sidebar + routing

- Add `Studio` nav item in `apps/dashboard/src/components/shell/app-sidebar.tsx`
- Add route in `apps/dashboard/src/router.tsx` (e.g. `/studio/luts`)

### Studio LUT page

- LUT list with statuses
- New LUT modal (cube vs reference)
  - Uses presign -> PUT -> poll (pattern matches logo upload in Event details)
- Row actions: Preview, Download, Rename, Delete
- Preview modal
  - Upload sample image (ephemeral)
  - Intensity + include-luminance controls

### Event details: Color Grade card

Add a new section to `apps/dashboard/src/routes/events/[id]/details/index.tsx`:

- Toggle enable
- Select LUT (from `GET /studio/luts` completed)
- Intensity + include-luminance
- Preview button (same modal)
- Save calls `PUT /events/:id/color-grade`

---

## Stacked PR Plan (work order)

PR 1: DB schema + migrations

- Add `events.settings` JSONB
- Add `photo_luts` table
- Add drizzle migrations + exports

PR 2: Core LUT library (parse/apply/generate) + tests

- `.cube` parser/validator
- LUT applier (trilinear + intensity + luma preservation)
- Reference image -> LUT generator (queue-only)

PR 3: LUT queue consumer + wrangler wiring

- `apps/api/src/queue/lut-processing-consumer.ts`
- `apps/api/src/index.ts` queue routing
- `apps/api/wrangler.jsonc` queue definitions
- Ops note: R2 notification wiring for `lut-uploads/`

PR 4: Studio LUT API + preview API

- `/studio/luts` routes
- presign endpoints + status polling
- download presign GET
- preview endpoint (ephemeral upload)

PR 5: Photo pipeline integration

- `normalizeWithPhoton(..., postProcess?)`
- apply LUT in `apps/api/src/queue/upload-consumer.ts`

PR 6: Dashboard UI

- Studio LUT page + preview modal
- Event details color grade section + preview + save

---

## Risks / Mitigations

- Heavy CPU in queues (reference image generation)
  - Separate queue, conservative concurrency
- LUT correctness (DOMAIN_MIN/MAX, odd formatting)
  - Parse + validate strictly; surface actionable error messages to users
- Events referencing deleted LUT ids
  - API validates; upload-consumer falls back to no-grade with warning
