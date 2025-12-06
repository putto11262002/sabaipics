# Complete Pricing Reference - All Services (December 2025)

**Status:** PRICING RESEARCH COMPLETE - Ready for Cost Analysis
**Date:** 2025-12-01
**Exchange Rate:** 1 USD = 31.96 THB

---

## 1. AWS Rekognition (Face AI)

| Operation | Cost | Unit | Free Tier | Notes |
|-----------|------|------|-----------|-------|
| **Tier 1: 0-1M** | $0.001 | per image | 1,000 images/month | DetectFaces, IndexFaces, SearchFacesByImage |
| **Tier 2: 1M-5M** | $0.0008 | per image | (included above) | Volume discount |
| **Tier 3: 5M-35M** | $0.0006 | per image | (included above) | Volume discount |
| **Tier 4: >35M** | $0.0004 | per image | (included above) | Volume discount |
| **Face Storage** | $0.00001 | per face/month | 1,000 faces/month | Metadata storage |

**Key:** Billing unit = per API call (per image), not per face detected
**Source:** https://aws.amazon.com/rekognition/pricing/

---

## 2. Cloudflare R2 (Object Storage)

### Standard Storage
| Component | Cost | Unit | Free Tier | Notes |
|-----------|------|------|-----------|-------|
| **Storage** | $0.015 | per GB-month | 10 GB/month | Ongoing cost |
| **Class A Ops** | $4.50 | per 1M requests | 1M/month | PUT, POST, DELETE |
| **Class B Ops** | $0.36 | per 1M requests | 10M/month | GET, HEAD, LIST |
| **Egress** | $0.00 | per GB | UNLIMITED FREE | **Zero egress fees** |

### Infrequent Access Storage
| Component | Cost | Unit | Free Tier | Notes |
|-----------|------|------|-----------|-------|
| **Storage** | $0.01 | per GB-month | 10 GB/month | Cheaper but min 30 days |
| **Class A Ops** | $9.00 | per 1M requests | 1M/month | More expensive ops |
| **Class B Ops** | $0.90 | per 1M requests | 10M/month | More expensive ops |
| **Data Retrieval** | $0.01 | per GB | None | **Only for infrequent** |
| **Egress** | $0.00 | per GB | UNLIMITED FREE | **Zero egress fees** |

**Source:** https://developers.cloudflare.com/r2/pricing/

---

## 3. Cloudflare CDN (Content Delivery)

| Plan | Monthly Cost | Bandwidth | Requests | Features |
|------|--------------|-----------|----------|----------|
| **Free** | $0 | UNLIMITED FREE | UNLIMITED FREE | Basic caching, DDoS |
| **Pro** | $25/month | UNLIMITED FREE | UNLIMITED FREE | APO, advanced features |
| **Business** | $250/month | UNLIMITED FREE | UNLIMITED FREE | SLA, enterprise features |
| **Enterprise** | Custom | UNLIMITED FREE | UNLIMITED FREE | Custom SLA |

**Key:** All plans have ZERO egress/bandwidth charges
**Source:** https://www.cloudflare.com/plans/

---

## 4. Cloudflare Workers (API Backend)

| Tier | Monthly Cost | Requests | CPU Time | Notes |
|------|--------------|----------|----------|-------|
| **Free** | $0 | 100K/day | 10ms/invocation | Limited |
| **Paid** | $5/month | 10M/month included | 30M CPU-ms/month | Standard tier |
| **Per-Unit** | - | $0.30/1M requests | $0.02/1M CPU-ms | Usage overages |

**Key:** No egress charges, static assets free
**Source:** https://developers.cloudflare.com/workers/platform/pricing/

---

## 5. Cloudflare Durable Objects (WebSocket/Real-time)

| Tier | Monthly Cost | Requests | Duration | Notes |
|------|--------------|----------|----------|-------|
| **Free** | $0 | 100K/day | 13K GB-sec/day | Limited |
| **Paid** | $5/month* | 1M/month included | 400K GB-sec/month | With Workers plan |
| **Per-Unit** | - | $0.15/1M requests | $12.50/1M GB-sec | Usage overages |

*Included in $5 Workers Paid plan
**Source:** https://developers.cloudflare.com/durable-objects/platform/pricing/

---

## 6. Cloudflare Pages (Participant Web App)

| Plan | Monthly Cost | Bandwidth | Builds | Files |
|------|--------------|-----------|--------|-------|
| **Free** | $0 | UNLIMITED FREE | 500/month | 20K max |
| **Paid** | Included in Workers | UNLIMITED FREE | More builds | More files |

**Key:** ZERO egress/bandwidth charges, automatic caching for hashed assets
**Source:** https://developers.cloudflare.com/pages/platform/limits/

---

## 7. Neon Postgres (Database)

| Plan | Monthly Cost | Storage | Compute | Features |
|------|--------------|---------|---------|----------|
| **Free** | $0 | 0.5 GB | 100 CU-hours/month | Good for MVP |
| **Launch** | $5 minimum | $0.35/GB-month | $0.106/CU-hour | Pay-as-you-go |
| **Scale** | $5 minimum | $0.35/GB-month | $0.222/CU-hour | Higher availability |

