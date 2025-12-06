# System Component Breakdown

---

## Decisions Made

| Question | Answer |
|----------|--------|
| Desktop app | Wails (Go + JS framework) - shared UI code with web |
| LINE integration | Client-facing (participant side) |
| Real-time updates | Yes, needed |
| Face capture | Client-facing (participant side) |
| Photographer dashboard | Web app, responsive |

---

## Slice Method 1: By User Type

```
┌─────────────────────────────────────────────────────────┐
│ PHOTOGRAPHER                                            │
│  ├─ Desktop App (Wails)     → folder monitor, upload    │
│  ├─ Web Dashboard           → events, settings, stats   │
│  ├─ FTP Endpoint            → camera direct upload      │
│  └─ Lightroom Plugin        → export workflow           │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ BACKEND (shared)                                        │
│  ├─ Ingest                  → receive photos            │
│  ├─ Processing              → AI, resize, optimize      │
│  ├─ Storage                 → photos, embeddings, data  │
│  └─ API                     → all business logic        │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ PARTICIPANT                                             │
│  ├─ LINE LIFF/Web           → gallery, face capture     │
│  └─ Face Search             → find my photos            │
└─────────────────────────────────────────────────────────┘
```

---

## Slice Method 2: By Data Flow (Critical Path)

```
Camera ──┬── Desktop App ──┐
         ├── FTP ──────────┼──→ INGEST ──→ PROCESS ──→ STORE ──→ DELIVER ──→ Participant
         ├── Lightroom ────┤              (AI)         (S3?)     (CDN)       (LINE/Web)
         └── Web Upload ───┘
```

Components:
1. **Ingest** - Normalize all upload methods into one pipeline
2. **Process** - Face detection, embedding, resize (async workers)
3. **Store** - Photos + embeddings + metadata
4. **Deliver** - CDN + real-time notifications
5. **Clients** - Desktop, Web Dashboard, Participant (LINE/Web)

---

## Slice Method 3: By Optimization Target

```
┌─────────────────────────────────────────────────────────┐
│ LATENCY-CRITICAL (Time-to-Distribution)                 │
│  ├─ Ingest pipeline         → fast upload acceptance    │
│  ├─ Face processing queue   → fast embedding generation │
│  ├─ Real-time notifications → instant gallery update    │
│  └─ Face search             → fast query response       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ COST-CRITICAL (Minimize spend)                          │
│  ├─ AI compute              → face detection/embedding  │
│  ├─ Storage                 → photo storage + CDN       │
│  └─ Database                → metadata + embeddings     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ VELOCITY-CRITICAL (Ship fast)                           │
│  ├─ Desktop App (Wails)     → shared UI with web        │
│  ├─ Web Dashboard           → standard web tech         │
│  ├─ Participant UI          → LINE LIFF or web          │
│  └─ API                     → single backend            │
└─────────────────────────────────────────────────────────┘
```

---

## Slice Method 4: By Technical Boundary

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ FRONTENDS       │  │ BACKEND         │  │ INFRA           │
│                 │  │                 │  │                 │
│ • Desktop(Wails)│  │ • API Server    │  │ • Object Storage│
│ • Web Dashboard │  │ • Worker Queue  │  │ • Database      │
│ • Participant UI│  │ • FTP Server    │  │ • CDN           │
│ • Lightroom Lua │  │                 │  │ • Vector DB?    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Questions Raised

| # | Question | Slice it affects |
|---|----------|------------------|
| 1 | Face embeddings - vector DB or just SQL with pgvector? | Infra, Cost |
| 2 | Worker queue - what tech? (Redis, SQS, etc) | Backend, Cost |
| 3 | Real-time - websockets, SSE, or polling? | Latency, Complexity |
| 4 | LINE LIFF capabilities - can it do camera/selfie? | Participant UI |
| 5 | Single API or split (photographer vs participant)? | Backend complexity |

---

## Final Model: Two Subsystems

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FRONTENDS                                                                   │
│  • Web Client (photographer dashboard)                                      │
│  • Desktop App (Wails)                                                      │
│  • Lightroom Plugin (Lua)                                                   │
│  • LINE LIFF (participant) [NEEDS RESEARCH]                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ APPLICATION SUBSYSTEM                                                       │
│ (Normal app stuff - optimize for dev velocity & maintainability)            │
│                                                                             │
│  • API Server          → business logic, auth, events, billing              │
│  • Metadata DB         → users, events, photo metadata, app data            │
└─────────────────────────────────────────────────────────────────────────────┘
                │                                       ▲
                │                                       │ notify (real-time)
                │                                       │ [NEEDS RESEARCH]
                ▼                                       │
┌─────────────────────────────────────────────────────────────────────────────┐
│ IMAGE SUBSYSTEM                                                             │
│ (Critical path - optimize for COST and SPEED)                               │
│                                                                             │
│  • FTP Server          → camera direct upload                               │
│  • Ingest Workers      → normalize, queue                                   │
│  • Image Pipeline      → AI (face detect/embed), resize, optimize           │
│  • Object Storage      → photos (original + processed)                      │
│  • Vector Store        → face embeddings for search [NEEDS RESEARCH]        │
└─────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ CDN                                                                         │
│  • In front of web apps                                                     │
│  • In front of images                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Why Two Subsystems?

| Subsystem | Optimize For | Tech Choices |
|-----------|--------------|--------------|
| **Application** | Dev velocity, maintainability | Standard stack, managed services OK |
| **Image** | Cost, speed (time-to-distribution) | Custom/self-hosted if cheaper, optimize aggressively |

---

## Research Needed

| # | Topic | Subsystem | Why |
|---|-------|-----------|-----|
| 1 | LINE LIFF capabilities | Frontend | Can it do camera/selfie? What are limits? |
| 2 | Real-time notification mechanism | App ↔ Image | How does Image subsystem notify App when processing done? |
| 3 | Vector store options | Image | pgvector vs dedicated vector DB vs custom? Cost/perf tradeoffs |
| 4 | Face detection/embedding | Image | Cheapest option at 98%+ accuracy? Self-host vs API? |
| 5 | Object storage | Image | S3 vs R2 vs self-host? Cost comparison |

---

## Components Summary

| Component | Subsystem | Notes |
|-----------|-----------|-------|
| Web Client | Frontend | Photographer dashboard, responsive |
| Desktop App | Frontend | Wails (Go + shared JS UI) |
| Lightroom Plugin | Frontend | Lua, auto-export |
| LINE LIFF | Frontend | Participant UI [RESEARCH] |
| API Server | Application | Business logic |
| Metadata DB | Application | Postgres likely |
| FTP Server | Image | Camera direct upload |
| Ingest Workers | Image | Queue + normalize |
| Image Pipeline | Image | AI + resize |
| Object Storage | Image | S3/R2/? |
| Vector Store | Image | Embeddings [RESEARCH] |
| CDN | Infra | CloudFlare? |
