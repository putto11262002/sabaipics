# Research: FTP Server

**Status:** TODO
**Scope:** Discover and explore options (not decision-making)

---

## Context

We're building an event photo distribution platform. Professional photographers use cameras (Nikon Z8/Z9, Canon, Sony) that can upload directly via FTP during events. This is a drop-in replacement requirement - photographers expect FTP to work like competitors.

**Business context:**
- Drop-in replacement strategy (match competitor workflows)
- Photographers won't change how they work
- Event-driven traffic (FTP only used during events)

**Competitor context:**
- Pixid: Has FTP + Lightroom plugin
- SiKram: Has FTP via Cloud Sync

**Design drivers:**
1. Drop-in compatibility (photographers expect this)
2. Minimize cost
3. Forward to ingest pipeline

---

## Requirements

- **Protocol:** FTP/SFTP (what cameras support)
- **Concurrent uploads:** Handle 20 simultaneous
- **Throughput:** ~100 MB/minute peak (20 uploads × 5MB)
- **Integration:** Forward to image processing pipeline
- **Auth:** Per-event credentials for photographers

---

## Scale Parameters

| Tier | Events/month | Active FTP hours/month |
|------|--------------|------------------------|
| Tier 1 | 10 | ~30 hours |
| Tier 2 | 50 | ~150 hours |
| Tier 3 | 200 | ~600 hours |

**Note:** FTP is idle most of the time - only active during event shooting (2-4 hours per event)

**Exchange rate:** 1 USD = 31.96 THB

---

## Categories to Explore

| Category | Explore |
|----------|---------|
| Traditional FTP servers (self-hosted) | |
| Managed FTP services | |
| Serverless approaches | |
| FTP alternatives (if cameras support) | |

---

## Solutions Found

| Solution | Category | Notes |
|----------|----------|-------|
| | | |

---

## For Each Solution, Capture

### Technical
- FTP/SFTP support
- Passive mode support (important for firewalls)
- TLS/security
- Concurrent connection handling
- Integration options (webhook, S3, etc.)

### Cost
- Fixed monthly cost (if always-on)
- Per-upload or per-GB cost
- Monthly cost at Tier 1 / Tier 2 / Tier 3

### Operational
- Always-on required? (breaks scale-to-zero)
- Self-host complexity
- Monitoring/logging

---

## Integration Considerations

| Connects To | Think About |
|-------------|-------------|
| **Ingest Pipeline** | How to trigger processing when file uploaded? |
| **Object Storage** | Upload direct to storage or relay? |
| **Auth** | Per-event credentials, how to manage? |
| **Serverless arch** | FTP may require always-on server |

---

## Camera Compatibility Research

Need to understand what protocols pro cameras actually support:

| Camera | Protocols? | Notes |
|--------|------------|-------|
| Nikon Z8/Z9 | | |
| Canon R5/R6/R5II | | |
| Sony Alpha series | | |

---

## Key Question

**Does FTP break our serverless/scale-to-zero architecture?**

If FTP requires always-on server, what's the minimum cost to run it?

---

## Open Questions

*Capture questions that arise during research*

