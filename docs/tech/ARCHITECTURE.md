---
scope: High-level system architecture defining core components (API, Dashboard, FTP Server, Database, R2 Storage, AWS Rekognition, Clerk) and their capabilities and interaction points. Provides mental model of the system without implementation details.
---

# Architecture

## Core Components

### API
**Tech**: Cloudflare Workers, Hono ^4.10.7, TypeScript 5.9.2
**Location**: `apps/api/`
**Deploy**: Cloudflare Workers (staging, production)

**Role**:
- HTTP request/response handling (REST API layer)
- Business logic execution
- Coordinate access to persistent layer (Database, R2 Storage)
- Background job processing (async operations)
- Webhook endpoint provisioning (external service integration)
- Infrastructure orchestration (Cloudflare primitives: Queues, Durable Objects)

**Interactions**:
- Receives HTTP requests from Dashboard
- Receives API calls from FTP Server
- Authenticates requests via Clerk (session validation)
- Reads/writes to Database (via Drizzle ORM)
- Stores/retrieves objects from R2 Storage
- Enqueues background jobs to Cloudflare Queues (producer)
- Consumes jobs from Cloudflare Queues (consumer)
- Calls AWS Rekognition for ML inference
- Coordinates rate limiting via Durable Objects (RPC)

---

### Dashboard
**Tech**: React 19, Vite 7, React Router 7, TanStack Query
**Location**: `apps/dashboard/`
**Deploy**: Cloudflare Pages (staging, production)

**Role**:
- User interface rendering (client-side SPA)
- Client-side state management
- User interaction handling (forms, navigation)
- Real-time UI updates (notifications, progress)

**Interactions**:
- Calls API via Hono RPC client (type-safe HTTP)
- Authenticates via Clerk React SDK

---

### FTP Server
**Tech**: Go, custom FTP implementation
**Location**: `apps/ftp-server/`
**Deploy**: VPS Docker (production)

**Role**:
- File transfer protocol handling (FTPS)
- Upload gateway (photographer client access)
- File validation (format, size constraints)

**Interactions**:
- Receives file uploads from photographer clients
- Calls API endpoints to proxy uploads
- TLS/certificate-based encryption

---

### Database
**Tech**: Neon Postgres (serverless), Drizzle ORM ^0.45.0, @neondatabase/serverless ^1.0.2
**Location**: `packages/db/` (ORM layer)
**Deploy**: Neon (staging, production)

**Role**:
- Persistent structured data storage
- Relational data modeling (tables, relationships)
- Transactional operations (ACID guarantees)
- Schema versioning (migrations)

**Interactions**:
- Accessed exclusively via API (Drizzle client)
- Connection pooling for Workers runtime

---

### R2 Storage
**Tech**: Cloudflare R2
**Binding**: `PHOTOS_BUCKET`
**Deploy**: Cloudflare R2 (staging, production)

**Role**:
- Object storage (blob persistence)
- Large binary file handling (photos)
- Key-based organization (events/{event_id}/photos/{photo_id})

**Interactions**:
- Written by API (photo uploads)
- Read by API (processing, serving)

---

### AWS Rekognition
**Tech**: AWS Rekognition (us-west-2), @aws-sdk/client-rekognition ^3.946.0
**Location**: `apps/api/src/lib/rekognition.ts`

**Role**:
- ML model inference (face detection)
- Face embedding extraction
- Face collection management (search index)
- Similarity search operations

**Interactions**:
- Called by API for face operations (IndexFaces, SearchFacesByImage)
- Rate limited via API Durable Object coordination
- Requires AWS credentials (environment config)

**Constraints**:
- 50 TPS per operation (us-west-2 regional limit)

---

### Clerk
**Tech**: @clerk/backend ^1.20.0, @clerk/clerk-react ^5.58.0, Svix ^1.82.0
**Location**: `packages/auth/`

**Role**:
- Identity management (user accounts)
- Session management (token issuance, validation)
- Authentication flows (sign-up, sign-in)
- Authorization primitives (user roles, permissions)
- Webhook event delivery (user lifecycle events)

**Interactions**:
- API: Middleware validates session tokens, webhook signature verification
- Dashboard: React SDK provides auth state and UI components

---

## References

- Tech stack: `.claude/tech_stack.md`
- Data schema: `docs/tech/01_data_schema.md`
- API design: `docs/tech/03_api_design.md`
