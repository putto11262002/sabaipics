# SabaiFace Evaluation Suite

Comprehensive evaluation framework for face detection and recognition systems.

## Overview

The evaluation suite tests two core capabilities:

1. **Face Detection** - Can we accurately count and locate faces in an image?
2. **Face Recognition** - Can we find the same person across different photos?

## Folder Structure

```
eval/
├── README.md                    # This file - main evaluation docs
└── dataset/
    ├── detection/               # Test set 1: Face detection
    │   ├── images/             # Test images (flat structure)
    │   ├── labels.json         # Ground truth: { image, faceCount, category }
    │   └── README.md           # Detection-specific documentation
    └── recognition/            # Test set 2: Face recognition
        ├── ground-truth.sample.json   # Structure reference (committed)
        └── ground-truth.local.json    # Generated with full paths (not committed)
```

## Quick Start

### Face Detection Evaluation

```bash
# Run detection evaluation
pnpm test:eval-detection
```

### Face Recognition Evaluation

**One-time setup:**

1. Set your Kaggle dataset path:
   ```bash
   export SABAIFACE_DATASET_PATH=/path/to/kaggle/dataset
   ```

2. Generate ground-truth with full paths:
   ```bash
   pnpm eval:generate-ground-truth
   ```

3. Run recognition evals:
   ```bash
   # Start the server first
   pnpm dev

   # In another terminal, run tests
   pnpm test:recognition-eval          # Single provider accuracy test
   pnpm test:aws-vs-recognition        # Comparison test (SabaiFace vs AWS)
   ```

## Recognition Evaluation

### Prerequisites

- Kaggle Face Clustering dataset (folders: 10002/, 10003/, etc.)
- Each folder must contain `ground.npy` and `.jpg` images
- See: [Kaggle Face Clustering Dataset](https://www.kaggle.com/datasets)

### Ground Truth Generation

The `ground-truth.local.json` file is generated per-environment and contains **absolute paths** to your dataset:

```bash
# Method 1: Using environment variable
export SABAIFACE_DATASET_PATH=/path/to/kaggle/dataset
pnpm eval:generate-ground-truth

# Method 2: Using --dataset argument directly
python3 scripts/extract-recognition-dataset.py --dataset /path/to/kaggle/dataset

# Custom configuration
python3 scripts/extract-recognition-dataset.py \
  --dataset /path/to/kaggle/dataset \
  --people 10 \
  --images 10 \
  --ratio 0.8 \
  --seed 42
```

**Output:** `tests/fixtures/eval/dataset/recognition/ground-truth.local.json`

Contains:
- `datasetPath` - Absolute path to dataset
- `indexSet` - List of `{name, path}` for index images
- `identities` - Per-person data with `indexImagePaths`, `queryImagePaths`, `containedInIndexPaths`

### Running Recognition Tests

**Test 1: Recognition Accuracy (SabaiFace only)**

Tests face recognition accuracy using the Kaggle dataset via the SabaiFace HTTP API.

```bash
pnpm test:recognition-eval
```

**Metrics:**
- Rank-1 Accuracy (target: >95%)
- Rank-5 Accuracy (target: >98%)
- Mean Reciprocal Rank (target: >0.95)
- Avg Index/Search Time

**Test 2: SabaiFace vs AWS Rekognition Comparison**

Compares face recognition accuracy between SabaiFace and AWS Rekognition.

```bash
pnpm test:aws-vs-recognition
```

**Requires AWS credentials in `.env`:**
```
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
```

### Test Results

Results are saved to `tests/manual/results/YYYY-MM-DD-sabaiface-vs-aws.md`.

## Configuration

Add to your `.env` file:

```bash
# Path to Kaggle dataset (for eval:generate-ground-truth)
SABAIFACE_DATASET_PATH=../../../dataset

# SabaiFace endpoint
SABAIFACE_ENDPOINT=http://localhost:8086

# AWS credentials (for comparison test)
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

## File Management

| File | Status | Description |
|------|--------|-------------|
| `ground-truth.sample.json` | ✅ Committed | Structure reference only |
| `ground-truth.local.json` | ❌ Ignored | Generated per-environment with full paths |

The tests automatically check for `ground-truth.local.json` first, then fall back to `ground-truth.sample.json`.

## Related Documentation

- [Detection Test Documentation](dataset/detection/README.md) - Face detection metrics and benchmarks
- [API Documentation](../../../API.md) - HTTP API reference
- [Configuration](../../../.env.example) - Model and threshold settings
