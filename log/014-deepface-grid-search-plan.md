# 014 - DeepFace Recognition Service: Grid Search Plan

Date: 2026-01-22

## Goal

Evaluate whether the Python DeepFace-based recognition service (`apps/recognition`) can meet the product objective:

- Constraint: `Recall@20 >= 90%`
- Optimize: minimize `Avg FP@10`

## Approach

1. Ensure the DeepFace service supports the same product-level retrieval surface (selfie -> photos).
2. Run a structured grid search over the highest-leverage knobs:
   - indexing filters (faces per image, min face size, min confidence)
   - search threshold
   - detector backend and model name (if baseline cannot meet objective)
3. Track performance + hardware usage for each run.

## Service surfaces

The service already supports Rekognition-compatible endpoints:

- `POST /collections/{id}/index-faces`
- `POST /collections/{id}/search-faces-by-image`

To support photo-level evaluation and easier debugging, add:

- `POST /collections/{id}/find-images-by-face` (photo-level aggregation)

## Hardware / performance tracking

- Add `/health` and `/metrics` fields for:
  - RSS memory (current + max)
  - CPU time
  - request counts and average latency per endpoint

## Baseline grid (first pass)

Start with a single model + detector:

- `MODEL_NAME=ArcFace`
- `DETECTOR_BACKEND=opencv`

Sweep:

- `MIN_FACE_AREA_RATIO`: 0.0005, 0.001, 0.0025
- `MIN_FACE_CONFIDENCE`: 0.0, 0.3, 0.5
- `INDEX_MAX_FACES_PER_IMAGE`: 5, 10, 20
- `MIN_SIMILARITY`: 0.85, 0.9, 0.93, 0.95, 0.97

Run eval using the existing harness (production-like):

- `apps/sabaiface/tests/manual/test-recognition-eval.ts` (now uses `findImagesByFace`)

## Exit criteria

- If DeepFace meets the objective on the evaluation dataset, proceed to persistence + deployment considerations.
- If DeepFace cannot meet the objective, stop and revisit with a product/tech decision (model choice, compute budget, service shape, or using AWS).
