# 015 - DeepFace Baseline Grid Results (CPU, In-Memory)

Date: 2026-01-22

## Goal

- Constraint: `Recall@20 >= 90%`
- Optimize: minimize `Avg FP@10`

Eval:

- Uses `apps/sabaiface/tests/manual/test-recognition-eval.ts` (photo-level, `findImagesByFace`)
- `MAX_RESULTS=20`, `EVAL_KS=10,20`
- Small ground truth set (5 identities, 20 index photos, 10 queries)

## Configs tested

We started the Python service (`apps/recognition`) with multiple DeepFace configurations and ran a similarity sweep.

Common:

- `INDEX_MAX_FACES_PER_IMAGE=20`, `QUERY_MAX_FACES_PER_IMAGE=1`

Tested model/detector combos:

- ArcFace + opencv
- ArcFace + ssd
- Facenet512 + opencv
- SFace + opencv

Also tested variations:

- `MIN_FACE_AREA_RATIO` (0.0005 vs 0.001)
- `MIN_FACE_CONFIDENCE` (0.0 vs 0.3)

## Results summary

### ArcFace + opencv

- Best observed recall (low threshold):
  - `minSimilarity=0.2` -> `Recall@20 ~ 67.66%`, `Avg FP@10 ~ 4.90`
- Could not reach `Recall@20 >= 90%`.

Performance/footprint (single run):

- `max_rss_mb ~ 5884`
- `avg_ms.index_faces ~ 2545ms`
- `avg_ms.search_faces_by_image ~ 1978ms`

### ArcFace + ssd

- High recall region:
  - `minSimilarity=0.8` -> `Recall@20 = 100%`, `Avg FP@10 = 5.50`
  - `minSimilarity=0.9` -> `Recall@20 = 98%`, `Avg FP@10 = 5.50`
- False positives stayed high at the recall-satisfying thresholds.
- Increasing threshold to reduce FP collapsed recall (e.g. `0.97` -> `Recall@20 ~ 49%`).

Performance/footprint:

- Much faster and lower memory than opencv:
  - `max_rss_mb ~ 1316`
  - `avg_ms.index_faces ~ 328ms`
  - `avg_ms.search_faces_by_image ~ 332ms`

### Facenet512 + opencv

- Best observed recall:
  - `minSimilarity=0.05-0.2` -> `Recall@20 ~ 85%`, `Avg FP@10 ~ 4.80`
- Did not reach `Recall@20 >= 90%`.

### SFace + opencv

- Recall dropped quickly as threshold increased.
- Did not reach the recall constraint.

## Conclusion

On CPU and with the tested base DeepFace models/backends, we did not find a configuration that satisfies:

- `Recall@20 >= 90%` and
- low false positives (e.g. `Avg FP@10 <= 1`).

The closest region to the recall constraint was `ArcFace + ssd`, but it still returned many incorrect photos.

## Next pivots

To improve the frontier (high recall AND low FP), likely pivots:

- Try stronger modern embeddings like `Buffalo_L` (DeepFace) which requires `insightface` + `onnxruntime` (best tested on Linux/Fly)
- Try stronger detectors (retinaface/mediapipe/yunet) and recalibrate thresholds
- Add persistence + ANN index (pgvector/FAISS) only after quality is proven
