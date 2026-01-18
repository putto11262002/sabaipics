# Manual Testing Guide

This directory contains manual test scripts for validating SabaiFace with real images.

## Test Scripts

### 1. Service-Level Tests (`test-with-images.ts`)

Tests the core face service directly (bypassing HTTP API).

**What it tests:**
- Face detection accuracy vs labeled ground truth
- Face indexing with database persistence
- Vector storage with pgvector
- Face similarity search
- End-to-end workflow

**Prerequisites:**
- Database running with pgvector extension
- Test images in `tests/fixtures/images/`
- `labels.json` with expected face counts

**Run:**
```bash
cd apps/sabaiface
pnpm test:images
```

**Sample output:**
```
🧪 SabaiFace Test Suite
============================================================

📋 Loading test labels...
   Found 15 labeled images

🚀 Initializing SabaiFace service...
   ✅ Service initialized

============================================================
TEST 1: Face Detection Accuracy
============================================================

📸 Testing 1.jpg... ✅ Expected: 4, Detected: 4 (156ms)
📸 Testing 2.jpg... ✅ Expected: 7, Detected: 7 (234ms)
...

============================================================
DETECTION ACCURACY SUMMARY
============================================================
Total images tested:     15
Exact matches:           13/15 (86.7%)
Total faces expected:    68
Total faces detected:    66
Detection accuracy:      97.1%
Average processing time: 182ms
```

---

### 2. HTTP API Tests (`test-api-with-images.ts`)

Tests the Hono HTTP API endpoints with real images.

**What it tests:**
- Health check endpoint
- Create collection endpoint
- Index faces endpoint
- Search faces endpoint
- Delete collection endpoint

**Prerequisites:**
- Server running: `pnpm dev` (in another terminal)
- Test images in `tests/fixtures/images/`

**Run:**
```bash
# Terminal 1: Start server
cd apps/sabaiface
pnpm dev

# Terminal 2: Run API tests
cd apps/sabaiface
pnpm test:api
```

**Sample output:**
```
🧪 SabaiFace HTTP API Test
============================================================
API URL: http://localhost:3000
============================================================

TEST 1: Health Check
   Status: 200
   Service: sabaiface
   Provider: sabaiface
   ✅ Health check passed

TEST 2: Create Collection
   Collection created: test-api-1705176234567
   ✅ Collection creation passed

TEST 3: Index Faces
📸 Indexing 1.jpg... ✅ Expected: 4, Got: 4 (178ms)
📸 Indexing 2.jpg... ✅ Expected: 7, Got: 7 (245ms)
...
```

---

## Test Images

The test images are located in `tests/fixtures/images/` with the following structure:

```
tests/fixtures/images/
├── 1.jpg (4 faces)
├── 2.jpg (7 faces)
├── 3.jpg (4 faces)
...
├── 15.jpg (6 faces)
└── labels.json
```

### labels.json Format

```json
[
  {
    "image": "./tests/fixtures/images/1.jpg",
    "faceCount": 4
  },
  ...
]
```

---

## Understanding Test Results

### Detection Accuracy

- **Exact matches**: Number of images where detected count == expected count
- **Detection accuracy**: (Total detected / Total expected) × 100%
- **Processing time**: Average time per image (includes detection + descriptor extraction)

### Common Mismatches

Face detection may differ from labeled counts due to:
- **False negatives**: Faces not detected (blurry, occluded, low quality)
- **False positives**: Non-faces detected (rare with SSD MobileNet V1)
- **Threshold sensitivity**: Default confidence threshold is 0.5

### Performance Benchmarks

Expected performance on modern CPU:
- Single face: 100-200ms
- Multiple faces (5): 300-500ms
- Vector search (10k faces): <1 second

---

## Troubleshooting

### Models Not Found

```
Error: Model files not found in ./models
```

**Solution:** Download face-api.js models:
```bash
cd apps/sabaiface
# Models should be in ./models/ directory
ls models/
```

### Database Connection Error

```
Error: connect ECONNREFUSED
```

**Solution:** Start PostgreSQL with pgvector extension:
```bash
# Check database is running
psql $DATABASE_URL -c "SELECT 1"

# Enable pgvector extension
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector"
```

### Server Not Running (API tests)

```
Error: fetch failed
```

**Solution:** Start the server:
```bash
cd apps/sabaiface
pnpm dev
```

### Low Detection Accuracy

If detection accuracy is <90%:
1. Check image quality (blurry images reduce accuracy)
2. Verify labels are correct (manual count may differ from ground truth)
3. Adjust confidence threshold in test script (default: 0.5)

---

## Customizing Tests

### Change Confidence Threshold

Edit the test script:
```typescript
options: {
  minConfidence: 0.7,  // Increase for stricter detection
}
```

### Test Subset of Images

Edit the test script:
```typescript
const testImages = labels.slice(0, 5);  // Test first 5 only
```

### Change Similarity Threshold

Edit search parameters:
```typescript
options: {
  minSimilarity: 0.85,  // Increase for stricter matching
}
```

---

## Next Steps

After verifying tests pass:
1. Review detection mismatches (if any)
2. Tune confidence thresholds if needed
3. Add more test images for edge cases
4. Run integration tests: `pnpm test:run`
5. Start using in production workflow
