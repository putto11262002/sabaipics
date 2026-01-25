# 017 - AWS Rekognition Tuning Summary

Date: 2026-01-23

## What we measured

We added a standalone AWS evaluation script and ran it on the small recognition ground truth set (5 identities, 20 index photos, 10 queries).

Script:

- `apps/sabaiface/tests/manual/test-aws-eval.ts`

Key metric focus:

- `Precision@10`, `Avg FP@10`, `FP-free@10`
- `Recall@20`

## Initial result (using SabaiFace-tuned threshold)

With `MIN_SIMILARITY=0.94` (chosen from SabaiFace best region):

- `Precision@10 = 82.33%`
- `Avg FP@10 = 0.40`
- `FP-free@10 = 70%`
- `Recall@20 = 46.04%` (too low vs target)

Observation: AWS had much better false positive behavior than the current SabaiFace (face-api.js) baseline, but recall was far below the product target.

## Threshold sensitivity check

In the first sweep we tested `MIN_SIMILARITY` at 0.8 / 0.85 / 0.9 and saw identical metrics. This suggests either:

- the returned matches all exceed that band (threshold not binding), or
- we need to test more extreme thresholds and/or increase candidate retrieval.

## Next tuning knobs to try

- Reduce `MIN_SIMILARITY` below 0.8 to increase recall.
- Increase the number of face matches fetched for aggregation (candidate set), since per-photo aggregation can be starved by many matches coming from the same photo.
- Confirm whether `MaxFaces` and threshold are actually binding on this dataset.

## Additional findings (debug)

We added debug counters to the AWS eval to surface:

- average AWS `FaceMatches` returned (`totalMatchedFaces`)
- average unique photos returned after aggregation
- sample top photo similarities per query

Key observation:

- For thresholds `minSimilarity >= 0.7`, the results were identical in our dataset.
- Debug showed the returned similarities were either:
  - very high (1.000 for the best match), or
  - completely absent (0 matches)
  - with very few photo results overall (~4 photos on average)

This suggests the threshold is binding only in low ranges; the “0.7–0.99 identical” behavior is because the returned matches are already above that band.
