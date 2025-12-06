# Log 008: Participant Web App Hosting - RESOLUTION

**Status:** RESOLVED
**Opened:** 2025-12-01
**Resolved:** 2025-12-01
**Context:** React participant web app needs global hosting with optimal caching for static assets with hashing

---

## The Decision

**Hosting Platform:** Cloudflare Pages
**URL:** facelink.com/event/{eventId}
**Deployment:** Git-integrated or CLI-based

---

## Why Cloudflare Pages?

### The Challenge
React participant app is:
- **Static SPA** (Single Page Application) after build
- **Hashed assets** for cache busting (e.g., `app.a1b2c3d4.js`)
- **High read frequency** - viewed by thousands of participants globally
- **Simple deployment** - need fast iteration
- **Zero scaling concerns** - event-driven traffic spikes

### The Solution: Cloudflare Pages

**Perfect fit because:**

1. **Cost: COMPLETELY FREE**
   - Unlimited bandwidth ✓
   - Unlimited requests ✓
   - Zero scaling costs ✓
   - No surprises at high traffic ✓
   - Saves ~$100-500/month vs traditional CDN

2. **Performance: Automatic Optimal Caching**
   - Hashed assets (`*.a1b2c3d4.js`) → 1-year cache automatically
   - HTML files → short cache + revalidation
   - Global CDN across 300+ Cloudflare locations
   - Sub-50ms latency worldwide
   - Tiered cache reduces origin requests

3. **Developer Experience: Best-in-class**
   - One-command deployment: `wrangler pages deploy dist`
   - Or connect GitHub for automatic deployments on every push
   - Preview deployments for pull requests
   - One-click rollbacks
   - Zero configuration needed for caching

4. **Reliability: Enterprise-grade**
   - 99.99% uptime SLA
   - DDoS protection included
   - Automatic SSL/TLS certificates
   - Edge security included
   - Cloudflare's global infrastructure

5. **Ecosystem Alignment**
   - Part of Cloudflare platform
   - Integrates seamlessly with:
     - Hono API on Cloudflare Workers
     - Durable Objects for WebSocket
     - R2 for storage
     - CDN for content delivery
   - Single vendor = simpler operations

### Alternatives Rejected

**Next.js on Vercel (public website):**
- Vercel is excellent for full-stack apps
- Unnecessary complexity for static SPA
- Vercel bandwidth charges could add up
- Better to separate static from dynamic

**Workers + Static Assets:**
- More complex than Pages
- Overkill for pure static site
- Better if we need API alongside
- Pages is simpler for static-only

**R2 + Custom Domain:**
- Read operations charged ($0.36/million)
- At 10M reads/day = $100+/month
- No automatic build pipeline
- Manual cache configuration needed
- Better for file storage, not websites

---

## Architecture Integration

### User Flow

```
QR Code at event
    ↓
facelink.com/event/{eventId}
    ↓
Cloudflare Pages (global edge)
    ↓ (cache hit, ~99%)
Serve index.html + hashed JS/CSS
    ↓
Participant sees React app (instantly)
    ↓ (when they interact)
REST API calls to Hono on Workers
    ↓
AWS Rekognition search
    ↓
Results displayed in React
```

### Deployment

```
React Code
    ↓
npm run build → dist/ folder
    ↓
wrangler pages deploy dist/
    ↓
Cloudflare Pages CDN
    ↓
facelink.com/event/* serves instantly
```

### Cache Hierarchy

```
Browser Cache (via Cache-Control headers)
    ↓ (miss)
Cloudflare Edge (nearest location)
    ↓ (miss)
Tiered Cloudflare Cache (regional)
    ↓ (miss)
Origin (R2 or Cloudflare disk)
```

---

## Implementation Details

### Setup (One-time)

```bash
# Install Wrangler CLI
npm install -g @cloudflare/wrangler
wrangler login

# Navigate to project
cd participant-web-app

# Deploy
npm run build
wrangler pages deploy dist --project-name=facelink-participant
```

### Configuration for SPA Routing

Create `public/_redirects` file:
```
/* /index.html 200
```

Or in `wrangler.toml`:
```toml
[env.production]
compatibility_date = "2025-01-01"

[[env.production.pages]]
not_found_handling = "single-page-application"
```

This ensures all routes (e.g., `/event/123`) redirect to `index.html` for React Router to handle.

### Git Integration (Recommended)

1. Push code to GitHub
2. In Cloudflare dashboard:
   - Connect GitHub repo to Pages
   - Set build command: `npm run build`
   - Set output directory: `dist` (or `build` for CRA)
3. Every push to `main` auto-deploys
4. Every PR gets preview deployment

### Custom Domain

