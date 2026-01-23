# @sabaipics/face-eval

Self-contained evaluation CLI for face recognition providers.

## Outputs

Results persist to repo-root relative paths:

- `eval/runs/<run_id>.json` - Run metadata (config, metrics, per-query results)
- `eval/runs/runs.csv` - Append-only CSV for comparing runs over time

## Dataset Setup

### 1. Download the Kaggle Dataset

Download the [Pins Face Recognition](https://www.kaggle.com/datasets/hereisburak/pins-face-recognition) dataset from Kaggle.

After extracting, you should have a folder structure like:

```
/path/to/105_classes_pins_dataset/
├── pins_Adam Driver/
│   ├── Adam Driver0_0.jpg
│   ├── ground.npy
│   └── ...
├── pins_Adriana Lima/
│   └── ...
└── ...
```

### 2. Set Environment Variable

```bash
export SABAIFACE_DATASET_PATH=/path/to/105_classes_pins_dataset
```

Or pass `--source` directly to commands.

### 3. Generate Ground Truth

```bash
pnpm --filter @sabaipics/face-eval eval dataset generate \
  --source $SABAIFACE_DATASET_PATH \
  --output ground-truth.json \
  --people 10 \
  --images 10 \
  --ratio 0.8
```

Options:

- `--source <path>` - Kaggle dataset root (or use `SABAIFACE_DATASET_PATH` env)
- `--output <path>` - Output JSON path (default: `ground-truth.json`)
- `--people <n>` - Number of people to include (default: 10)
- `--images <n>` - Images per person (default: 10)
- `--ratio <0-1>` - Index/query split ratio (default: 0.8 = 80% index, 20% query)
- `--seed <n>` - Random seed for reproducibility (default: 42)

Requirements: Python 3 with `numpy` installed.

## Running Evaluations

### SabaiFace (face-api.js)

```bash
# Start SabaiFace server first
pnpm --filter @sabaipics/sabaiface dev

# Run eval
pnpm --filter @sabaipics/face-eval eval run sabaiface \
  --endpoint http://localhost:8086 \
  --dataset ground-truth.json
```

### AWS Rekognition

```bash
# Set AWS credentials
export AWS_REGION=ap-southeast-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

# Run eval
pnpm --filter @sabaipics/face-eval eval run aws \
  --dataset ground-truth.json
```

### Common Options

```bash
--min-similarity <0..1>          # Threshold (default: 0.94 for aws, 0.4 for sabaiface)
--min-similarity-list <csv>      # Grid search: run for each value
--max-results <n>                # Max results per query (default: 20)
--eval-ks <csv>                  # K values for Recall@K (default: 10,20)
--dry-run                        # Print config without running
```

## Example: Grid Search

```bash
pnpm --filter @sabaipics/face-eval eval run sabaiface \
  --endpoint http://localhost:8086 \
  --dataset ground-truth.json \
  --min-similarity-list 0.90,0.92,0.94,0.96
```

This appends one row to `eval/runs/runs.csv` for each threshold value.