**Note:** 1 CU = 1 vCPU + 4 GB RAM. Scales to zero after 5 minutes inactivity.
**Source:** https://neon.tech/pricing

---

## 8. LINE Official Account (Messaging)

### Thailand Pricing (with VAT included)

| Plan | Monthly Cost (THB) | Messages Included | Per-Message Overage | Features |
|------|-------------------|-------------------|-------------------|----------|
| **Free** | ฿0 | 300 messages/month | Cannot buy more | Basic |
| **Basic** | ฿1,370 | 15,000 messages/month | ฿0.10 per message | MyShop features |
| **Pro** | ฿1,905 | 35,000 messages/month | ฿0.06 per message | MyCustomer CRM included |

**Conversion to USD:**
- Basic: $42.88/month
- Pro: $59.66/month

**Key:** Messages = number of recipients (broadcast to 100 people = 100 messages)
**Source:** https://lineforbusiness.com/th/service/line-oa-features/broadcast-message

---

## 9. FTP VPS Providers (Self-Hosted Server)

### DigitalOcean Droplets (Singapore region for Asia)

| Size | Monthly Cost | CPU | RAM | SSD | Bandwidth |
|------|--------------|-----|-----|-----|-----------|
| **Nano** | $4/month | 0.5 vCPU | 512 MB | 10 GB | 500 GB transfer |
| **Micro** | $6/month | 1 vCPU | 1 GB | 25 GB | 1 TB transfer |
| **Small** | $12/month | 2 vCPU | 2 GB | 50 GB | 2 TB transfer |

**Egress/Bandwidth:** $0.01/GB overage (includes 500GB-2TB/month free depending on size)
**Source:** https://www.digitalocean.com/pricing/

### Linode Anode (Singapore region)

| Size | Monthly Cost | CPU | RAM | SSD | Bandwidth |
|------|--------------|-----|-----|-----|-----------|
| **Nanode 1GB** | $5/month | 1 vCPU | 1 GB | 25 GB | 1 TB transfer |
| **Linode 2GB** | $12/month | 1 vCPU | 2 GB | 50 GB | 2 TB transfer |
| **Linode 4GB** | $24/month | 2 vCPU | 4 GB | 80 GB | 4 TB transfer |

**Egress/Bandwidth:** $0.01/GB overage (includes 1TB-4TB/month free depending on size)
**Source:** https://www.linode.com/pricing/

### Vultr (Singapore region)

| Size | Monthly Cost | CPU | RAM | SSD | Bandwidth |
|------|--------------|-----|-----|-----|-----------|
| **Cloud Compute $2.50** | $2.50/month | 0.25 vCPU | 512 MB | 10 GB | 0.25 TB transfer |
| **Cloud Compute $6** | $6/month | 1 vCPU | 1 GB | 25 GB | 1 TB transfer |
| **Cloud Compute $12** | $12/month | 2 vCPU | 2 GB | 60 GB | 2 TB transfer |

**Egress/Bandwidth:** $0.01/GB overage (includes 0.25TB-2TB/month free depending on size)
**Source:** https://www.vultr.com/pricing/

---

## 10. Next.js / Vercel (Public Website)

| Plan | Monthly Cost | Bandwidth | Serverless Functions | Build Minutes |
|------|--------------|-----------|----------------------|----------------|
| **Pro** | $20/month | Metered | 1,000,000 invocations | 6,000/month |
| **Bandwidth Overage** | $0.50/GB | After included | - | - |
| **Serverless** | - | - | $0.50 per 1M invocations | - |

**Source:** https://vercel.com/pricing

---

## Summary: Cost-Optimized Architecture

**Completely FREE services (bandwidth):**
- ✅ Cloudflare Pages (participant web) - $0/month
- ✅ Cloudflare Workers API - $0/month (free tier)
- ✅ Cloudflare Durable Objects - included in Workers
- ✅ Cloudflare R2 - $0 egress forever
- ✅ Cloudflare CDN - $0 egress forever

**Minimal cost services:**
- ✅ Neon Postgres - Free tier or $5+/month (pay-as-you-go)
- ✅ FTP VPS - $5-24/month depending on scale

**Service costs (event-driven, low frequency):**
- ✅ AWS Rekognition - $0.001/image for first 1M
- ✅ LINE OA - Free with 300 messages/month

**Vercel (external, not on Cloudflare):**
- ⏳ Next.js public website - $20/month (or free tier)

---

## Key Insights

1. **Zero Egress Strategy Works** - R2 + CDN combo = no bandwidth costs
2. **Cloudflare Bundle** - Workers, Pages, R2, CDN, Durable Objects = cost-optimized
3. **AWS Rekognition** - $0.001/image pricing is very cheap for face search
4. **LINE Thailand** - Free basic plan with 300 messages/month, scales reasonably
5. **FTP VPS** - Self-hosted at $5-24/month beats AWS Transfer Family ($216+/month)

---

**Ready for Phase 3b Cost Calculation**

This pricing reference is complete. All services verified from official sources.
Next: Calculate monthly costs for Tiers 1, 2, 3 based on usage assumptions.

**Last updated:** 2025-12-01
