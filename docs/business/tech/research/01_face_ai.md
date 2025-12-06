# Research: Face Detection & Embedding

**Status:** TODO
**Scope:** Discover and explore options (not decision-making)

---

## Context

We're building an event photo distribution platform. Photographers upload event photos, participants submit selfies, and we match them using face recognition.

**Business context:**
- Fast-follower strategy (copy proven features)
- Compete on cost and speed
- Thailand market focus
- Event-driven traffic (spiky, not constant)

**Core metric:** Time-to-distribution (camera → participant)

**Design drivers:**
1. Minimize cost
2. Time-to-distribution (fast processing)
3. High velocity dev
4. Fast experience
5. Face accuracy 98%+

---

## Requirements

- **Accuracy:** 98%+ face recognition
- **Operations:** Face detection + embedding generation
- **Input:** JPEG photos ≤5MB, selfies ~1MB
- **Avg faces per photo:** 3
- **Latency:** Fast (affects time-to-distribution)
- **Scale-to-zero:** Preferred (event-driven, not constant traffic)

---

## Scale Parameters

| Tier | Photos/month | Faces (×3) | Selfies | Total faces |
|------|--------------|------------|---------|-------------|
| Tier 1 (Early) | 5,000 | 15,000 | 500 | 15,500 |
| Tier 2 (Growing) | 50,000 | 150,000 | 7,500 | 157,500 |
| Tier 3 (Scale) | 400,000 | 1,200,000 | 50,000 | 1,250,000 |

**Exchange rate:** 1 USD = 31.96 THB

---

## Categories to Explore

| Category | Explore |
|----------|---------|
| Self-hosted open source models | |
| Cloud AI APIs | |
| Edge/on-device solutions | |
| Hybrid approaches | |

---

## Solutions Found

| Solution | Category | Notes |
|----------|----------|-------|
| | | |

---

## For Each Solution, Capture

### Cost
- Pricing model (per face, per 1K, subscription?)
- Cost per face (detection + embedding)
- Monthly cost at Tier 1 / Tier 2 / Tier 3

### Technical
- Accuracy benchmarks
- Embedding dimensions
- Latency per face
- GPU requirements (if self-hosted)
- Cold start time
- Batch processing support?

### Operational
- Self-host complexity
- Scale-to-zero possible?
- Regional availability (Asia?)

---

## Integration Considerations

| Connects To | Think About |
|-------------|-------------|
| **Object Storage** | Where do images come from? Data transfer costs if different regions |
| **Vector Store** | Embedding size affects vector storage needs |
| **Image Pipeline** | How does it fit in processing flow? |
| **Serverless** | Cold start? GPU on serverless? |

---

## Open Questions

*Capture questions that arise during research*

