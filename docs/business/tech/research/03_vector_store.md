# Research: Vector Store

**Status:** TODO
**Scope:** Discover and explore options (not decision-making)

---

## Context

We're building an event photo distribution platform with face recognition. We need to store face embeddings and search for matches when participants submit selfies.

**Business context:**
- Fast-follower strategy
- Compete on cost and speed
- Event-driven traffic (spiky, not constant)
- Already using Postgres on Neon (serverless) for metadata

**Core metric:** Time-to-distribution (fast search = participants get photos faster)

**Design drivers:**
1. Minimize cost
2. Fast search latency (<100ms)
3. High velocity dev
4. Scale-to-zero preferred

---

## Requirements

- **Embedding size:** 512-dim float32 (~2KB each) - typical, may vary by Face AI choice
- **Search latency:** <100ms
- **Filtering:** Must filter by event_id (don't search all embeddings, just current event)
- **Scale-to-zero:** Preferred (event-driven usage)

---

## Scale Parameters

**Embeddings stored:**

| Tier | Event photos | Faces (×3) | Selfies | Total embeddings |
|------|--------------|------------|---------|------------------|
| Tier 1 (Early) | 5,000 | 15,000 | 500 | 15,500 |
| Tier 2 (Growing) | 50,000 | 150,000 | 7,500 | 157,500 |
| Tier 3 (Scale) | 400,000 | 1,200,000 | 50,000 | 1,250,000 |

**Searches per month:**

| Tier | Participants | Searches (assume 1 per participant) |
|------|--------------|-------------------------------------|
| Tier 1 | 1,000 | ~1,000 |
| Tier 2 | 15,000 | ~15,000 |
| Tier 3 | 100,000 | ~100,000 |

**Storage:** 1.25M embeddings × 2KB = ~2.5 GB at Tier 3

**Exchange rate:** 1 USD = 31.96 THB

---

## Categories to Explore

| Category | Explore |
|----------|---------|
| Postgres extensions | Can use with Neon serverless? |
| Dedicated vector DBs (managed) | |
| Dedicated vector DBs (self-hosted) | |
| Serverless vector solutions | |

---

## Solutions Found

| Solution | Category | Notes |
|----------|----------|-------|
| | | |

---

## For Each Solution, Capture

### Cost
- Storage cost (per vector or per GB)
- Query cost (per query or per 1K)
- Monthly cost at Tier 1 / Tier 2 / Tier 3

### Technical
- Supported embedding dimensions
- Index types (HNSW, IVF, etc.)
- Filtering support (by event_id)
- Query latency (p50, p99)
- Batch insert performance
- Accuracy vs speed tradeoffs

### Operational
- Scale-to-zero capability
- Cold start time
- Self-host complexity (if applicable)
- Works with Neon? (if Postgres extension)

---

## Integration Considerations

| Connects To | Think About |
|-------------|-------------|
| **Face AI** | Embedding size must match what AI produces |
| **Metadata DB (Neon)** | Can Postgres extension simplify architecture? |
| **API Backend** | Query interface, connection pooling |
| **Serverless** | Cold start affects search latency |

---

## Open Questions

*Capture questions that arise during research*

