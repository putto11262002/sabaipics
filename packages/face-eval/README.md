# @sabaipics/face-eval

Self-contained evaluation CLI for face recognition providers.

## Package Structure

```
packages/face-eval/
├── src/                  # TypeScript CLI source
├── scripts/
│   ├── generate-eval-dataset.py   # Python dataset generator
│   ├── upload-eval-dataset.ts     # Upload dataset to R2
│   ├── download-eval-dataset.ts   # Download dataset from R2
│   └── upload-ignore.ts           # Upload ignore file to R2
└── runs/                 # Eval run outputs (gitignored)
```

## Global Cache

Datasets are cached globally so they're shared across all clones of the project:

```
~/.cache/sabaipics/eval-datasets/
├── v1/
│   ├── index.json
│   ├── ignore.json
│   ├── selfies/
│   └── index/
└── v2/
    └── ...
```

Override with `SABAIPICS_CACHE_DIR` environment variable.

## Quick Start

### 1. Download Dataset from R2

```bash
# Set R2 credentials
export R2_ACCOUNT_ID=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...

# Download dataset
pnpm --filter @sabaipics/face-eval dataset:download --version v1
```

### 2. Run Evaluation

```bash
# AWS Rekognition
export AWS_REGION=ap-southeast-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

pnpm --filter @sabaipics/face-eval eval run aws \
  --dataset ./data/v1/index.json
```

---

## Dataset Management

### Download Dataset

```bash
# Downloads to global cache (~/.cache/sabaipics/eval-datasets/v1/)
pnpm --filter @sabaipics/face-eval dataset:download --version v1

# Or specify custom output directory
pnpm --filter @sabaipics/face-eval dataset:download --version v1 --output ./data
```

Options:

- `--version, -v` - Dataset version (default: v1)
- `--output, -o` - Output directory (default: global cache)
- `--skip-ignore` - Don't download ignore.json

### Upload Dataset (Admin)

First generate a dataset locally, then upload:

```bash
# Generate dataset from Kaggle source
pnpm --filter @sabaipics/face-eval eval dataset generate \
  --source /path/to/kaggle \
  --output ./testimages

# Upload to R2
pnpm --filter @sabaipics/face-eval dataset:upload \
  --source ./testimages \
  --version v1
```

### Upload Ignore File

After reviewing selfies, create an ignore.json and upload:

```bash
pnpm --filter @sabaipics/face-eval ignore:upload \
  --file ./ignore.json \
  --dataset-version v1 \
  --description "Initial review - removed wrong faces"
```

---

## Ignore Files

The ignore system allows marking bad selfies/images without re-uploading the dataset.

### Format

```json
{
  "ignore": {
    "228A9455_0": true,
    "228A9460_0": "wrong person",
    "10003_228A9844": "mislabeled group"
  }
}
```

- Key = image ID (selfie or index image)
- Value = `true` or reason string

### How It Works

1. `ignore.json` is stored separately from dataset images in R2
2. `download-eval-dataset.ts` fetches the latest ignore file
3. Eval code automatically skips ignored images
4. Ignore file can be updated independently (versioned)

### R2 Structure

```
sabaipics-eval-datasets/
  v1/
    index.json
    manifest.json
    selfies/...
    index/...
  ignore/
    v1-ignore-001.json    # First review
    v1-ignore-002.json    # Second review
    v1-ignore-latest.json # Current active
```

---

## Running Evaluations

### AWS Rekognition

```bash
export AWS_REGION=ap-southeast-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

pnpm --filter @sabaipics/face-eval eval run aws \
  --dataset ./data/v1/index.json
```

### SabaiFace

```bash
pnpm --filter @sabaipics/face-eval eval run sabaiface \
  --endpoint http://localhost:8086 \
  --dataset ./data/v1/index.json
```

### Common Options

```bash
--min-similarity <0..1>          # Threshold (default: 0.94 for aws, 0.4 for sabaiface)
--min-similarity-list <csv>      # Grid search: run for each value
--max-results <n>                # Max results per query (default: 20)
--index-subset <n>               # Use only first N index images (quick test)
--dry-run                        # Print config without running
```

---

## Environment Variables

### R2 (Dataset Storage)

```bash
R2_ACCOUNT_ID=...           # Cloudflare account ID
R2_ACCESS_KEY_ID=...        # R2 access key
R2_SECRET_ACCESS_KEY=...    # R2 secret key
R2_BUCKET_NAME=...          # Bucket name (default: sabaipics-eval-datasets)
SABAIPICS_CACHE_DIR=...     # Override global cache dir (default: ~/.cache/sabaipics/eval-datasets)
SKIP_DATASET_DOWNLOAD=1     # Skip download (for CI)
```

### AWS (Rekognition Provider)

```bash
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

### SabaiFace Provider

```bash
SABAIFACE_ENDPOINT=http://localhost:8086
```

---

## Output

Results are written to `packages/face-eval/runs/`:

- `runs.csv` - Append-only CSV with metrics from all runs
- `<timestamp>-<uuid>.json` - Full run metadata
