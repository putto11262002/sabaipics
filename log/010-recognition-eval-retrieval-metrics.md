# 010 - Recognition Eval Retrieval Metrics

Date: 2026-01-22

## Context

SabaiPics needs photo-level retrieval:

- Participants upload a selfie.
- System returns event photos that contain that participant.

Optimizing only rank-based metrics (Rank-1 / Rank-5 / MRR) can hide an important failure mode: returning incorrect photos (false positives). We want explicit visibility into both:

- **Precision** (do not return wrong photos)
- **Recall** (return as many correct photos as possible)

## Change

Updated the recognition eval script to report retrieval metrics at multiple K values and allow threshold/result sweeps via environment variables.

- `apps/sabaiface/tests/manual/test-recognition-eval.ts`
  - `MAX_RESULTS` is now configurable via `MAX_RESULTS` env var (default: `10`).
  - `MIN_SIMILARITY` is configurable via `MIN_SIMILARITY` env var (default: `0.4`).
  - New retrieval metrics at configurable K values (`EVAL_KS`, default: `1,5,10,50`, capped by `MAX_RESULTS`):
    - `Precision@K`
    - `Recall@K`
    - `Avg FP@K`
    - `FP-free rate@K` (fraction of queries with zero false positives in top-K)
    - `Avg Returned@K`
    - `Empty result rate` (queries returning zero results)

## How To Use

Example: prioritize “don’t return wrong photos” by raising similarity threshold and requesting more results:

```bash
MIN_SIMILARITY=0.7 MAX_RESULTS=50 EVAL_KS=1,5,10,50 pnpm --filter=@sabaipics/face-recognition test:recognition-eval
```

Notes:

- Recall cannot exceed the number of results requested (`MAX_RESULTS`). If a person appears in 30 photos but `MAX_RESULTS=10`, recall is capped.
