# 013 - Recognition Grid Search Results (Current Model)

Date: 2026-01-22

## Objective

- Constraint: `Recall@20 >= 90%`
- Optimize: minimize `Avg FP@10`

Eval settings:

- Uses production-like `findImagesByFace()` aggregation.
- `MAX_RESULTS=20`, `EVAL_KS=10,20`
- Dataset: small ground truth (5 identities, 20 index photos, 10 queries).

## Search Threshold Sweep (INDEX_QUALITY_FILTER=none)

Key points from threshold sweep:

- `MIN_SIMILARITY=0.93` meets recall constraint but has high false positives:
  - `Recall@20 ≈ 94.91%`
  - `Avg FP@10 ≈ 4.30`
  - `Precision@10 ≈ 57%`
- `MIN_SIMILARITY=0.95` reduces FP slightly, but recall falls below constraint:
  - `Recall@20 ≈ 82.99%`
  - `Avg FP@10 ≈ 3.90`
- `MIN_SIMILARITY=0.96+` reduces FP substantially, but recall collapses further:
  - At `0.96`: `Avg FP@10 ≈ 1.70`, `Recall@20 ≈ 65.97%`
  - At `0.97`: `Avg FP@10 ≈ 0.30`, `Recall@20 ≈ 49.78%`

## Indexing Parameter Sweep

### INDEX_MIN_CONFIDENCE

Swept `INDEX_MIN_CONFIDENCE` in `[0.5, 0.6, 0.7, 0.8]` with `INDEX_QUALITY_FILTER=none`.

Result: minimal impact on `Avg FP@10` while meeting the recall constraint. The best recall region still required low search thresholds (~0.90-0.94) and kept FP high (~4+ in top-10).

### INDEX_MAX_FACES

Swept `INDEX_MAX_FACES` in `[5, 10, 20, 50, 100]`.

Result: limited improvement. FP remained high when recall was high.

### INDEX_QUALITY_FILTER + FACE_MIN_AREA_RATIO_AUTO

Swept `INDEX_QUALITY_FILTER=auto` with `FACE_MIN_AREA_RATIO_AUTO` in `[0.0005, 0.001, 0.0025, 0.005]`.

Result:

- very low ratios behaved similarly to `none` (no FP improvement)
- higher ratios reduced recall significantly (often failing the recall constraint)

## Best result under the constraint (current model)

Best region observed that satisfies `Recall@20 >= 90%`:

- `INDEX_QUALITY_FILTER=none`
- `MIN_SIMILARITY ~ 0.90-0.94`

Representative point:

- `MIN_SIMILARITY=0.94`
  - `Recall@20 ≈ 93.66%`
  - `Avg FP@10 ≈ 4.30`
  - `Precision@10 ≈ 57%`

## Conclusion

With the current face-api.js embeddings, indexing/search tuning alone does not reach both:

- high recall (`Recall@20 >= 90%`)
- low false positives (`Avg FP@10 <= ~1`)

To move the frontier, likely next steps:

- use stronger embeddings (e.g. DeepFace/InsightFace models)
- or change indexing selection strategy (e.g. prefer largest faces, add more robust quality gating)
