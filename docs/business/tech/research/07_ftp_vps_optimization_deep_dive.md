# Research Log: FTP Proxy VPS Optimization for Cost

**Status:** IN PROGRESS
**Date Created:** 2025-12-01
**Context:** FTP endpoint must be always-on. Decision: self-hosted VPS (cheaper than managed AWS Transfer Family). Need to optimize for cost without sacrificing reliability.
**Problem:** Standard VPS selection criteria (CPU, RAM) don't apply here. FTP proxy is purely I/O-bound - a glorified socket forwarder.
**Goal:** Define the minimal viable VPS spec that handles peak traffic at lowest cost, identify monitoring needs

---

## 1. Strategic Context: Why This Matters

### 1.1 The Economics
From `07_ftp_server_result.md`:
- **Self-hosted EC2 t4g.nano**: ~$7.5/month (Tier 1) to ~$93/month (Tier 3)
- **AWS Transfer Family**: ~$216/month + per-GB fees = $228-450/month
- **Gap**: Self-hosting saves 60-70% but requires operational management

**If we get VPS sizing wrong:**
- **Over-provisioned:** Paying for unused CPU/RAM that we never use
- **Under-provisioned:** Connection drops, timeouts, data loss during peak events
- **Optimization goal:** Bare minimum for reliable peak handling

### 1.2 Why CPU is NOT the Constraint

**FTP proxy workflow:**
```
Camera (socket A) → [Server process] → S3/cloud storage (socket B)
                   (just forwards bytes)
```

**Resource usage pattern:**
- **CPU**: Minimal. Each byte forwarded = ~1 CPU cycle. At 100 MB/min peak, that's tiny.
- **RAM**: Moderate. Buffer for in-flight data, connection state tracking.
- **Network I/O**: **CRITICAL.** The actual bottleneck.
- **Bandwidth**: Must not saturate.
- **Connection handling**: Must support 20 concurrent FTP uploads.

**Example:** A dual-core 2 GHz CPU can theoretically forward **multi-gigabit** traffic if network doesn't choke. The VPS network card, provider bandwidth, and server-to-S3 path are the real limits.

---

## 2. Key Parameters: What We Need to Profile

### 2.1 Peak Traffic Profile (from assumptions)

| Metric | Value |
| --- | --- |
| **Peak concurrent FTP uploads** | 20 photographers |
| **Peak upload rate per photographer** | 5 MB/file (typical DSLR JPEG) |
| **Peak aggregate bandwidth** | 20 × 5 MB = **100 MB/min** = **1.67 MB/sec** |
| **Event duration** | 2-4 hours (peak upload window) |
| **Monthly events** | Tier 1: 10, Tier 2: 50, Tier 3: 200 |

### 2.2 Connection Model

**FTP connections:** Each photographer = 1 control connection + 1 data connection (active/passive mode)
- Tier 1: 20 uploads → **20-40 TCP connections** open simultaneously
- Tier 2: 20 uploads → **20-40 TCP connections** (same peak, not cumulative)
- Tier 3: 20 uploads → **20-40 TCP connections** (same peak)

**Key insight:** Connection count is **peak concurrent**, not cumulative. Tier 3 doesn't mean more simultaneous connections, just more events per month using the same resource.

### 2.3 Data Transfer & Storage

| Tier | Total upload/month | Peak per-event | Sustained rate |
| --- | --- | --- | --- |
| Tier 1 | 180 GB | 18 GB | Low |
| Tier 2 | 900 GB | 18 GB | Medium |
| Tier 3 | 3,600 GB (3.6 TB) | 18 GB | High |

**For VPS sizing:** Peak per-event (18 GB over 3 hours) matters more than monthly total. All tiers have same peak concurrent bandwidth.

---

## 3. VPS Spec Optimization: What NOT to Pay For

### 3.1 CPU Cores - OVER-PROVISIONED IN FTP USE CASE

**Standard wisdom:** "More cores = more connections"
- **True for:** Web servers, API gateways, multi-threaded workloads
- **False for:** FTP proxy forwarding

