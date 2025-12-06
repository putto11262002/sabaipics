# Research: CDN

**Status:** TODO
**Scope:** Discover and explore options (not decision-making)

---

## Context

We're building an event photo distribution platform. CDN serves:
1. **Images:** Photos to participants (main egress)
2. **Static assets:** Web app files

**Business context:**
- Thailand/Asia focus (need good regional coverage)
- Egress cost is major cost driver
- Event-driven traffic (spiky)

**Already decided:**
- Public website: Next.js on Vercel (has built-in CDN)
- Need CDN for image delivery from object storage

**Design drivers:**
1. Minimize cost (egress is expensive)
2. Fast experience (low latency in Thailand)
3. Integration with object storage choice

---

## Requirements

- **Asia/Thailand coverage:** Good PoP presence
- **Image optimization:** On-the-fly resize? (nice to have)
- **Cache invalidation:** When photos deleted after 30 days
- **Custom domains:** SSL/TLS support

---

## Scale Parameters

**Egress (participants downloading/viewing):**

| Tier | Egress/month |
|------|--------------|
| Tier 1 | ~19 GB |
| Tier 2 | ~277 GB |
| Tier 3 | ~1.85 TB |

**Exchange rate:** 1 USD = 31.96 THB

---

## Categories to Explore

| Category | Explore |
|----------|---------|
| General purpose CDNs | |
| Platform-bundled CDNs | Already using Vercel |
| Image-specific CDNs/services | |

---

## Solutions Found

| Solution | Category | Notes |
|----------|----------|-------|
| | | |

---

## For Each Solution, Capture

### Cost
- Bandwidth pricing per GB
- Request pricing
- Monthly cost at Tier 1 / Tier 2 / Tier 3

### Technical
- Asia/Thailand PoP locations
- Cache control options
- Purge/invalidation API
- Image optimization features
- Custom domain + SSL

### Integration
- Works with which object storage?
- Native integration or origin pull?

---

## Integration Considerations

| Connects To | Think About |
|-------------|-------------|
| **Object Storage** | Native pairing? (e.g., some CDN + their storage = free/cheap egress) |
| **Web Apps** | Static asset caching (Vercel already handles public site) |
| **Image Pipeline** | On-the-fly resize possible? |

---

## Key Insight

**CDN choice may be driven by Object Storage choice.**

Some combinations have free or reduced egress:
- Storage provider X + their CDN = free egress?
- Need to evaluate storage + CDN together

---

## Open Questions

*Capture questions that arise during research*

