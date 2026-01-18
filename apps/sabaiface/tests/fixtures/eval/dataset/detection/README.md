# SabaiFace Evaluation Suite

Comprehensive evaluation framework for face detection and recognition systems.

## Overview

The evaluation suite tests two core capabilities:

1. **Face Detection** - Can we accurately count and locate faces in an image?
2. **Face Recognition** - Can we find the same person across different photos?

## Folder Structure

```
tests/fixtures/eval/
├── README.md                    # Main evaluation docs
└── dataset/
    ├── detection/               # Test set 1: Face detection
    │   ├── images/             # Test images (flat: 001-015.jpg)
    │   ├── labels.json         # Ground truth with category field
    │   ├── scripts/            # Helper tools
    │   └── README.md           # This file
    │
    └── recognition/            # Test set 2: Face recognition (coming soon)
        ├── images/
        ├── ground-truth.json
        └── README.md
```

**Image Organization:**
- Images stored **flat** (001.jpg, 002.jpg, etc.)
- Categorized via `category` field in `labels.json`:
  - `single`: 1 face
  - `multiple`: 2-10 faces
  - `crowd`: 10+ faces (future)
  - `edge-cases`: Difficult scenarios (future)

---

## Test Set 1: Face Detection

### Purpose
Evaluate how accurately the system detects faces in images.

### Metrics

| Metric | Formula | Purpose |
|--------|---------|---------|
| **True Positives (TP)** | Correctly detected faces | Faces found |
| **False Positives (FP)** | Detections that aren't faces | Over-detection |
| **False Negatives (FN)** | Missed faces | Under-detection |
| **Precision** | TP / (TP + FP) | Of all detections, how many are correct? |
| **Recall** | TP / (TP + FN) | Of all faces, how many did we find? |
| **F1 Score** | 2 × (Precision × Recall) / (Precision + Recall) | Balance of precision & recall |
| **Exact Match Rate** | Perfect face count / Total images | Binary: exact or not |
| **MAE** | Mean Absolute Error of face counts | Average error magnitude |

### Ground Truth Format

`dataset/detection/labels.json`:
```json
[
  {
    "image": "001.jpg",
    "faceCount": 1,
    "category": "single",
    "notes": "Clear front-facing photo"
  },
  {
    "image": "008.jpg",
    "faceCount": 5,
    "category": "multiple",
    "notes": "Group photo with good lighting"
  },
  {
    "image": "015.jpg",
    "faceCount": 2,
    "category": "edge-cases",
    "notes": "Side profile, low light"
  }
]
```

### Running Detection Tests

```bash
# Test face detection accuracy
pnpm test:detection-eval

# Test with specific confidence threshold
FACE_CONFIDENCE_THRESHOLD=0.3 pnpm test:detection-eval

# Test specific model
FACE_DETECTOR=ssd pnpm test:detection-eval
```

---

## Test Set 2: Face Recognition

### Purpose
Evaluate the ability to:
1. **Index** faces and store descriptors
2. **Search** and find the same person across different photos
3. **Match** faces with appropriate similarity thresholds

### Metrics

#### Indexing Metrics
Same as detection metrics above (TP, FP, FN, Precision, Recall, F1).

#### Search Metrics

| Metric | Formula | Purpose |
|--------|---------|---------|
| **Rank-1 Accuracy** | Correct match is #1 result | Strict accuracy |
| **Rank-5 Accuracy** | Correct match in top 5 | Relaxed accuracy |
| **Mean Reciprocal Rank** | Average of (1/rank of correct match) | Ranking quality |
| **True Positive Rate** | Correct matches / Total queries | Sensitivity |
| **False Positive Rate** | Wrong matches / Total queries | Specificity |
| **Similarity Distribution** | Confidences for correct vs incorrect | Threshold tuning |

### Ground Truth Format

