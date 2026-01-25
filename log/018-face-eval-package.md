# 018 - Face Eval Package

## 2026-01-23

- Added `packages/face-eval`: a self-contained evaluation CLI consolidating the old manual scripts.
- `eval run sabaiface --endpoint <url>` evaluates Rekognition-ish HTTP endpoints.
- `eval run aws` evaluates AWS Rekognition via `aws4fetch` (credentials from env; never persisted to metadata).
- Results persist to repo-root `eval/runs/<run_id>.json` and append to `eval/runs/runs.csv` (header created if missing).

### Dataset Generation

- Added `eval dataset generate` command to generate ground-truth JSON from Kaggle dataset.
- Wraps the existing Python script (`apps/sabaiface/scripts/extract-recognition-dataset.py`) which uses numpy for `.npy` parsing.
- Options: `--source`, `--output`, `--people`, `--images`, `--ratio`, `--seed`.
- Updated README with full dataset setup instructions (Kaggle download link, env vars, usage examples).

### Cleanup - Removed Obsolete Eval Scripts

Verified new eval produces identical results to old scripts, then removed:

- `apps/sabaiface/tests/manual/test-recognition-eval.ts` (replaced by `eval run sabaiface`)
- `apps/sabaiface/tests/manual/test-aws-eval.ts` (replaced by `eval run aws`)
- npm scripts: `test:recognition-eval`, `test:aws-eval`

Verified both parameter variants produce matching results:

- High recall (MIN_SIMILARITY=0.94): Recall@20=93.66%, Avg FP@10=4.30
- Low FP (MIN_SIMILARITY=0.97): Recall@20=49.79%, Avg FP@10=0.30

### Server Config Solidification

Moved tuned ML parameters from request-level to server-side env vars:

**New env vars** (with low-FP defaults):

- `SEARCH_MIN_SIMILARITY=0.97` - Search threshold (0-1 scale)
- `INDEX_QUALITY_FILTER=none` - Quality filter mode
- `INDEX_MIN_CONFIDENCE=0.5` - Min detection confidence

**API changes:**

- `FaceMatchThreshold` - Deprecated, logs warning, uses server default
- `QualityFilter` - Deprecated, logs warning, uses server default
- `MaxFaces` - Still client-controlled (UI concern)

**Files modified:**

- `apps/sabaiface/src/server.ts` - Added env vars, exported config object
- `apps/sabaiface/src/api/routes/faces.ts` - Deprecation warnings, server defaults
- `apps/sabaiface/src/adapters/sabaiface/sabaiface-adapter.ts` - Added clarifying comments
