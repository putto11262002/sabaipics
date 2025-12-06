# Research: Object Storage

**Status:** TODO
**Scope:** Discover and explore options (not decision-making)

---

## Context

We're building an event photo distribution platform. Photographers upload event photos, participants view/download their photos.

**Business context:**
- Fast-follower strategy
- Compete on cost and speed
- Thailand market focus
- Event-driven traffic (spiky, not constant)
- 30-day retention then auto-delete

**Core metric:** Time-to-distribution (camera → participant)

**Design drivers:**
1. Minimize cost (egress is expensive!)
2. Time-to-distribution
3. High velocity dev
4. Fast experience

---

## Requirements

- **S3-compatible API:** Preferred for ecosystem compatibility
- **Asia region:** Needed for latency (Thailand focus)
- **Lifecycle policies:** Auto-delete after 30 days
- **Presigned URLs:** For secure direct upload/download

---

## Storage Strategy

We store THREE versions per photo:
- **Original:** ≤5 MB (for download only)
- **Processed:** ~500 KB (for web viewing, ~2000px)
- **Thumbnail:** ~50 KB (for gallery grid)

**Total per photo:** ~5.55 MB

---

## Scale Parameters

**Storage (peak before cleanup):**

| Tier | Photos/month | Storage needed |
|------|--------------|----------------|
| Tier 1 (Early) | 5,000 | ~28 GB |
| Tier 2 (Growing) | 50,000 | ~278 GB |
| Tier 3 (Scale) | 400,000 | ~2.2 TB |

**Egress (participants downloading/viewing):**

| Tier | Participants | Total egress/month |
|------|--------------|-------------------|
| Tier 1 | 1,000 | ~19 GB |
| Tier 2 | 15,000 | ~277 GB |
| Tier 3 | 100,000 | ~1.85 TB |

**Exchange rate:** 1 USD = 31.96 THB

---

## Categories to Explore

| Category | Explore |
|----------|---------|
| Major cloud providers | |
| Specialty/budget providers | |
| Self-hosted solutions | |

---

## Solutions Found

| Solution | Category | Notes |
|----------|----------|-------|
| | | |

---

## For Each Solution, Capture

### Cost
- Storage cost per GB/month
- Egress cost per GB
- Request costs (PUT/GET)
- Monthly cost at Tier 1 / Tier 2 / Tier 3

### Technical
- S3 API compatibility
- Asia region availability
- Multi-part upload support
- Presigned URL support
- Lifecycle policy support (30-day auto-delete)

### Operational
- Uptime SLA
- Self-host complexity (if applicable)

---

## Integration Considerations

| Connects To | Think About |
|-------------|-------------|
| **Face AI** | Same region to avoid internal transfer costs |
| **CDN** | Native CDN integration? Origin pull? |
| **Image Pipeline** | Upload/download latency |
| **Desktop App** | Direct upload via presigned URL? |
| **API Backend** | Presigned URL generation |

---

## Open Questions

*Capture questions that arise during research*

