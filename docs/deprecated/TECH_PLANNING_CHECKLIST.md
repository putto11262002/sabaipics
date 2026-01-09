# Technical Planning Checklist

## Purpose

Breadth-first technical planning. Decide high-level patterns for each area before implementation. Each checkpoint produces a doc that coding agents reference.

---

## What We Have (From Phase 3)

| Doc | Content | Status |
|-----|---------|--------|
| `docs/tech/01_design_drivers.md` | Goals, constraints, optimization targets | ✅ Complete |
| `docs/tech/02_component_breakdown.md` | System slices, two subsystems model | ✅ Complete |
| `docs/tech/03_tech_decisions.md` | 18 component technology choices | ✅ Complete |
| `docs/tech/04_assumptions.md` | Event parameters, sizing, cost formula | ✅ Complete |
| `docs/2_feature_positioning.md` | MVP features, what to build/skip | ✅ Complete |

---

## Checkpoints (To Complete)

### P0 - Blocks Everything

- [x] **00_use_cases.md** ✅ Complete
  - 10 Photographer use cases
  - 5 Participant use cases
  - 6 System use cases
  - Actor-goal pairs with auth requirements

- [x] **00_business_rules.md** ✅ Complete
  - Credit system rules (6 month expiry, FIFO)
  - Event lifecycle (draft/published, time windows)
  - Photo processing rules
  - Face search rules
  - Access control rules
  - Validation rules and error codes

- [x] **00_flows.md** ✅ Complete
  - 10 sequence diagrams covering all major flows
  - Signup, purchase, upload, search, download, notifications
  - Cron jobs for expiry

- [x] **01_data_schema.md** ✅ Complete
  - 12 core tables defined
  - Storage distribution: Postgres, R2, Rekognition, Clerk, Stripe
  - Credit ledger system with FIFO expiration (6 months)
  - Event status: draft/published only (active/closed/expired are derived)
  - Face claiming: `participant_id` on faces for "my photos" feature
  - Face attributes: All Rekognition FaceDetail fields stored (age, gender, smile, emotions, pose, quality, landmarks, etc.) for filtering and analytics

- [x] **02_auth.md** ✅ Complete (Updated 2025-12-06)
  - Auth provider: Clerk (LINE + Google + Email OTP)
  - Platform strategy: Web uses `@clerk/clerk-react`, Desktop uses custom auth context + Go OAuth
  - API verification: `@clerk/backend` with networkless JWT verification
  - Desktop flow: System browser + deep link + PKCE (OAuth providers block webviews)
  - Token refresh: Automatic (web), Manual via Clerk API (desktop)
  - Research: `dev/research/clerk_hono_integration.md`

### P1 - Blocks Most Features

- [x] **03_api_design.md** ✅ Complete
  - Hono on Cloudflare Workers
  - REST-ish with RPC patterns (actions like publish, search)
  - 10 critical decisions: URL structure, auth, errors, pagination, file upload, rate limits
  - Full endpoint summary table

- [x] **04_frontend_architecture.md** - SKIPPED (use CONTEXT files)
  - Standard React patterns, no special decisions needed
  - Details go in CONTEXT files for coding agents

- [x] **05_image_pipeline.md** ✅ Complete
  - 4 upload sources (Web, Desktop, FTP, Lightroom) → same API endpoint
  - Async processing via Cloudflare Queues
  - Rekognition: DetectFaces + IndexFaces (all attributes stored)
  - On-demand thumbnails via Cloudflare Images (no pre-generation)
  - Cleanup flow on event expiry

### P2 - Can Build Incrementally

- [x] **06_websocket.md** ✅ Complete
  - Durable Objects + Hibernation API
  - One DO per photographer (idFromName)
  - Connection flow: Worker auth → DO accept
  - RPC for external triggers (Queue → DO → broadcast)
  - State reconstruction on hibernation wake
  - Message types defined

- [x] **06_line_messaging.md** ✅ Complete
  - Friendship requirement (must be OA friend)
  - Add friend during LINE Login (`bot_prompt=aggressive`)
  - Image Carousel for multiple photos
  - Push message flow
  - Webhook handling (follow/unfollow)
  - Cost: Light plan ~$1/month

- [x] **07_observability.md** ✅ Complete
  - OpenTelemetry traces via Cloudflare OTLP → Grafana Cloud
  - 4 critical hot paths defined with span targets
  - Distributed tracing with W3C traceparent propagation
  - Analytics Engine for custom metrics (high-cardinality)
  - Structured logging with trace correlation
  - Alerting strategy (critical vs warning)
  - Cost management with sampling

- [x] **08_security.md** ✅ Complete
  - PDPA compliance for face biometrics (consent, retention)
  - Input validation (file types, magic bytes, API schemas)
  - Rate limiting (edge + application layer)
  - Access control (resource ownership)
  - Signed URL security
  - Webhook verification (Clerk, Stripe, LINE)
  - CORS configuration
  - Secrets management
  - Audit logging
  - OWASP Top 10 mitigations

### P3 - After Patterns Established

- [x] **09_testing.md** ✅ Complete
  - Testing strategy
  - Test environment

- [ ] **10_deployment.md** - DEFERRED
  - Environment setup (dev/staging/prod)
  - Deployment pipeline
  - Will complete when setting up CI/CD

---

## Phase 2: Project Setup + CONTEXT Files

### Setup Tasks

Set up a monorepo with pnpm, turbo, and pnpm workspaces.
set up critial infrastructure (Cloudflare, Clerk, Hono, Postgres, Rekognition, Stripe, etc.)


### CONTEXT Files

WRite context files

---

## Current Focus

**Completed:** All technical planning docs (P0-P3, except deployment - deferred)

**Now:** Project setup + CONTEXT files

---

## Output Location

- Tech docs: `docs/tech/`
- Research: `docs/research/`
- Business docs: `docs/business/`