1. Add domain to Cloudflare (if not already)
2. In Pages project: Settings → Custom Domains
3. Add `facelink.com` as custom domain
4. DNS automatically configured
5. SSL certificate provisioned instantly

### Environment Variables

If app needs API endpoint, pass via Pages environment:

```toml
[env.production]
vars = { API_URL = "https://api.facelink.workers.dev" }
```

Access in React:
```js
const API_URL = import.meta.env.API_URL;
```

---

## Performance Metrics

### Expected Performance

**Hashed Asset (JavaScript bundle):**
- First visit globally: ~2s (download)
- Cached globally: <100ms (served from nearest edge)
- Cache TTL: 1 year (safe due to hash)

**HTML File (index.html):**
- Always fresh (or via revalidation)
- Sub-50ms from global edge
- Browser caches between page refreshes

**Overall:**
- Time to First Byte (TTFB): <50ms globally
- Time to Interactive (TTI): <2s first visit, <500ms cached
- Lighthouse scores: 95-100 (static assets)

### Traffic Scaling

**Free plan handles:**
- 1M requests/day: ✓ No problem
- 10M requests/day: ✓ Still free
- 100M requests/day: ✓ Still free

No scaling concerns, no cost increases.

---

## Cost Analysis (Phase 3b)

### Monthly Cost

| Tier | Bandwidth | Requests | Pages Cost | Total |
|------|-----------|----------|------------|-------|
| **T1** | ~19 GB | ~40K | $0 | **$0** |
| **T2** | ~277 GB | ~554K | $0 | **$0** |
| **T3** | ~1,850 GB | ~3.7M | $0 | **$0** |

**Plus:** Free 500 build minutes/month (way more than needed)

### Comparison

**vs Vercel (if we hosted there):**
- Bandwidth charges: $0.50/GB
- T3: 1,850 GB × $0.50 = **$925/month**
- Pages saves: **$925/month**

**vs AWS CloudFront:**
- Bandwidth: $0.085/GB (APAC)
- T3: 1,850 GB × $0.085 = **$157.25/month**
- Pages saves: **$157.25/month**

**vs Cloudflare R2 + Custom Domain:**
- Read operations: $0.36/million
- T3: 3.7M reads = **$1.33/month** (cheaper than Pages!)
- But: No automatic builds, no CI/CD, requires manual config

**Verdict:** Pages is best balance of cost + simplicity + performance

---

## Why Not Dashboard on Pages Too?

Dashboard UI (photographer side) is different:
- **Dynamic content** - per-photographer data
- **Authentication needed** - must verify ownership
- **Real-time updates** - WebSocket connections
- **Server-side rendering** - personalized views

**Better hosted as:**
- Next.js on Vercel (has auth/SSR built-in)
- Or: Hono on Cloudflare Workers + static frontend
- Could also be React SPA with separate auth backend

**For MVP:** Likely Next.js on Vercel for simplicity (matches public website stack).

---

## Migration Path

### Phase 1 (MVP)
- Deploy Participant Web on Cloudflare Pages
- Simple React SPA with Hono API calls
- No complex state management

### Phase 2 (Post-MVP)
- If needed: Add Cloudflare Functions alongside Pages
- Example: Custom analytics, URL shortening, etc.
- Still free, still integrated

### Phase 3 (Advanced)
- If needed: Migrate to Cloudflare Workers + Static Assets
- Allows: Custom Worker code, advanced caching rules
- But: Only if Pages limitations become apparent (unlikely)

---

## Open Questions for Phase 3b

- [ ] Should Dashboard also go on Pages, or separate (Vercel)?
- [ ] Build command exact structure (CRA vs Vite)?
- [ ] Asset optimization (minify, critical CSS, etc.)?
- [ ] Error tracking & monitoring (Sentry/Cloudflare)?
- [ ] Analytics (Cloudflare Web Analytics vs Google Analytics)?
- [ ] Staging vs Production deployments?

---

## Decision Confirmed

**Platform:** Cloudflare Pages ✅
**URL Pattern:** facelink.com/event/{eventId} ✅
**Cost:** $0/month ✅
**Performance:** Global CDN, <100ms cached ✅
**Reliability:** 99.99% uptime ✅
**Developer Experience:** Git-integrated auto-deploy ✅

**Unblocks:**
- Deployment architecture clear
- Cost analysis simplified (zero cost for this component)
- Ready to move forward with implementation planning

**Next Steps:**
1. Set up Pages project in Cloudflare dashboard
2. Configure Git integration with GitHub
3. Set build command and output directory
4. Deploy first version
5. Add custom domain
6. Monitor performance with Cloudflare Analytics

---

**Last updated:** 2025-12-01
**Resolved by:** Architecture decision
