# Tech Decisions

Status: **PHASE 3a COMPLETE** - All 18 components decided. Phase 3b pricing validation complete.

---

## Global Standards

| Standard | Version | Applies To |
|----------|---------|------------|
| **TypeScript** | v5 | All frontend/JS code |
| **Node.js** | LTS | Runtime |
| **Tailwind CSS** | v4 | All styling |

---

## Decided (21 Components - All Finalized)

| Component | Decision | Rationale |
|-----------|----------|-----------|
| **Authentication** | Clerk (LINE + Google + Email OTP) | Native LINE support, Google for photographers, Email OTP (passwordless) as fallback. See dev/research/clerk_line_auth.md |
| **Billing/Credits** | Custom + Stripe Direct | Clerk Billing doesn't support usage-based credits. See dev/research/clerk_billing_credits.md |
| **Public Website** | Next.js (static export) on Cloudflare Pages | Static marketing site, $0/month, unlimited bandwidth, native Cloudflare integration |
| **Participant Web App** | React on Cloudflare Pages | Static SPA, hashed assets, zero cost bandwidth, global CDN, SPA routing built-in |
| **Dashboard UI** | React + Tailwind v4 + shadcn | Industry standard, fast to build, consistent components |
| **Desktop App** | Wails + React | Go backend, shared UI code with web |
| **Lightroom Plugin** | Lua | Required by Lightroom SDK |
| **LINE LIFF Mini-App** | LIFF SDK + React | In-app search experience for LINE-native users |
| **Face Detection + Embedding** | AWS Rekognition (us-west-2, 1 collection per event) | $0.001/image, $0.00001/face/month storage. Region: us-west-2 for 10x throughput (50 TPS vs 5 TPS). One collection per event for isolation + easy cleanup. See dev/research/rekognition_collection_pricing.md, log/009 |
| **Participant Flow** | Hybrid: Web-first + LINE LIFF | Web path primary, LIFF secondary. See log/001_resolution.md |
| **FTP Endpoint** | Self-hosted VPS (DigitalOcean) | $4/month, cost-optimized, I/O-bound proxy. See log/003 |
| **Object Storage** | Cloudflare R2 | $0.60/month (50 GB storage), zero egress fees, pricing validated in log/004 |
| **Content Delivery (CDN)** | Cloudflare CDN (Free Plan) | Unlimited bandwidth, 95-99% cache hit rate (Thailand geographic focus), pricing validated in log/005 |
| **LINE Integration** | LINE OA + Messaging API + LIFF | Basic plan $42.88/month (5,000 messages/month = 50% of photos sent once) |
| **API Backend** | Hono on Cloudflare Workers | $0/month (free tier), lightweight RPC, serverless-native. See log/006 |
| **Real-time WebSocket** | Cloudflare Durable Objects | $0/month (free tier with Workers), photographer alerts. See log/006 |
| **Rate Limiting** | Cloudflare Durable Objects + WAF | Per-user limits (Durable Objects), per-IP limits (WAF). Zero cost when idle, <1ms latency. See dev/tech/03_api_design.md |
| **Database** | Postgres on Neon | $0/month (free tier), scale-to-zero, pay-per-use |
| **Image Pipeline** | Cloudflare Workers + Queues + Cloudflare Images | Validation, async processing via Queues (40-45 TPS to Rekognition), on-demand transforms. See log/007, log/009 |
| **UI Framework** | Tailwind + shadcn | Fast to build, consistent across all frontends |

---

## Phase 3b Cost Summary

**Monthly Infrastructure Cost (Tier 1: 10,000 photos/month):**
- Total: **$43.58/month** (฿1,391)
- With 30-40% overhead buffer: **$56-61/month**

See `/docs/tech/research/11_cost_analysis_simplified.md` for detailed breakdown.

---

## Architecture with Decisions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FRONTENDS (TypeScript v5, Tailwind v4)                                      │
│  • Public Website      → Next.js (static export) on Cloudflare Pages ✓      │
│  • Participant Web     → React on Cloudflare Pages ✓                        │
│  • Dashboard (React)   → Tailwind v4 + shadcn ✓                             │
│  • Desktop App         → Wails + React (shared UI) ✓                        │
│  • Lightroom Plugin    → Lua ✓                                              │
│  • LINE LIFF Mini-App  → LIFF SDK + React (search in LINE) ✓               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AUTH & BILLING                                                              │
│  • Authentication      → Clerk (LINE + Google + Email OTP) ✓                │
│  • Billing/Credits     → Custom credit system + Stripe Direct ✓             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ APPLICATION SUBSYSTEM                                                       │
│                                                                             │
│  • API Server          → Hono on Cloudflare Workers ✓ (RPC framework)      │
│  • Rate Limiting       → Durable Objects + WAF ✓ (per-user + per-IP)       │
│  • WebSocket/Real-time → Cloudflare Durable Objects ✓ (photographer alerts) │
│  • Search API          → Vector query (find matching photos) ✓              │
│  • Messaging API       → LINE OA sends results back to participants ✓       │
│  • Metadata DB         → Postgres on Neon ✓                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                │                                       ▲
                │                                       │ WebSocket via Durable Objects ✓
                ▼                                       │
┌─────────────────────────────────────────────────────────────────────────────┐
│ IMAGE SUBSYSTEM                                                             │
│                                                                             │
│  • FTP Server (VPS)    → Self-hosted t4g.micro (I/O proxy, monitoring TBD) ✓ │
│  • Image Pipeline      → Cloudflare Workers / Images ✓ (validate, normalize) │
│  • Face AI + Search    → AWS Rekognition ✓ (embed, search, pricing TBD/log/002) │
│  • Object Storage      → Cloudflare R2 ✓ (zero egress, pricing TBD/log/004) │
└─────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ CDN                    → Cloudflare CDN ✓ (Free/Pro, pricing TBD/log/005)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Research Queue (Phase 3a Completion)

| # | Topic | Priority | Status |
|---|-------|----------|--------|
| 1 | Face AI pricing accuracy | HIGH | IN PROGRESS (log/002) |
| 2 | R2 pricing model | MEDIUM | IN PROGRESS (log/004) |
| 3 | CDN pricing model | MEDIUM | IN PROGRESS (log/005) |
| 4 | FTP VPS monitoring strategy | MEDIUM | DEFERRED to Phase 3b (log/003) |
| 5 | Image Pipeline scope refinement | LOW | PENDING (exact validation/normalization TBD) |

**Status:** Phase 3a technical decisions **100% COMPLETE**. All 21 components decided.

**Components Decided:**
- 6 Frontends (Web, Mobile Web, Dashboard, Desktop, Plugin, LIFF)
- 2 Auth & Billing (Clerk, Custom Credits + Stripe)
- 6 Application services (API, Rate Limiting, WebSocket, Search, Messaging, Database)
- 4 Image services (FTP, Pipeline, AI, Storage)
- 1 Delivery layer (CDN)
- 1 Hosting (Pages)
- 1 UI Framework (Tailwind + shadcn)

---

## Research References (Dec 2025)

| Topic | File | Key Finding |
|-------|------|-------------|
| Clerk + LINE Auth | `dev/research/clerk_line_auth.md` | LINE natively supported, zero custom OAuth |
| Clerk Billing | `dev/research/clerk_billing_credits.md` | NOT suitable for credits, use Stripe direct |
| Rekognition Collections | `dev/research/rekognition_collection_pricing.md` | 1 collection/event, $0.56/event typical cost |
| LINE Login OAuth | `dev/research/line_login_oauth.md` | Must link to LINE OA for messaging |

