# Assumptions & Parameters

For cost evaluation across all components.

**Exchange Rate:** 1 USD = 31.96 THB

---

## Event Parameters

| Parameter | Tier 1 (Early) | Tier 2 (Growing) | Tier 3 (Scale) |
|-----------|----------------|------------------|----------------|
| Events per month | 10 | 50 | 200 |
| Photos per event | 500 | 1,000 | 2,000 |
| Participants per event | 100 | 300 | 500 |
| Selfies per event | 50 | 150 | 250 |

**Derived monthly totals:**

| Metric | Tier 1 | Tier 2 | Tier 3 |
|--------|--------|--------|--------|
| Total photos/month | 5,000 | 50,000 | 400,000 |
| Total participants/month | 1,000 | 15,000 | 100,000 |
| Total selfies/month | 500 | 7,500 | 50,000 |
| Total faces to process | 15,000 | 150,000 | 1,200,000 |

---

## Photo Size Parameters

| Type | Size | Notes |
|------|------|-------|
| **Original upload** | ≤ 5 MB | Max allowed, JPEG from camera |
| **Processed (web/social)** | ~500 KB | Resized for viewing, ~2000px |
| **Thumbnail** | ~50 KB | Gallery grid |
| **Selfie** | ~1 MB | From phone camera |

**Storage strategy:**
- Keep BOTH original + processed
- Original = for download only
- Processed = for viewing/gallery
- Thumbnail = for grid browsing

---

## Face AI Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Faces per photo (avg)** | 3 | Event photos have multiple people |
| Embedding size | ~2 KB | Typical 512-dim float32 vector |
| Selfie faces | 1 | Single face per selfie |

**Face processing per month:**

| Tier | Event photos | Faces (×3) | Selfies | Total faces |
|------|--------------|------------|---------|-------------|
| Tier 1 | 5,000 | 15,000 | 500 | 15,500 |
| Tier 2 | 50,000 | 150,000 | 7,500 | 157,500 |
| Tier 3 | 400,000 | 1,200,000 | 50,000 | 1,250,000 |

---

## Storage Parameters

| Parameter | Value |
|-----------|-------|
| **Retention period** | 30 days |
| **Original retention** | Keep (for download) |
| **Auto-delete after** | 30 days post-event |

**Storage per photo:**
- Original: 5 MB
- Processed: 0.5 MB
- Thumbnail: 0.05 MB
- **Total per photo: ~5.55 MB**

**Monthly storage (peak, before cleanup):**

| Tier | Photos | Storage needed |
|------|--------|----------------|
| Tier 1 | 5,000 | ~28 GB |
| Tier 2 | 50,000 | ~278 GB |
| Tier 3 | 400,000 | ~2.2 TB |

---

## Data Transfer

| Flow | Description | Cost Concern |
|------|-------------|--------------|
| **Ingest** | Photos from camera/desktop → cloud | Usually free |
| **Internal** | Storage ↔ AI processing | Minimize! Same region |
| **Egress (view)** | Thumbnails + processed to participants | Medium |
| **Egress (download)** | Original photos to participants | HIGH |

**Egress estimation per event:**

| Action | Who | Size | Count |
|--------|-----|------|-------|
| View thumbnails | All participants | 50 KB × 20 photos | 1 MB per person |
| View processed | All participants | 500 KB × 10 photos | 5 MB per person |
| Download originals | 50% of participants | 5 MB × 5 photos | 25 MB per person |

**Monthly egress:**

| Tier | Participants | View (all) | Download (50%) | Total |
|------|--------------|------------|----------------|-------|
| Tier 1 | 1,000 | 6 GB | 12.5 GB | ~19 GB |
| Tier 2 | 15,000 | 90 GB | 187 GB | ~277 GB |
| Tier 3 | 100,000 | 600 GB | 1,250 GB | ~1.85 TB |

---

## Peak Traffic

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Peak concurrent uploads** | 20 | Multiple photographers shooting |
| Peak upload rate | ~100 MB/min | 20 uploads × 5 MB |
| Peak concurrent participants | ? | When QR shared - need to estimate |
| Event duration | 2-4 hours | Active shooting window |

---

## Dependencies Between Components

| Decision | Affects |
|----------|---------|
| Photo sizes (5MB/0.5MB/50KB) | Storage cost, egress cost, CDN cost |
| Keep originals | Storage ~10x vs processed only |
| Face AI model | Embedding size → vector storage |
| AI location | Internal data transfer costs |
| 30-day retention | Storage turnover |

---

## Cost Formula

```
Monthly Cost =
  + Storage: (photos × 5.55 MB × retention overlap)
  + AI Compute: (faces × cost per face detection/embedding)
  + Vector Store: (faces × 2 KB embedding)
  + Egress: (participants × ~19 MB avg)
  + API/Compute: (requests × cost)
  + Database: (metadata storage + queries)
```

**Main cost drivers (ranked):**
1. **Egress** - ~277 GB at Tier 2, ~1.85 TB at Tier 3
2. **AI Compute** - 157K faces at Tier 2, 1.25M at Tier 3
3. **Storage** - ~278 GB at Tier 2, ~2.2 TB at Tier 3

