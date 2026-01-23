# 009 - Recognition Service (DeepFace) Bootstrap

Date: 2026-01-22

## Goal

Prototype a new face recognition service using Python + DeepFace, exposing a SabaiFace-compatible API so we can reuse the existing eval harness (`apps/sabaiface/tests/manual/test-recognition-eval.ts`).

## Phase Plan

### Phase 1 - Bootstrap (local dev)

- Create `apps/recognition` as a Python project using `uv`.
- Install dependencies:
  - `fastapi`, `uvicorn[standard]`
  - `deepface`
  - `tf-keras` (required with TensorFlow 2.20+ for `retinaface` / Keras 3 compatibility)
  - `gdown` (DeepFace weight downloads)
- Confirm DeepFace imports successfully.

### Phase 2 - API compatibility MVP

- Implement the minimal endpoints used by the Node SabaiFace provider (`apps/api/src/lib/rekognition/sabaiface-provider.ts`):
  - `POST /collections`
  - `DELETE /collections/{collectionId}`
  - `POST /collections/{collectionId}/index-faces`
  - `POST /collections/{collectionId}/search-faces-by-image`
  - `GET /health`
- Start with in-memory storage (single process) just to validate request/response compatibility.

### Phase 3 - Persistence + vector search

- Add Postgres + `pgvector` storage for face embeddings.
- Keep model/detector/alignment fixed per collection.
- Add ANN index (HNSW) and filter by collection.

### Phase 4 - Evaluation + tuning

- Run existing eval against the new service:
  - Rank-1/Rank-5/MRR
  - Precision@K + false positives (FP@10)
  - Latency (index/search)
- Tune:
  - `MODEL_NAME` (e.g. ArcFace / Buffalo_L)
  - `DETECTOR_BACKEND` (opencv/ssd vs mediapipe/yunet vs retinaface)
  - similarity threshold calibration.

### Phase 5 - Fly.io deployment

- Deploy using Fly.io Dockerfile builder (recommended for ML dependencies).
- Ensure model weights handling:
  - pre-download at build time OR
  - mount a Fly Volume for `~/.deepface/weights`.
- Choose machine sizing for TensorFlow CPU workloads; start with >= 1GB RAM and adjust.

## Notes

- DeepFace is MIT licensed, but it wraps multiple third-party models/detectors with their own licenses; production use requires verifying the selected model + detector licenses.

## Progress

### In-memory API MVP

- Added an in-memory FastAPI implementation under `apps/recognition` that is compatible with the SabaiFace HTTP provider (`apps/api/src/lib/rekognition/sabaiface-provider.ts`):
  - `POST /collections`
  - `DELETE /collections/{collectionId}`
  - `POST /collections/{collectionId}/index-faces`
  - `POST /collections/{collectionId}/search-faces-by-image`
  - `GET /health`
- Added MVP tuning env vars:
  - `INDEX_MAX_FACES_PER_IMAGE`, `QUERY_MAX_FACES_PER_IMAGE`
  - `MIN_FACE_AREA_RATIO`, `MIN_FACE_CONFIDENCE`

### Eval tuning

- Updated eval scripts to allow threshold sweeps via env:
  - `apps/sabaiface/tests/manual/test-recognition-eval.ts` reads `MIN_SIMILARITY` (default `0.4`)
  - `apps/sabaiface/tests/manual/test-aws-vs-recognition.ts` reads `MIN_SIMILARITY` (default `0.4`)
- Generated a smaller ground-truth set for faster iteration using the existing generator:
  - `python3 apps/sabaiface/scripts/extract-recognition-dataset.py --people 5 --images 6 --ratio 0.8`
