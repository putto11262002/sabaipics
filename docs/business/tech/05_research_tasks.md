# Research Tasks

Each task should use parameters from 04_assumptions.md for cost evaluation.

**Exchange Rate:** 1 USD = 31.96 THB

---

## Research 1: Face Detection & Embedding

**Priority:** HIGH

**Question:** What's the cheapest way to get 98%+ accuracy face detection and embedding?

**Options to explore:**
- Self-hosted models (InsightFace, DeepFace, dlib, FaceNet)
- Cloud APIs (AWS Rekognition, Google Vision, Azure Face, Clarifai)
- Hybrid (self-host detection, API for embedding?)

**Evaluate against:**
| Tier | Faces/month |
|------|-------------|
| Tier 1 | 15,500 |
| Tier 2 | 157,500 |
| Tier 3 | 1,250,000 |

**Output needed:**
- Cost per face (detection + embedding) in USD and THB
- Accuracy benchmarks (must be 98%+)
- Latency per face (affects time-to-distribution)
- Self-host: GPU requirements, cold start time
- Monthly cost at each tier

**Affects:** Image Pipeline, Vector Store (embedding size)

---

## Research 2: Object Storage

**Priority:** HIGH

**Question:** What's the cheapest storage with low egress costs?

**Options to explore:**
- AWS S3
- Cloudflare R2 (free egress!)
- Backblaze B2
- DigitalOcean Spaces
- Self-hosted (MinIO)

**Evaluate against:**
| Tier | Storage | Egress/month |
|------|---------|--------------|
| Tier 1 | 28 GB | 19 GB |
| Tier 2 | 278 GB | 277 GB |
| Tier 3 | 2.2 TB | 1.85 TB |

**Output needed:**
- Storage cost per GB/month
- Egress cost per GB
- Monthly total at each tier (USD + THB)
- API compatibility (S3-compatible?)
- Region availability (need Asia for latency)

**Affects:** CDN choice, AI pipeline location

---

## Research 3: Vector Store

**Priority:** MEDIUM

**Question:** Best option for face embedding search at our scale?

**Options to explore:**
- pgvector (Postgres extension) - can use with Neon?
- Pinecone (managed)
- Qdrant (self-host or cloud)
- Weaviate
- Milvus

**Evaluate against:**
| Tier | Embeddings | Queries/month |
|------|------------|---------------|
| Tier 1 | 15,500 | ~1,000 searches |
| Tier 2 | 157,500 | ~15,000 searches |
| Tier 3 | 1,250,000 | ~100,000 searches |

**Embedding spec:** 512-dim float32 (~2KB each)

**Output needed:**
- Cost per 1M vectors stored
- Cost per 1M queries
- Monthly cost at each tier
- Query latency (p50, p99)
- Scale-to-zero capability?
- Can pgvector on Neon handle this?

**Affects:** Database choice, search latency

---

## Research 4: API Backend Framework

**Priority:** HIGH

**Question:** Best backend framework for our needs?

**Requirements:**
- Websocket support (real-time updates)
- Serverless-friendly (scale to zero)
- High velocity development
- TypeScript or Go preferred

**Options to explore:**
- Node.js: Hono, Fastify, NestJS
- Go: Fiber, Echo, Chi
- Serverless-specific: SST, Serverless Framework

**Output needed:**
- Websocket support quality
- Serverless deployment options (Vercel, AWS Lambda, Cloudflare Workers)
- Cold start times
- Developer experience / ecosystem
- Recommendation with rationale

**Affects:** All API endpoints, real-time notifications

---

## Research 5: LINE LIFF Capabilities

**Priority:** HIGH

**Question:** What can we build inside LINE LIFF?

**Need to know:**
- Camera/selfie access - can LIFF access phone camera?
- File upload capabilities
- Storage/caching limitations
- UX constraints (size, navigation)
- LINE OA integration requirements
- Push notification capabilities
- Cost (LINE OA pricing)

**Output needed:**
- Feature matrix (what's possible vs not)
- Limitations that affect our UX
- LINE OA pricing for notifications
- Recommendation: LIFF vs external web app

**Affects:** Participant UX, Face Capture flow

---

## Research 6: Real-time Notification Mechanism

**Priority:** MEDIUM

**Question:** How does Image subsystem notify App when processing complete?

**Options to explore:**
- Direct websocket from worker
- Message queue (Redis pub/sub, AWS SQS/SNS)
- Database polling
- Webhook callback
- Serverless-friendly pub/sub (Upstash, Ably, Pusher)

**Requirements:**
- Low latency (< 1 second)
- Works with serverless (scale to zero)
- Cost-effective at our scale

**Output needed:**
- Latency comparison
- Cost at each tier
- Complexity to implement
- Serverless compatibility

**Affects:** Time-to-distribution, Architecture complexity

---

## Research 7: FTP Server

**Priority:** LOW

**Question:** How to provide FTP endpoint for cameras?

**Options:**
- Self-hosted FTP server (vsftpd, ProFTPD)
- Managed service?
- Custom implementation on serverless?

**Requirements:**
- Accept uploads from Nikon Z8/Z9, Canon, Sony cameras
- Forward to our ingest pipeline
- Handle 20 concurrent uploads

**Output needed:**
- Feasibility of serverless FTP
- Self-host requirements (always-on server?)
- Cost implications
- Integration with ingest pipeline

**Affects:** Photographer workflow, Infrastructure (may need always-on server)

---

## Research 8: CDN

**Priority:** LOW

**Question:** Best CDN for our use case?

**Options:**
- Cloudflare (pairs well with R2)
- Vercel Edge (already using for website)
- AWS CloudFront
- Bunny CDN

**Evaluate against:**
| Tier | Egress/month |
|------|--------------|
| Tier 2 | 277 GB |
| Tier 3 | 1.85 TB |

**Output needed:**
- Pricing at each tier
- Asia/Thailand PoP availability
- Integration with storage choice

**Affects:** Image delivery latency, Egress costs

---

## Summary

| # | Topic | Priority | Blocking? |
|---|-------|----------|-----------|
| 1 | Face AI | HIGH | Yes - core feature |
| 2 | Object Storage | HIGH | Yes - affects cost model |
| 3 | Vector Store | MEDIUM | Partial - pgvector may work |
| 4 | API Backend | HIGH | Yes - need to start building |
| 5 | LINE LIFF | HIGH | Yes - participant UX |
| 6 | Real-time | MEDIUM | No - can iterate |
| 7 | FTP Server | LOW | No - can defer |
| 8 | CDN | LOW | No - Cloudflare likely |

