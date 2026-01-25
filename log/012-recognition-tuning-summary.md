# 012 - Recognition Tuning Summary (SabaiFace + DeepFace)

Date: 2026-01-22

## Context

SabaiPics is an event photo distribution app:

- Photographer uploads event photos -> system indexes faces per photo
- Participant uploads a selfie -> system returns photos that contain the participant

Primary objective: **do not return photos that do not contain the participant** (minimize false positives), while maintaining high recall.

## Key Findings

### 1) Production search path is photo-level

The real participant flow uses photo-level retrieval, not raw face matches:

- `apps/api/src/routes/events/search.ts` calls `provider.findImagesByFace({ eventId, imageData, maxResults: 50, minSimilarity: 0.8 })`
- `apps/api/src/lib/rekognition/sabaiface-provider.ts` implements `findImagesByFace()` by calling Rekognition-compatible `search-faces-by-image` and aggregating results by `ExternalImageId` (photoId)

Implication: evaluation should score **photoId retrieval quality**, not just face-level rank.

### 2) Threshold unit bug (fixed)

Observed symptom: changing similarity threshold often had no effect.

Root cause:

- Domain `minSimilarity` is `0..1`
- `similarityToDistance()` utility expects `0..100`

Fix:

- `apps/sabaiface/src/adapters/sabaiface/sabaiface-adapter.ts` now converts `0..1` -> `0..100` before calling `similarityToDistance()`.

Also fixed:

- `apps/sabaiface/src/api/routes/faces.ts` now uses `FaceMatchThreshold ?? 80` instead of `|| 80` to preserve explicit 0.

### 3) Indexing options were ignored (fixed)

Index-time knobs exist in request types (`maxFaces`, `minConfidence`, `qualityFilter`) but were not previously enforced by the SabaiFace adapter.

Fix:

- `apps/sabaiface/src/adapters/sabaiface/sabaiface-adapter.ts` now enforces:
  - `minConfidence` filter
  - `maxFaces` cap
  - `qualityFilter='auto'` filters tiny faces via an area ratio threshold
- `apps/sabaiface/src/core/face-detector.ts` now includes `imageWidth/imageHeight` in detections so bbox ratio conversion and face-size filtering are correct.

### 4) Eval improvements

- `apps/sabaiface/tests/manual/test-recognition-eval.ts`
  - Added retrieval metrics at multiple K (Precision/Recall/Avg FP/FP-free rate)
  - Added env knobs for `MIN_SIMILARITY`, `MAX_RESULTS`, and indexing options
  - Switched search path to use `findImagesByFace()` (production-like)

## DeepFace prototype (Python)

Prototype service created at `apps/recognition` (uv + FastAPI + DeepFace) to explore stronger embedding models.

Result: the MVP was not yet competitive vs the current SabaiFace baseline on CPU and needs more work (better model backends like Buffalo_L, better detector backend, better calibration, persistence/indexing).

## Current baseline model

SabaiFace (Node) uses face-api.js models:

- detector: SSD MobileNetV1 (`ssd_mobilenetv1_model`)
- landmarks: 68 (`face_landmark_68_model`)
- embedding: 128-D (`face_recognition_model`)

## Current best achievable frontier (small eval set)

Using the small ground truth (5 identities, 20 index photos, 10 queries), the current face-api.js embedding shows a strong tradeoff:

- To satisfy high recall (e.g. Recall@20 >= 90%), we must keep `MIN_SIMILARITY` low enough that false positives remain high.
- Increasing threshold reduces false positives but recall drops below the constraint.

Practical implication: to move the frontier (high recall + low FP), we likely need stronger embeddings (or different indexing selection strategy), not only threshold tuning.