**Why?**
- Single-threaded proxy handling 40 connections: ~200 CPU cycles per MB
- At 1.67 MB/sec = ~334 CPU cycles/sec (negligible)
- Even 1 CPU core @ 2 GHz = 2 billion cycles/sec = **6,000x headroom**

**Recommendation:** DO NOT pay for multi-core. Single-core or dual-core is MORE than enough.

**Cost implication:**
- t4g.nano (0.5 vCPU): ~$3.80/month
- t4g.micro (1 vCPU): ~$8.50/month
- t4g.small (2 vCPU): ~$16.80/month
- **We want nano or micro.**

### 3.2 RAM - MODERATELY IMPORTANT

**FTP proxy RAM usage:**
- OS + basic services: ~100-200 MB
- FTP daemon (vsftpd, SFTPGo): ~50-100 MB
- Per-connection state: ~1-5 MB per connection
- Buffer for in-flight data: ~50-200 MB

**At peak (20-40 connections):**
- Expected RAM: ~200 (base) + 40×2 (state) + 150 (buffer) = **~430 MB**
- Safe headroom: **512 MB** minimum, **1 GB** comfortable

**Cost implication:**
- t4g.nano: 512 MB RAM
- t4g.micro: 1 GB RAM
- t4g.small: 2 GB RAM
- **512 MB might be tight during peak; 1 GB is safe.**

### 3.3 Network & Bandwidth - CRITICAL

**This is where you actually DO pay attention.**

Factors:
- **Provider's network capacity:** Can they sustain 1.67 MB/sec egress? (Most can, but cheaper VPS might throttle)
- **Data center egress pricing:** Many providers charge $0.10-0.20 per GB egress
- **AWS S3 egress:** If uploading from VPS → S3, you pay both:
  - VPS provider egress (VPS → internet)
  - AWS S3 egress (if S3 in different region: $0.02-0.12/GB)

**Optimization strategy:**
- Use provider in same geography as S3 region (if possible)
- Or: VPS uploads to S3 in same region (free internal transfer)
- Avoid double-egress charges

### 3.4 Storage - MINIMAL

**What does the VPS need to store?**
- OS: ~5 GB
- FTP daemon + tools: ~1 GB
- Temporary buffer (mid-flight files): **0 GB if you stream directly to S3**

**If using SFTPGo or vsftpd with direct S3 integration:**
- No local disk storage needed beyond OS
- 10-20 GB root volume is plenty
- **Do not pay for large storage.**

---

## 4. Network I/O Bottleneck Analysis

### 4.1 Where Does Bandwidth Come From?

**1. VPS Provider's upstream capacity**
- Budget VPS: 1 Mbps shared (too slow!)
- Standard VPS: 100-1000 Mbps (enough for 1.67 MB/sec = 13.4 Mbps)
- Premium VPS: 10 Gbps+ (overkill)

**2. Your allocated bandwidth**
- Some providers give "1 Mbps guaranteed" + burst to higher
- Others give "unmetered" (fair-use policy)
- Need **at least 100 Mbps burst capacity** for 1.67 MB/sec peak

**3. Path to S3**
- S3 in same region: free internal AWS transfer
- S3 in different region: $0.02/GB egress from S3
- S3 in different provider region: also pay VPS egress + S3 egress

### 4.2 Provider Bandwidth Pricing (Typical)

| Provider | Type | Egress cost | Notes |
| --- | --- | --- | --- |
| **AWS EC2 (t4g.nano)** | Cloud | $0.02/GB to S3 (same region) | Included in region transfer |
| **Linode** | Budget | $0.01/GB after 1 TB free | Competitive egress pricing |
| **DigitalOcean** | Budget | $0.01/GB after included allowance | 250 GB/month included |
| **Vultr** | Budget | $0.01/GB after 1 TB free | Also includes DDoS protection |
| **Hetzner** | Budget (EU/Asia) | €0.0079/GB (~$0.0088) | Cheapest egress in EU |
| **OVH** | Budget (EU/Asia) | ~$0.01/GB | Good for Asia peering |

### 4.3 Total Egress Cost Per Tier

Assuming VPS → S3 (same region):

