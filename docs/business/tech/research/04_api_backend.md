# Research: API Backend Framework

**Status:** TODO
**Scope:** Discover and explore options (not decision-making)

---

## Context

We're building an event photo distribution platform. The API backend handles business logic, auth, event management, and coordinates between frontend and image subsystem.

**Business context:**
- Fast-follower strategy
- Small team, high velocity needed
- Event-driven traffic (spiky, not constant)

**Already decided:**
- Database: Postgres on Neon (serverless)
- Frontend: React (dashboard), Next.js (public site)
- Desktop: Wails + React (shared UI code)

**Design drivers:**
1. Minimize cost (scale-to-zero)
2. High velocity dev
3. Fast experience

---

## Requirements

- **Websocket support:** Real-time updates when photos processed
- **Serverless-friendly:** Scale to zero (event-driven traffic)
- **Fast cold start:** Affects latency on first request
- **Language:** TypeScript or Go preferred
- **Type safety:** Good DX with React frontend

---

## Scale Parameters

| Tier | Events/month | Participants | API requests (estimate) |
|------|--------------|--------------|------------------------|
| Tier 1 | 10 | 1,000 | ~50K |
| Tier 2 | 50 | 15,000 | ~500K |
| Tier 3 | 200 | 100,000 | ~3M |

**Exchange rate:** 1 USD = 31.96 THB

---

## Categories to Explore

| Category | Explore |
|----------|---------|
| Node.js / TypeScript frameworks | |
| Go frameworks | |
| Serverless-specific frameworks | |
| Deployment platforms | |

---

## Solutions Found

| Solution | Category | Notes |
|----------|----------|-------|
| | | |

---

## For Each Solution, Capture

### Capabilities
- Websocket support (native? workaround?)
- Serverless deployment support
- Cold start time
- Request/response handling

### Developer Experience
- TypeScript support
- Type safety with frontend
- Learning curve
- Documentation quality
- Ecosystem/community

### Operational
- Deployment options (which platforms?)
- Monitoring/observability
- Connection pooling for serverless DB

---

## Integration Considerations

| Connects To | Think About |
|-------------|-------------|
| **Neon (Postgres)** | Connection pooling needed for serverless |
| **Object Storage** | Presigned URL generation |
| **Image Subsystem** | Receive notifications when processing done |
| **Frontend (React)** | API design, type sharing, data fetching |
| **LINE LIFF** | OAuth flow, webhooks |
| **Desktop App (Wails)** | Same API, authentication |

---

## Open Questions

*Capture questions that arise during research*

