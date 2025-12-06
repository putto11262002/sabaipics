# Log 006: API Backend + Real-time WebSocket - RESOLUTION

**Status:** RESOLVED
**Opened:** 2025-12-01
**Resolved:** 2025-12-01
**Context:** [Participant Flow decision (log/001)](001_resolution.md) requires API backend for search, Messaging API webhooks, and real-time notifications

---

## The Decision

**API Backend:** Hono on Cloudflare Workers
**Real-time WebSocket:** Cloudflare Durable Objects

### Why These Choices?

#### Hono + Cloudflare Workers

**What:** Lightweight RPC framework deployed as serverless edge functions
**Why it fits:**
1. **Tight Cloudflare integration** - Works seamlessly with Workers, R2, Durable Objects, KV
2. **Minimal runtime overhead** - RPC pattern is lightweight, perfect for event-driven workloads
3. **Serverless-native** - Automatic scaling, pay-per-request, no cold start issues at edge
4. **Zero deployment complexity** - Deploy via `wrangler` CLI, no Docker, no containers
5. **Perfect for hybrid architecture** - REST endpoints + Messaging API webhooks + RPC calls to Vector Store
6. **TypeScript support** - Full type safety for API contracts

**Capabilities:**
- REST endpoints for participant searches
- WebSocket upgrade path (via Durable Objects)
- LINE Messaging API webhook handlers
- Direct integration with:
  - Cloudflare R2 (object storage)
  - Cloudflare KV (metadata caching)
  - Neon Postgres (database)
  - AWS Rekognition (face embeddings)
  - Vector Store (similarity search)

**Alternatives rejected:**
- **Fastify:** Full framework overhead, requires container management
- **NestJS:** Enterprise patterns, too much for MVP
- **tRPC:** RPC-focused but requires separate deployment infrastructure
- **Go Fiber:** Not Cloudflare-native, requires different deployment strategy

#### Cloudflare Durable Objects for WebSocket

**What:** Stateful compute primitives with built-in WebSocket support
**Why it fits:**
1. **Native WebSocket support** - No third-party pub/sub required
2. **Strong consistency** - Guaranteed message ordering (important for notifications)
3. **Stateful persistence** - Keeps connections alive, handles reconnects
4. **Sub-100ms latency** - Runs at edge, near users
5. **Cost-optimized** - Pay only for CPU duration, not connection-time
6. **Cloudflare-native** - Integrated auth, CORS, security built-in

**Use cases:**
1. **Photographer alerts** - Notify photographer when participant finds their photos
2. **Real-time event updates** - Broadcast when new photos are uploaded to event
3. **Connection-per-photographer** - Each photographer gets a Durable Object connection handler
4. **No external dependencies** - No Pusher, Ably, Firebase required

**Example flow:**
```
Participant takes selfie    → Hono API (upload + trigger search)
    ↓
AWS Rekognition embeds      → Face vector + direct search in AWS
    ↓
Search results return       → Matching photo metadata
    ↓
Durable Object broadcasts   → Photographer gets WebSocket notification
    ↓
Photographer dashboard      → Updates in real-time with search results
```

**Alternatives rejected:**
- **SNS + Lambda + API Gateway:** Complex multi-service coordination, higher latency
- **Firebase Realtime:** External dependency, higher cost
- **Supabase Realtime:** Works but less direct than Durable Objects
- **Pusher/Ably:** Premium pricing, not needed when Cloudflare native solution exists

---

## Architecture Impact

### Before (log/001 participant flow)

```
Participant Web/LIFF
    ↓ (search)
[API Backend - UNDECIDED]
    ↓ (vector query)
Vector Store
    ↓ (results)
Photo display
    ↓ (via Messaging API)
Photographer LINE OA
```

### After (resolved)

```
Participant Web/LIFF (MediaPipe guard)
    ↓ (selfie upload)
Hono on Cloudflare Workers
    ↓ (embed + search)
AWS Rekognition (embedding + similarity search)
    ↓ (matching photo metadata)
Hono queries Neon Postgres → R2 URLs
    ↓
Photo display on web/LIFF
    ↓ (real-time notification)
Cloudflare Durable Objects (WebSocket)
    ↓ (push to photographer)
Photographer Dashboard
    ↓ (optionally)
LINE OA sends results to participant
```