| Tier | Monthly upload | Egress cost @ $0.01/GB | Notes |
| --- | --- | --- | --- |
| Tier 1 | 180 GB | $1.80 | Negligible |
| Tier 2 | 900 GB | $9.00 | Still cheap |
| Tier 3 | 3,600 GB | $36.00 | Adds up but manageable |

**If using AWS Transfer Family instead:**
- $216/month fixed + $0.04/GB egress
- Tier 3: $216 + ($0.04 × 3,600) = $216 + $144 = **$360/month**
- vs self-hosted: $16.80 (VPS) + $36 (egress) = **$52.80/month**
- **Savings: 85% ($307/month)**

---

## 5. VPS Spec Recommendations by Tier

### 5.1 Recommended Configuration

| Spec | Recommendation | Rationale |
| --- | --- | --- |
| **CPU** | 1-2 vCPU (burstable OK) | Plenty for I/O-bound proxy |
| **RAM** | 1 GB minimum, 2 GB comfortable | Buffer for connections + data |
| **Disk** | 10-20 GB SSD | OS + cache only, not bulk storage |
| **Bandwidth** | ≥100 Mbps sustained | Must handle 1.67 MB/sec peak |
| **Egress pricing** | <$0.02/GB | Prefer <$0.01/GB if possible |
| **Region** | Same as S3 target region | Avoid double-egress fees |

### 5.2 Tier-Specific Recommendations

**Tier 1 (180 GB/month, 10 events):**
- Suggested: **DigitalOcean Droplet or Linode Nanode** (t4g.nano equivalent)
- Spec: 1 vCPU, 512 MB-1 GB RAM, 25 GB SSD
- Est. cost: **$5-6/month** + $1.80 egress = **$6.80/month**
- Handles 20 concurrent FTP connections easily

**Tier 2 (900 GB/month, 50 events):**
- Suggested: **DigitalOcean Droplet or Linode Linode 2GB** (t4g.micro equivalent)
- Spec: 1 vCPU, 1-2 GB RAM, 50 GB SSD
- Est. cost: **$6-12/month** + $9.00 egress = **$15-21/month**
- Same concurrent connection capacity; more monthly volume (no resource impact)

**Tier 3 (3,600 GB/month, 200 events):**
- Suggested: **DigitalOcean Droplet or Linode Linode 2GB / 4GB** (t4g.micro/small equivalent)
- Spec: 1-2 vCPU, 2 GB RAM, 50 GB SSD
- Est. cost: **$12-18/month** + $36 egress = **$48-54/month**
- Still under-utilizes CPU; same connection model

---

## 6. Monitoring & Scaling Strategy (FLAGGED)

### 6.1 What We Need to Monitor

**Performance metrics:**
- [ ] FTP connection count (should peak at ~40, not exceed 100)
- [ ] Bandwidth usage (should peak at ~1.67 MB/sec, burst up to 100 Mbps)
- [ ] RAM usage (should stay <70% of available)
- [ ] Disk space (should never fill up)
- [ ] Network latency (S3 upload latency)
- [ ] Upload success rate (% of files that complete successfully)

**Operational metrics:**
- [ ] FTP server uptime (target: 99.9% during events)
- [ ] Error logs (connection drops, timeouts, auth failures)
- [ ] S3 upload latency (should be <5 sec per file)

### 6.2 Scaling Triggers (TBD)

**When to upgrade VPS?**
- If bandwidth usage consistently >80% of available
- If connection count approaches 100+
- If RAM usage >80% sustained
- If upload failure rate >1%

**Scaling options:**
- [ ] Vertical: upgrade to larger VPS (add vCPU, RAM)
- [ ] Horizontal: run 2 FTP endpoints with load balancing (advanced)
- [ ] Hybrid: split by geography (US/EU/Asia FTP endpoints)

**This will require separate decision later.**

### 6.3 Monitoring Stack

**Quick wins:**
- [ ] CloudWatch (if AWS EC2) or provider's dashboard
- [ ] vsftpd/SFTPGo built-in logging → CloudWatch Logs
- [ ] Basic alerting: if CPU >80%, bandwidth >80%, errors spike

**To be determined:** Exact alerting rules, dashboards, incident response procedures

---

## 7. Open Questions to Answer