`recognition/ground-truth.json`:
```json
{
  "identities": {
    "person-001": {
      "name": "John Doe",
      "photos": [
        "person-001/photo-001.jpg",
        "person-001/photo-002.jpg",
        "person-001/photo-003.jpg"
      ]
    },
    "person-002": {
      "name": "Jane Smith",
      "photos": [
        "person-002/photo-001.jpg",
        "person-002/photo-002.jpg"
      ]
    }
  },
  "groups": {
    "mixed-groups/group-001.jpg": ["person-001", "person-002"],
    "mixed-groups/group-002.jpg": ["person-001", "person-002", "person-003"]
  },
  "test_queries": [
    {
      "query": "person-001/photo-001.jpg",
      "expected_matches": ["person-001/photo-002.jpg", "person-001/photo-003.jpg"],
      "should_not_match": ["person-002/photo-001.jpg"]
    },
    {
      "query": "mixed-groups/group-001.jpg",
      "expected_faces": ["person-001", "person-002"]
    }
  ]
}
```

### Running Recognition Tests

```bash
# Test full recognition pipeline (index + search)
pnpm test:recognition-eval

# Test with specific similarity threshold
DEFAULT_SIMILARITY_THRESHOLD=0.8 pnpm test:recognition-eval

# Test search only (assumes collection is indexed)
pnpm test:search-eval
```

---

## Adding Test Data

### For Detection Tests

1. Add images to `dataset/detection/images/` with sequential numbering
2. Count faces manually or use a trusted detector
3. Add to `dataset/detection/labels.json`:

```bash
# Interactive labeling tool
pnpm eval:label-detection

# Or manually edit dataset/detection/labels.json
```

### For Recognition Tests

1. Create person folders with multiple photos of the same person
2. Create mixed-group photos with multiple known people
3. Define identity mappings in `recognition/ground-truth.json`
4. Define test queries for search validation

```bash
# Interactive recognition setup tool
pnpm eval:setup-recognition
```

---

## Test Data Guidelines

### Image Quality Standards

| Category | Requirements |
|----------|--------------|
| **single** | Clear, front-facing, good lighting |
| **multiple** | 2-10 people, varied positions |
| **crowd** | 10+ people, realistic event photos |
| **edge-cases** | Challenging angles, partial faces, low light, shadows, hats, glasses |
| **no-faces** | Photos without faces (negative testing) |

### Recognition Data Requirements

- **Minimum 3 photos per person** - to test intra-person variation
- **Different angles/lighting** - to test robustness
- **Time separation** - photos taken at different times if possible
- **Mixed groups** - realistic event photo scenarios

---

## Interpreting Results

### Detection Benchmarks

| Metric | Target | Acceptable | Poor |
|--------|--------|------------|------|
| Precision | >95% | >90% | <90% |
| Recall | >95% | >85% | <85% |
| F1 Score | >95% | >90% | <90% |
| Exact Match Rate | >85% | >70% | <70% |

### Recognition Benchmarks

| Metric | Target | Acceptable | Poor |
|--------|--------|------------|------|
| Rank-1 Accuracy | >98% | >95% | <95% |
| Rank-5 Accuracy | >99% | >98% | <98% |
| Mean Reciprocal Rank | >0.95 | >0.90 | <0.90 |

### Performance Benchmarks

| Operation | Target | Acceptable |
|-----------|--------|------------|
| Detection (per image) | <200ms | <500ms |
| Indexing (per face) | <100ms | <200ms |
| Search (per query) | <500ms | <1000ms |

---

## Continuous Improvement

### When to Re-evaluate

- **After model updates** - New face-api.js versions
- **After config changes** - Threshold tuning, preprocessing changes
- **After code changes** - Algorithm improvements
- **Regular intervals** - Weekly/benchmark regression testing

### Regression Detection

```bash
# Run full evaluation suite
pnpm test:eval-all

# Compare against previous baseline
pnpm test:eval-compare --baseline=main
```

---

## Data Storage

Test images are stored in Cloudflare R2 and downloaded automatically:

- **Bucket**: `pabaipics-tests-fixtures`
- **Download**: `pnpm eval:download-data`
- **Sync**: `pnpm eval:sync-data` (upload local changes to R2)

---

## Related Documentation

- [Face Detection Config](../.env.example) - Model and threshold settings
- [API Documentation](../../API.md) - HTTP API reference
- [Optimization Results](../../OPTIMIZATION_SUMMARY.md) - Performance tuning
