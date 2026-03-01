# Image Pipeline Enhancement Plan

## Overview

Add auto-edit, improve LUT performance, and add upscaling capabilities to the FrameFast image pipeline by consolidating processing on Modal (serverless Python).

## Goals

1. **Auto-edit** - Automatic color/exposure correction (like Lightroom "Auto")
2. **LUT application** - Faster processing (native Python vs Wasm)
3. **Upscaling** - Optional face-aware upscaling (Real-ESRGAN)

## R2 Path Structure

```
events/{eventId}/{photoId}/
├── original.jpeg        # Always present (normalized original)
└── processed.jpeg       # Optional (only if pipeline enabled)
```

## Pipeline Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                               UPLOAD FLOW (unchanged)                         │
│  Client → POST /presign → R2 (uploads/) → Queue notification                 │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          UPLOAD CONSUMER (refactored)                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  1. Fetch from uploads/                                                       │
│  2. Extract metadata (EXIF, dimensions)                                      │
│  3. IF pipeline disabled:                                                     │
│     └── Normalize via CF Images                                              │
│     └── Save to events/{eventId}/{photoId}/original.jpeg                     │
│  4. IF pipeline enabled:                                                      │
│     └── Normalize via CF Images                                              │
│     └── Save to events/{eventId}/{photoId}/original.jpeg                     │
│     └── Call Modal with image + options (auto-edit, LUT, upscale)            │
│     └── Save result to events/{eventId}/{photoId}/processed.jpeg             │
│  5. Create photo record                                                       │
│  6. Deduct credits                                                            │
│  7. Enqueue to face detection                                                │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

## DB Schema Changes

```typescript
// photos.ts - add fields
pipelineApplied: jsonb().$type<{
  autoEdit: boolean;
  lutId: string | null;
  upscale: boolean;
} | null>().default(null),
```

## Event Settings (extended)

```typescript
// events.ts - extend EventSettings
imagePipeline?: {
  enabled: boolean;
  autoEdit: boolean;           // Enable auto color/exposure correction
  lutId: string | null;        // Optional LUT to apply
  lutIntensity: number;        // 0-100
  upscale: boolean;            // Enable 2x upscaling
};
```

## Modal Service

### Deployed Endpoints

- **Process**: `https://putto11262002--framefast-image-pipeline-process.modal.run` 🔑
- **Health**: `https://putto11262002--framefast-image-pipeline-health.modal.run` 🔑

### Authentication

Proxy auth required. Set in Infisical/Terraform:

- `MODAL_KEY` - Token ID
- `MODAL_SECRET` - Token Secret

Create token at: https://modal.com/settings/proxy-auth-tokens

### API Request

```bash
curl -X POST https://putto11262002--framefast-image-pipeline-process.modal.run \
  -H "Modal-Key: $MODAL_KEY" \
  -H "Modal-Secret: $MODAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "image_base64": "<base64>",
    "options": {
      "auto_edit": true,
      "style": "vibrant",
      "contrast": 1.2,
      "saturation": 1.3
    }
  }'
```

### Available Style Presets

| Preset          | Contrast | Saturation | Use Case      |
| --------------- | -------- | ---------- | ------------- |
| `neutral`       | 1.0      | 1.0        | No style      |
| `warm`          | 1.1      | 1.15       | Golden hour   |
| `cool`          | 1.1      | 1.1        | Cool tones    |
| `vibrant`       | 1.2      | 1.4        | Punchy colors |
| `film`          | 0.95     | 0.85       | Nostalgic     |
| `portrait`      | 1.05     | 1.1        | Skin-friendly |
| `high_contrast` | 1.4      | 1.1        | Dramatic      |
| `soft`          | 0.9      | 0.95       | Soft/dreamy   |

### Endpoints

```python
@app.function()
def process_image(
    image_bytes: bytes,
    options: ProcessOptions,
) -> ProcessResult:
    """
    Process image with optional auto-edit, LUT, and upscale.

    Returns processed image bytes.
    """
```

### Processing Steps

1. **Normalize** - Ensure consistent format (always)
2. **Auto-edit** - Pillow-based color/exposure correction (optional)
3. **LUT** - Apply color grade via colour-science (optional)
4. **Upscale** - Real-ESRGAN via ONNX or Replicate (optional)

