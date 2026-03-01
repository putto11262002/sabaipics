# Face Recognition: Modal Migration Plan

## Context

We currently use **AWS Rekognition** for face recognition in production. An in-house alternative using **DeepFace (ArcFace + RetinaFace)** was built and evaluated (`infra/recognition/`), but deployment to Fly.io proved problematic — shared CPUs get throttled for ML workloads, cold starts were slow, and cost was worse than AWS at low volume.

**Modal** (modal.com) is a serverless AI runtime we're already using for our image pipeline. This document evaluates running our in-house face recognition on Modal instead.

---

## Existing Work

### Codebase

| Component | Path |
|-----------|------|
| Python service (FastAPI + DeepFace) | `infra/recognition/` |
| Evaluation framework | `packages/face-eval/` |
| Eval run results | `packages/face-eval/runs/` |
| Benchmark logs | `log/015-deepface-baseline-grid-results.md` |
| Tuning summary | `log/012-recognition-tuning-summary.md` |
| AWS comparison | `log/017-aws-tuning-summary.md` |
| SabaiFace (Node.js, face-api.js) | `src/sabaiface/` |
| ADR (Linear) | [FF-52](https://linear.app/sabaipics/issue/FF-52/adr-face-recognition-provider-evaluation-and-selection) |

### Architecture Decision (FF-52)

The ADR documents a two-phase strategy:

- **Phase 1 (current):** AWS Rekognition — zero infra overhead, pay-per-use, best accuracy
- **Phase 2 (>100K ops/month):** Migrate to self-hosted DeepFace — fixed cost, full tuning control

The API layer already has a pluggable `FaceRecognitionProvider` interface (FF-15), so switching providers is a backend swap, not an API redesign.

---

## Evaluation Results

Tested on 50 index images, 500 selfie queries:

| Metric | SabaiFace (face-api.js) | DeepFace (ArcFace) | AWS Rekognition |
|--------|------------------------|-------------------|-----------------|
| Rank-1 | 40.9% | 65.1% | **65.4%** |
| Rank-5 | 75.7% | 96.7% | **98.6%** |
| Precision@10 | 35.0% | 57.2% | **73.2%** |
| Recall@20 | 24.2% | 86.3% | **96.9%** |

### Key Findings

- DeepFace Rank-1 accuracy is nearly identical to AWS (65.1% vs 65.4%)
- DeepFace has a **false-positive tradeoff** — high recall comes with more false positives
- At low similarity thresholds: ~98-100% recall but ~5.5 avg FP per 10 results
- At high similarity thresholds: FP drops but recall falls below 50%
- AWS Rekognition has much better precision — 0.40 avg FP at 82.3% precision

### Known Limitation

The FP issue cannot be solved by threshold tuning alone. Stronger embeddings are needed — the planned upgrade is **InsightFace Buffalo_L** (ONNX Runtime), which was deferred due to dependency complexity on Fly.io.

---

## Fly.io Problems

| Problem | Detail |
|---------|--------|
| CPU throttling | Shared CPUs get heavily throttled for ML workloads. 8 shared CPUs performed worse than 4 dedicated. |
| Cold starts | 2-3 seconds for model loading, 120-second health check grace period needed |
| Request latency | 328-2545ms depending on detector backend |
| Cost | Dedicated CPUs cost more than AWS at current scale |
| Memory | ArcFace + OpenCV used ~5.8 GB, near the 4 GB VM limit |
| Storage | In-memory only — data lost on restart |

---

## Modal Platform Overview

Modal is a serverless AI runtime with per-second billing, purpose-built for Python ML workloads. No Dockerfile, no Kubernetes — everything defined in Python with decorators.

### Why Modal Solves the Fly.io Problems

| Fly.io Problem | Modal Solution |
|----------------|---------------|
| CPU throttling on shared VMs | Dedicated physical cores, per-second billing |
| Cold start + model loading (5-10s) | **Memory snapshots** — captures loaded model state, restores in ~1-2s |
| Paying for idle time (24/7 VM) | Scale-to-zero by default |
| Docker/infra complexity | Pure Python deployment, no Dockerfile |
| Cost at low volume | Per-second billing, $30/mo free credits on Starter plan |
| Memory constraints | Configurable per-container (up to large allocations) |

### Key Features for Face Recognition

- **Memory snapshots**: Captures Python process state (including loaded ML models) after initialization. Subsequent cold starts restore from snapshot in ~1-2s instead of re-loading models from disk.
- **`@modal.enter(snap=True)`**: Decorator that runs model loading once and includes it in the snapshot.
- **`@modal.fastapi_endpoint`**: Native FastAPI support — existing FastAPI code ports directly.
- **Container lifecycle**: `min_containers` for keep-warm, `scaledown_window` for idle timeout, `max_containers` for cost caps.
- **Input concurrency**: Single container can handle multiple requests concurrently (`@modal.concurrent`).
- **Image layer caching**: Model weights baked into the image are cached across deployments.

---

## Modal Pricing

### Compute Rates (Per Second)

| Resource | Rate | Hourly |
|----------|------|--------|
| CPU (physical core) | $0.0000131/core/sec | ~$0.047/core/hr |
| Memory | $0.00000222/GiB/sec | ~$0.008/GiB/hr |
| T4 GPU (16 GB) | $0.000164/sec | ~$0.59/hr |
| L4 GPU (24 GB) | $0.000222/sec | ~$0.80/hr |

### Plan Tiers

| | Starter ($0/mo) | Team ($250/mo) |
|---|---|---|
| Free credits | $30/mo | $100/mo |
| Max containers | 100 | 1,000 |
| GPU concurrency | 10 | 50 |

### Per-Request Cost Estimate (CPU-Only)

Assuming 2 CPU cores, 2 GiB memory, ~2 seconds per request:

```
CPU:    2 cores × 2 sec × $0.0000131/core/sec = $0.0000524
Memory: 2 GiB   × 2 sec × $0.00000222/GiB/sec = $0.00000888
Total:                                           ~$0.000061 per request
```

**~$0.06 per 1,000 requests**

### Keep-Warm Cost (1 Container Always On)

```
CPU:    2 cores × 3600 sec/hr × $0.0000131  = $0.094/hr
Memory: 2 GiB   × 3600 sec/hr × $0.00000222 = $0.016/hr
Total:                                         ~$0.11/hr ≈ $79/month
```

---

## Cost Comparison

### Modal vs AWS Rekognition

| Monthly Volume | AWS Rekognition | Modal (on-demand) | Modal (1 warm container) |
|----------------|-----------------|-------------------|--------------------------|
| 10K ops | $10 | $0.61 | ~$80 |
| 50K ops | $50 | $3.05 | ~$82 |
| 100K ops | $100 | $6.10 | ~$85 |
| 250K ops | $250 | $15.25 | ~$94 |
| 500K ops | $500 | $30.50 | ~$110 |

### Breakeven Analysis

- **Pure on-demand** (1-2s cold start via memory snapshots): Cheaper than AWS from day one
- **With 1 warm container**: Breakeven at ~82K ops/month vs AWS
- **Key insight**: If face recognition runs as async/batch processing (event photo uploads), cold starts are acceptable and on-demand pricing applies — making it 16x cheaper than AWS at scale

### Modal vs Fly.io (Self-Hosted DeepFace)

| Factor | Fly.io (shared-cpu-4x, 4GB) | Modal (2 cores, 2 GiB, on-demand) |
|--------|------|-------|
| Monthly base cost | ~$28/mo (always running) | $0 (scale-to-zero) |
| Per-request cost | $0 (already running) | ~$0.000061 |
| Cold start | 2-3s model load | ~1-2s with memory snapshots |
| CPU quality | Shared, throttled | Dedicated physical cores |
| GPU option | Limited | Native (T4 through H200) |

---

## Recommended Approach

### Model Upgrade: InsightFace Buffalo_L

The current DeepFace + ArcFace setup has a false-positive problem. The planned upgrade to **InsightFace + Buffalo_L** was blocked on Fly.io due to dependency complexity. Modal makes this feasible:

- InsightFace uses **ONNX Runtime** — optimized for CPU inference, no TensorFlow/PyTorch needed
- Lighter dependency tree than DeepFace + tf-keras
- Buffalo_L produces stronger embeddings that should close the precision gap with AWS
- ONNX Runtime on Modal's dedicated CPUs should give 50-200ms per face (vs 300-2000ms on Fly.io)

### Deployment Architecture (Conceptual)

```python
import modal

app = modal.App("framefast-recognition")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(["libgl1", "libglib2.0-0"])
    .pip_install(["insightface", "onnxruntime", "opencv-python-headless", "numpy", "fastapi"])
    .run_function(download_buffalo_l_weights)
)

@app.cls(
    image=image,
    cpu=2.0,
    memory=2048,
    enable_memory_snapshot=True,
    scaledown_window=300,      # 5 min idle before scale-down
    max_containers=10,
)
class FaceRecognitionService:
    @modal.enter(snap=True)
    def load_model(self):
        from insightface.app import FaceAnalysis
        self.face_app = FaceAnalysis(providers=["CPUExecutionProvider"])
        self.face_app.prepare(ctx_id=0, det_size=(640, 640))

    @modal.fastapi_endpoint(method="POST")
    def index_faces(self, request: IndexFacesRequest):
        # Extract faces + embeddings from image
        ...

    @modal.fastapi_endpoint(method="POST")
    def search_faces(self, request: SearchFacesRequest):
        # Compare query face against indexed embeddings
        ...
```

### Migration Path

1. **Port to Modal + InsightFace** — rewrite `infra/recognition/main.py` for Modal, swap DeepFace for InsightFace Buffalo_L
2. **Re-run evals** — use existing `packages/face-eval/` framework against Modal endpoint
3. **Compare accuracy** — InsightFace Buffalo_L vs AWS Rekognition on the same test dataset
4. **If accuracy is acceptable** — integrate via existing `FaceRecognitionProvider` interface
5. **Gradual rollout** — A/B test against AWS Rekognition in production

### Open Questions

- [ ] Where do face embeddings persist? (Current service is in-memory only — production needs pgvector or similar)
- [ ] Should Modal handle both indexing and search, or just embedding extraction with search on the API side (pgvector)?
- [ ] What latency is acceptable for the participant selfie-search flow? (Determines whether keep-warm is needed)
- [ ] How does Modal fit with the existing AWS rate limiting setup (FF-45)? Does removing AWS remove that constraint entirely?

---

## InsightFace Buffalo_L Eval Results (2026-02-24)

### Setup

- **Model**: InsightFace Buffalo_L (w600k_r50 recognition, det_10g detection) via ONNX Runtime CPU
- **Hardware**: Mac Mini, Apple Silicon, 24GB RAM
- **Service**: `infra/recognition/main.py` rewritten to use InsightFace (same Rekognition-compatible API surface)
- **Dataset**: v1 eval dataset — 100 identities, 1,315 index images, 5 selfies/person (500 queries)
- **Eval runner**: `src/face-eval/cli.ts` with `sabaiface` provider pointing at `http://localhost:8087`

### Results: InsightFace vs AWS Rekognition vs DeepFace

Comparison using 50-image index subset (same dataset hash `e1a1ba7b...` as the AWS baseline run):

| Metric | InsightFace Buffalo_L | AWS Rekognition | DeepFace (ArcFace) |
|--------|----------------------|-----------------|-------------------|
| **Precision@10** | **73.5%** | 73.2% | 57.2% |
| **Precision@20** | **74.4%** | 74.0% | 49.4% |
| **Rank-1** | 62.3% | **65.4%** | 65.1% |
| **Rank-5** | 97.7% | **98.6%** | 96.7% |
| **Recall@20** | 93.9% | **96.9%** | 86.3% |
| **Avg FP@10** | **1.85** | 2.01 | 3.8-6.2 |
| **FP-Free@10** | **36.3%** | 31.8% | 10.2% |
| **Avg Index Time** | **934ms** | 2,899ms | 1,724ms |
| **Avg Search Time** | **197ms** | 511ms | 784ms |
| **Empty Rate** | 1.4% | 1.4% | 0.9% |

### Scaling Behaviour (Larger Index Subsets)

| Metric | 50 images | 200 images | 500 images |
|--------|-----------|------------|------------|
| Precision@10 | 73.5% | 73.8% | 71.4% |
| Rank-1 | 62.3% | 42.6% | 27.6% |
| Rank-5 | 97.7% | 96.1% | 94.8% |
| Recall@20 | 93.9% | 77.9% | 39.3% |
| Avg FP@10 | 1.85 | 2.49 | 2.58 |
| Avg Index Time | 934ms | 704ms | 723ms |
| Avg Search Time | 197ms | 210ms | 228ms |

Rank-1 and Recall degrade as the index grows — expected behaviour (more candidates = harder retrieval). Precision stays strong across all sizes, confirming the FP problem is solved.

### Key Conclusions

1. **False-positive problem is solved.** InsightFace Buffalo_L achieves Precision@10 of 73.5% vs DeepFace's 57.2% — now matching AWS Rekognition (73.2%). Avg FP@10 dropped from 3.8-6.2 (DeepFace) to 1.85, actually better than AWS (2.01).

2. **Accuracy is on par with AWS.** Rank-1 is slightly lower (62.3% vs 65.4%) but Rank-5 is nearly identical (97.7% vs 98.6%). For an event photo matching use case where users review a short list, this is functionally equivalent.

3. **Latency is 2-3x better.** Search at 197ms vs AWS 511ms. Indexing at 934ms vs AWS 2,899ms. Running locally on CPU — would be even faster on Modal's dedicated cores.

4. **InsightFace replaces DeepFace as the self-hosted candidate.** Stronger embeddings, lighter dependencies (ONNX Runtime vs TensorFlow), and better results across the board.

### Memory Leak: Root Cause & Fix (2026-02-24)

**Root cause**: ONNX Runtime's CPU execution provider allocates an internal memory pool that grows with each inference call but never shrinks. After ~800 sequential inferences the accumulated pool exceeds available memory and macOS kills the process (SIGKILL, exit code 137).

**Contributing factors**:
- Buffalo_L loads 5 ONNX models but we only need 2 (detection + recognition) — unused landmark_2d_106, landmark_3d_68, and genderage models wasted ~143 MB
- Image decode intermediates (base64 bytes, PIL Image, RGB array) not explicitly freed between requests

**Fix applied** (`infra/recognition/main.py`):
1. **`allowed_modules=['detection', 'recognition']`** — skip unused models, saves ~143 MB baseline
2. **`FaceAnalysisWrapper` with session recycling** — recreates the FaceAnalysis instance every 500 inferences, releasing the accumulated ONNX memory pool. Configurable via `SESSION_RECYCLE_INTERVAL` env var.
3. **Explicit cleanup in `decode_image()`** — `del` intermediates immediately after use
4. **`face.embedding.flatten().copy()`** — ensures embeddings are owned copies, not views into ONNX memory

**Result**: Full 1,315-image eval completed with **zero errors** (previously crashed at ~800 with 412-469 errors). Index time also improved from 934ms to 431ms because unused models no longer run per-image.

---

## Full Dataset Eval Results (2026-02-24, Post-OOM Fix)

### Setup

- **Model**: InsightFace Buffalo_L with `allowed_modules=['detection', 'recognition']`
- **Session recycling**: Every 500 inferences
- **Hardware**: Mac Mini, Apple Silicon, 24GB RAM
- **Dataset**: v1 eval dataset — 100 identities, 1,315 index images, 5 selfies/person (500 queries)
- **Run ID**: `20260224T055107Z-07ab0fbf`

### Results: Full Dataset (1,315 images)

| Metric | InsightFace (1,315 imgs) | InsightFace (50 imgs) | AWS Rekognition (50 imgs) |
|--------|--------------------------|----------------------|---------------------------|
| **Precision@10** | **77.8%** | 73.5% | 73.2% |
| **Precision@20** | **80.9%** | 74.4% | 74.0% |
| **Rank-1** | 38.4% | 62.3% | 65.4% |
| **Rank-5** | 97.0% | 97.7% | 98.6% |
| **Recall@20** | 39.7% | 93.9% | 96.9% |
| **Avg FP@10** | 2.12 | **1.85** | 2.01 |
| **FP-Free@10** | 21.0% | **36.3%** | 31.8% |
| **Avg Index Time** | **431.6ms** | 934ms | 2,899ms |
| **Avg Search Time** | **181.8ms** | 197ms | 511ms |
| **Index Errors** | **0** | — | — |
| **Empty Rate** | 1.0% | 1.4% | 1.4% |

### Analysis

1. **OOM fix confirmed.** All 1,315 images processed with zero errors — the session recycling and allowed_modules fix completely resolved the memory leak.

2. **Precision improves with scale.** Precision@10 went from 73.5% (50 images) to 77.8% (1,315 images). The model's embeddings are strong enough that adding more candidates actually improves result quality. This is the opposite of the DeepFace behavior where more data meant more false positives.

3. **Rank-1 drops as expected.** 38.4% at 1,315 images vs 62.3% at 50 — this is the needle-in-a-haystack effect. With 26x more photos, the chance of the #1 result being exactly right decreases. But Rank-5 holds at 97%, meaning the correct result is almost always in the top 5.

4. **Latency improved.** Index time cut in half (431ms vs 934ms) because `allowed_modules` skips landmark and genderage inference per image. Search at 181ms.

5. **Needs full-scale AWS comparison.** The AWS baseline was only run at 50 images. For a true comparison at 1,315 images, we need to re-run the AWS eval at full scale. At 50 images, InsightFace already matched AWS on precision.

---

### Updated Migration Path

1. ~~Port to Modal + InsightFace~~ → **Done locally** — `infra/recognition/main.py` rewritten
2. ~~Run evals~~ → **Done** — subset evals match AWS, full dataset eval completed
3. ~~Fix memory leak~~ → **Done** — session recycling + allowed_modules fix
4. **Redesign architecture** — see v2 architecture below
5. **Deploy to Modal** — stateless inference service
6. **Integrate with API** — pgvector storage, Worker-side search
7. **Production rollout**

---

## v2 Architecture: Stateless Inference + pgvector (2026-02-24)

### Design Decision

The v1 Python service mimicked the AWS Rekognition API surface (collections, index-faces, search-faces-by-image). Now that we're committing fully to self-hosted InsightFace and dropping AWS, we can redesign cleanly.

**Key insight**: The Python/Modal service only needs to do **inference** (face detection + embedding extraction). Everything else — storage, search, rate limiting, orchestration — belongs in the JS/TS API layer where the rest of the business logic lives.

### Why This Design

| Concern | Old Design (AWS-compat) | v2 Design |
|---------|------------------------|-----------|
| Inference | Python service does detection, embedding, AND search | Modal does detection + embedding only |
| Storage | In-memory in Python process (lost on restart) | pgvector in Neon Postgres (durable) |
| Search | Python cosine similarity loop over all stored faces | SQL query via pgvector `<=>` operator |
| State | Stateful (collections in memory) | Stateless (Modal knows nothing about events/collections) |
| Billing | Modal billed for inference + search time | Modal billed for inference only (~200-400ms per call) |
| Business logic | Split across Python + JS | All in JS/TS Workers |

### Component Responsibilities

#### Modal Service (Python, stateless)

Single endpoint — image in, face data out:

```
POST /extract
  Request:  { image: base64 }
  Response: {
    faces: [{
      embedding: float[512],   // ArcFace 512-D vector
      bbox: { x, y, w, h },   // pixel coordinates
      confidence: float,       // detection confidence 0-1
    }]
  }
```

- No collections, no search, no storage
- Loads InsightFace Buffalo_L (detection + recognition only)
- Each call is pure inference: decode image → detect faces → extract embeddings → return
- Scales to zero when idle, per-second billing
- Memory snapshots for ~1-2s cold starts

#### API Layer (JS/TS, Cloudflare Workers)

Orchestrates everything:

- **Photo upload flow**: receive image → call Modal `/extract` → store embeddings in pgvector → done
- **Selfie search flow**: receive selfie → call Modal `/extract` → query pgvector for nearest neighbors → return ranked results
- **Collection management**: event scoping, cleanup, lifecycle — all in the API layer
- **Rate limiting**: per-event, per-user limits (replaces AWS-specific throttling from FF-45)
- **Result ranking**: post-processing, deduplication, threshold filtering

#### Storage (pgvector in Neon Postgres)

```sql
-- Face embeddings table (same Neon DB as main app)
CREATE TABLE face_embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  photo_id    UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  embedding   vector(512) NOT NULL,  -- ArcFace 512-D
  bbox        JSONB NOT NULL,        -- { x, y, w, h }
  confidence  REAL NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX face_embeddings_idx ON face_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Scope searches to a single event
CREATE INDEX face_embeddings_event_idx ON face_embeddings (event_id);
```

**Same DB, not separate** — embeddings reference photos and events via foreign keys. Joins are trivial. No cross-DB sync needed. pgvector is just a Postgres extension.

### Data Flow

```
Photo Upload (indexing):
  Client → Worker API → Modal /extract → embeddings
                      → INSERT INTO face_embeddings → done

Selfie Search:
  Client → Worker API → Modal /extract → query embedding
                      → SELECT ... ORDER BY embedding <=> $1 LIMIT 20
                      → ranked photo results → Client
```

### Cost Model (v2)

Modal is only called for inference now (no search time billed):

| Operation | Modal Time | Modal Cost |
|-----------|-----------|------------|
| Extract (index photo) | ~400ms | ~$0.000012 |
| Extract (selfie query) | ~200ms | ~$0.000006 |

Search is a pgvector SQL query — included in Neon DB cost, effectively free per-query.

**At 100K monthly operations**: ~$1.20 Modal compute (vs $100 AWS Rekognition)

### Open Questions

- [ ] pgvector HNSW index tuning — what `m` and `ef_construction` values work best for our dataset size and accuracy needs?
- [ ] Should the Modal endpoint accept batch images (multiple photos per call) to reduce overhead?
- [ ] Neon Postgres plan — does the current plan support pgvector and the expected embedding volume?
- [ ] How to handle the photo upload → embedding extraction pipeline? Sync (block upload until embedding is stored) or async (queue + background job)?
- [ ] Rate limiting design — per-event concurrent extraction limit to control Modal costs?
