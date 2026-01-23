# 011 - SabaiFace Indexing Filters

Date: 2026-01-22

## Context

For the participant selfie-search flow, returning incorrect photos (false positives) is often caused by noisy faces being indexed:

- tiny background faces
- low-confidence detections
- too many faces per photo

We need indexing-time filters to be effective; otherwise search-time thresholding cannot reliably reduce false positives.

## Changes

### Apply indexing options in SabaiFace adapter

File: `apps/sabaiface/src/adapters/sabaiface/sabaiface-adapter.ts`

- `IndexPhotoParams.options` is now enforced (previously ignored):
  - `minConfidence` filters detections by score
  - `maxFaces` caps faces per photo (sorted by confidence)
  - `qualityFilter: 'auto'` filters out tiny faces via a minimum face area ratio

### Use correct image dimensions

File: `apps/sabaiface/src/core/face-detector.ts`

- `detectFaces()` now includes `imageWidth` / `imageHeight` on each detection.
- SabaiFace adapter uses these dimensions for ratio bounding box conversion.

### Configurable indexing confidence

File: `apps/sabaiface/src/api/routes/faces.ts`

- Indexing min confidence is now configurable via env `INDEX_MIN_CONFIDENCE` (default `0.5`).

## New/Updated knobs

- `INDEX_MIN_CONFIDENCE` (default `0.5`)
- `FACE_MIN_AREA_RATIO_AUTO` (default `0.0025`) applied when `QualityFilter=AUTO`