### Cost Estimate

| Volume         | Modal Cost |
| -------------- | ---------- |
| 10K images/mo  | ~$2-5      |
| 50K images/mo  | ~$10-25    |
| 100K images/mo | ~$20-50    |

## Implementation Phases

### Phase 1: Modal Service Prototype ✅ (Complete)

- [x] Create Modal app structure
- [x] Implement auto-edit (Pillow) with style presets
- [x] Implement LUT application (colour-science)
- [x] Add upscaling placeholder (Pillow Lanczos - Real-ESRGAN deferred)
- [x] Test with sample images locally
- [x] Deploy to Modal
- [x] Enable proxy auth (`requires_proxy_auth=True`)
- [x] Parallel stress test (10/10 success)
- [ ] Add Modal secrets to Terraform infra (Infisical)
  - `MODAL_KEY` - Proxy Auth Token ID
  - `MODAL_SECRET` - Proxy Auth Token Secret
  - Create token at: https://modal.com/settings/proxy-auth-tokens

### Phase 2: Integration ✅ (Complete)

- [x] Add Modal client to API (`src/api/src/lib/modal-client.ts`)
- [x] Update upload-consumer to use Modal
- [x] Update R2 path structure (`events/{eventId}/{photoId}/original.jpeg` and `processed.jpeg`)
- [x] Add DB schema changes (`pipelineApplied` on photos, extended `colorGrade` on events)
- [x] Create new API endpoint (`GET/PUT /events/:id/image-pipeline`)
- [x] Create UI component (`ImagePipelineCard.tsx`)
- [x] Create hooks (`useEventImagePipeline.ts`, `useUpdateEventImagePipeline.ts`)
- [x] Update color tab to use new ImagePipelineCard component
- [x] Add `MODAL_KEY`/`MODAL_SECRET` to Bindings type

### Phase 3: Cleanup & Deployment

- [ ] Remove Photon/Wasm LUT code
- [ ] Migration script for existing photos (optional)
- [ ] Update photo download endpoints
- [ ] Add `MODAL_KEY`, `MODAL_SECRET` to Terraform external_secrets
- [ ] Tests for upload-consumer changes
- [ ] Commit and create PR

## Files Created/Modified

### New Files (Created)

- `apps/modal/` - Modal service directory
  - `pyproject.toml` - UV project config
  - `src/image_pipeline/main.py` - Modal endpoint with auth
  - `src/image_pipeline/auto_edit.py` - Auto-edit with style presets
  - `src/image_pipeline/lut.py` - LUT application (vectorized numpy)
  - `src/image_pipeline/upscale.py` - Placeholder (deferred)
- `src/api/src/lib/modal-client.ts` - Modal API client
- `src/api/src/routes/events/image-pipeline-schema.ts` - Zod schema for new API
- `src/dashboard/src/hooks/events/useEventImagePipeline.ts` - Fetch hook
- `src/dashboard/src/hooks/events/useUpdateEventImagePipeline.ts` - Mutation hook
- `src/dashboard/src/components/events/ImagePipelineCard.tsx` - UI component

### Modified Files

- `src/api/src/queue/upload-consumer.ts` - Modal integration, new R2 paths
- `src/api/src/routes/events/index.ts` - Added `GET/PUT /:id/image-pipeline` routes
- `src/api/src/routes/events/color-grade-schema.ts` - Added autoEdit/style fields
- `src/api/src/types.ts` - Added MODAL_KEY/MODAL_SECRET to Bindings
- `src/db/schema/events.ts` - Extended `EventSettings.colorGrade`
- `src/db/schema/photos.ts` - Added `PipelineApplied` type and column
- `src/db/drizzle/0020_dapper_lady_mastermind.sql` - Migration (merged)
- `src/dashboard/src/routes/events/[id]/color/index.tsx` - Use ImagePipelineCard

### Files to Remove (Phase 3)

- `src/api/src/lib/images/color-grade.ts` - Photon LUT code (keep LUT parsing)

## Open Questions

- [ ] Auto-edit quality: Compare with Cloudinary VIESUS?
- [ ] Migration: Convert existing photos to new structure?
- [ ] Upscaling: Add Real-ESRGAN (GPU) later if needed?
