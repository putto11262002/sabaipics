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
    │   ├── scripts/            # Helper tools
    │   └── README.md           # Detection-specific documentation
    └── recognition/            # Test set 2: Face recognition (coming soon)
        ├── images/
        ├── ground-truth.json
        └── README.md
```

## Quick Start

```bash
# Run detection evaluation
pnpm test:eval-detection

# Download test data from R2
pnpm eval:download-data

# Label new detection images
pnpm eval:label-detection
```

## Test Data Storage

Test images are stored in Cloudflare R2 and downloaded automatically:

- **Bucket**: `pabaipics-tests-fixtures`
- **Public URL**: https://pub-9b5b2bc0a9bc4b03bbbd97fdd1168fed.r2.dev
- **Download**: Images download automatically via postinstall script

## Adding Test Data

See individual dataset READMEs:
- [Detection Guidelines](dataset/detection/README.md)
- Recognition Guidelines (coming soon)

## Related Documentation

- [Detection Test Documentation](dataset/detection/README.md) - Face detection metrics and benchmarks
- [API Documentation](../../../API.md) - HTTP API reference
- [Configuration](../../../.env.example) - Model and threshold settings
