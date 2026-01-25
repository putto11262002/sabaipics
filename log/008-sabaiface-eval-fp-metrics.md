# 008 - SabaiFace Eval False Positive Metrics

Date: 2026-01-22

## Context

The recognition evaluation script (`apps/sabaiface/tests/manual/test-recognition-eval.ts`) previously focused on rank-based accuracy (Rank-1 / Rank-5 / MRR). This made it hard to see when the system returned incorrect matches (false positives), especially when a correct match still appeared somewhere in the top-K.

## Change

- Added explicit false-positive visibility to the recognition eval output:
  - `Precision@1`, `Precision@5`, `Precision@10`
  - `Avg False Positives@10`
  - `Avg Returned@10`
- Metrics use the existing ground truth definition:
  - Positive set per query = `containedInIndexImages`
  - Any returned image not in that set counts as a false positive
- Results are de-duplicated by `externalImageId` (order-preserving) before calculating precision/false positives.

## How To Run

1. Start the SabaiFace server:
   - `pnpm --filter=@sabaipics/face-recognition dev`
2. Generate ground truth (Kaggle dataset path required):
   - `export SABAIFACE_DATASET_PATH=/path/to/kaggle/dataset`
   - `pnpm --filter=@sabaipics/face-recognition eval:generate-ground-truth`
3. Run the eval:
   - `export SABAIFACE_ENDPOINT=http://localhost:8086`
   - `pnpm --filter=@sabaipics/face-recognition test:recognition-eval`