### What This Decides

✅ **API Backend:** Hono on Cloudflare Workers
- REST endpoints for selfie uploads & searches
- Calls AWS Rekognition for face embedding & search
- Webhook handlers for LINE Messaging API callbacks
- Queries Neon Postgres for photo metadata
- Generates signed R2 URLs for photo delivery

✅ **Real-time Notifications:** Cloudflare Durable Objects
- Photographer alerts when participant finds photos
- Dashboard updates via WebSocket
- No external pub/sub required

✅ **Deployment Model:** Serverless edge functions
- No container management
- No Always-on infrastructure
- Auto-scaling included

### What This Requires

**Development:**
- Learn Hono framework basics (lightweight)
- Learn Durable Objects WebSocket API
- Set up `wrangler` CLI for deployment

**Infrastructure:**
- Cloudflare Workers subscription (included in R2/CDN bundle)
- Durable Objects instances (pay-per-duration)
- Neon Postgres connection pooling (already decided)

**Cost implications:**
- Hono on Workers: Scales to zero between events
- Durable Objects: Only active when photographers online
- Estimated combined cost: <$1/month for Tier 1, <$10/month for Tier 3
- (Detailed pricing to be researched in Phase 3b)

---

## Open Questions for Later

- [ ] Exact Durable Objects pricing model (CPU duration, request count)?
- [ ] WebSocket message limits (max concurrent connections)?
- [ ] Error handling & retry strategy for AWS Rekognition calls?
- [ ] Rate limiting for search API (prevent abuse)?
- [ ] Authentication/authorization for Hono endpoints?
- [ ] Metrics & logging for production monitoring?
- [ ] Image Pipeline deployment location (Cloudflare Workers vs Lambda)?

---

## Integration with Other Decisions

### With Participant Flow (log/001)
- ✅ Hono handles REST search endpoint
- ✅ Hono receives LINE Messaging API callbacks
- ✅ Durable Objects sends real-time alerts to photographer

### With Face AI (AWS Rekognition)
- ✅ Hono calls Rekognition API to embed selfies
- ✅ Rekognition handles embedding + similarity search (no separate Vector Store)
- ✅ Rekognition returns matching faces from event photos

### With Object Storage (R2)
- ✅ Hono generates R2 signed URLs for photo delivery
- ✅ Durable Objects can broadcast photo URLs to photographers

### With CDN (Cloudflare CDN)
- ✅ Photos cached at edge
- ✅ Hono references CDN URLs in search results
- ✅ No direct edge compute bottleneck

### With Database (Neon Postgres)
- ✅ Hono queries Neon for event metadata, photo listings
- ✅ Stores search history, user activity
- ✅ Uses connection pooling to avoid cold starts

---

## Why Cloudflare for Everything?

This decision consolidates the entire backend on Cloudflare infrastructure:

1. **Single vendor** - Reduces operational complexity
2. **Native integration** - No adapters or bridges needed
3. **Performance** - Everything runs at edge, minimal latency
4. **Cost-optimized** - Bundle discounts, no separate cloud provider bills
5. **Fast iteration** - Deploy in seconds, no CI/CD overhead

**The "Cloudflare bundle":**
- **Compute:** Hono on Workers + Durable Objects
- **Storage:** R2 + KV
- **Delivery:** CDN
- **Database:** Neon Postgres (compatible, external)
- **Observability:** Cloudflare Analytics

This is a coherent, integrated platform - not a patchwork of services.

---

## Decision Confirmed

**API Backend:** Hono on Cloudflare Workers ✅
**Real-time WebSocket:** Cloudflare Durable Objects ✅

**Unblocks:**
- Image Pipeline research (can now specify requirements)
- Vector Store research (can now specify API contract)
- Cost analysis Phase 3b (can estimate Durable Objects costs)

**Next Steps:**
1. Research Vector Store options (pgvector, Pinecone, Qdrant, Upstash)
2. Research Image Pipeline deployment (Cloudflare Workers, Lambda, or always-on?)
3. Validate Hono + RPC integration with Vector Store APIs
4. Plan Durable Objects connection handling & error recovery

---

**Last updated:** 2025-12-01
**Resolved by:** Architecture decision