| Question | Priority | Answer | Research Source |
| --- | --- | --- | --- |
| Does SFTPGo support direct S3 upload streaming? | HIGH | TBD | SFTPGo docs |
| What's the actual throughput of t4g.nano/micro at max connections? | HIGH | TBD | Benchmark test |
| Can we use single VPS or do we need 2 for HA? | HIGH | TBD | Failure analysis |
| What's the cheapest egress-friendly provider (Asia region)? | MEDIUM | TBD | Provider comparison |
| Should we use SFTP or FTP? Does it matter for cost? | MEDIUM | TBD | Protocol analysis |
| Do we need DDoS protection? (photographers upload from home) | LOW | TBD | Security assessment |

---

## 8. Risk Factors

### 8.1 Single Point of Failure

**If FTP endpoint goes down:**
- All photographers at event can't upload
- Workaround: fallback to web upload UI
- Cost: Need backup endpoint (doubles cost) or accept risk

**Decision needed:** Accept single-point risk for MVP, or pay for HA?

### 8.2 Network Saturation During Large Events

**If 40 photographers all upload simultaneously:**
- 1.67 MB/sec aggregate = could spike higher
- Depends on AWS S3 connection limits (essentially unlimited)
- Depends on VPS provider's upstream capacity

**Mitigation:** Monitor bandwidth; if consistently at limit, upgrade provider or add regional endpoints

### 8.3 Cost Variance

**If usage exceeds Tier 3 assumptions:**
- More photographers per event → more concurrent connections
- Larger files (RAW instead of JPEG) → more bandwidth
- Egress costs could spike

**Mitigation:** Monitor egress monthly; set budget alerts

---

## 9. Cost Comparison: Final Summary

**FTP Endpoint Cost by Tier (Self-Hosted VPS)**

| Component | Tier 1 | Tier 2 | Tier 3 |
| --- | --- | --- | --- |
| VPS (t4g.nano/micro) | $5.50/mo | $9.00/mo | $15/mo |
| Egress (@ $0.01/GB) | $1.80/mo | $9.00/mo | $36.00/mo |
| **TOTAL** | **$7.30/mo** | **$18/mo** | **$51/mo** |
| **+ Thai (×31.96)** | **฿233** | **฿576** | **฿1,630** |

**vs AWS Transfer Family (managed, no ops)**

| Component | Tier 1 | Tier 2 | Tier 3 |
| --- | --- | --- | --- |
| Transfer Family endpoint | $216/mo | $216/mo | $216/mo |
| Egress (@ $0.04/GB) | $7.20/mo | $36/mo | $144/mo |
| **TOTAL** | **$223.20/mo** | **$252/mo** | **$360/mo** |
| **+ Thai (×31.96)** | **฿7,134** | **฿8,051** | **฿11,506** |

**Savings (self-hosted vs managed):**
- Tier 1: **96.7%** ($215.90/mo saved)
- Tier 2: **92.9%** ($234/mo saved)
- Tier 3: **85.8%** ($309/mo saved)

---

## 10. Recommendation

**For MVP: Self-hosted VPS**
- **Spec:** t4g.micro equivalent (1 vCPU, 1 GB RAM, ~10 GB SSD)
- **Provider:** DigitalOcean, Linode, or Vultr (low egress cost, good Asia peering)
- **Region:** Same AWS region as S3 bucket (free internal transfer)
- **Cost:** $7-51/month depending on tier + monitoring

**Operational considerations:**
- [ ] Need monitoring dashboard for bandwidth, connections, uptime
- [ ] Need scaling strategy if peak exceeds capacity
- [ ] Need backup plan if endpoint fails (fallback web upload)
- [ ] Monthly egress billing watch (don't get surprised)

---

## 11. Resolution (To Be Filled)

**VPS spec finalized:**
*[TBD after further investigation]*

**Monitoring & scaling strategy:**
*[TBD in separate research]*

**Decision confirmed:**
- [ ] Proceed with self-hosted VPS
- [ ] Upgrade to managed transfer service
- [ ] Hybrid approach

---

**Last updated:** 2025-12-01
**Next research:** Monitoring & scaling strategy, provider selection deep-dive
