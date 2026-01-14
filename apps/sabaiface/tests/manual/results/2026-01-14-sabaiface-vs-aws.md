# SabaiFace vs AWS Rekognition Comparison

**Date:** 2026-01-14

## Test Configuration

- **Dataset:** Kaggle Face Clustering (10 people, 73 index images, 20 query images)
- **SabaiFace Collection:** `eval-sabaiface-1768371593885`
- **AWS Collection:** `eval-aws-1768371593885`
- **SabaiFace Endpoint:** `http://localhost:8086`
- **Min Similarity:** 0.4 (40%)

## Indexing Results

| Provider | Faces Indexed | Time |
|----------|---------------|------|
| SabaiFace | 1,212 | 62,175 ms (~1 min) |
| AWS Rekognition | 1,090 | 227,029 ms (~3.8 min) |

## Accuracy Metrics

| Metric | SabaiFace | AWS Rekognition | Winner |
|--------|-----------|-----------------|--------|
| Rank-1 Accuracy | 95.0% | 75.0% | **SabaiFace** (+20%) |
| Rank-5 Accuracy | 100.0% | 90.0% | **SabaiFace** (+10%) |
| Mean Reciprocal Rank | 0.967 | 0.825 | **SabaiFace** (+17%) |

## Performance Metrics

| Metric | SabaiFace | AWS Rekognition | Winner |
|--------|-----------|-----------------|--------|
| Avg Search Time | 916 ms | 1,847 ms | **SabaiFace (2x faster)** |
| Speedup | 2.0x | - | **SabaiFace** |

## Test Environment

- **Client Libraries Used:**
  - `SabaiFaceHTTPClient` from `@sabaipics/face-recognition`
  - `AWSRekognitionClient` from `@sabaipics/face-recognition`
- **Tests:**
  - `tests/manual/test-recognition-eval.ts` (single provider accuracy)
  - `tests/manual/test-aws-vs-recognition.ts` (comparison test)

## Conclusion

SabaiFace significantly outperforms AWS Rekognition in both accuracy and speed:
- **+20 percentage points** in Rank-1 accuracy
- **+10 percentage points** in Rank-5 accuracy
- **+0.142** in Mean Reciprocal Rank
- **2x faster** search performance
