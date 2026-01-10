# Repo Scout Report

Execution root: `BS_0001_S-1`
Slice: `d999677d-0b51-4b3b-b163-eec36a5bdde3`
Generated: `2026-01-09 14:30 UTC`

## Relevant doc takeaways (only what matters for this slice)

### From `docs/tech/ARCHITECTURE.md`:
- **API** (`apps/api/`): Hono 4.x on Cloudflare Workers. Handles REST, business logic, background job processing via Queues, and coordinates with Durable Objects for rate limiting. Webhooks must be mounted BEFORE CORS/auth middleware.
- **Dashboard** (`apps/dashboard/`): React 19 + Vite 7 SPA on Cloudflare Pages. Uses Hono RPC client for type-safe API calls. Auth via Clerk React SDK.
- **Database** (`packages/db/`): Neon Postgres with Drizzle ORM. Accessed exclusively via API. Uses `@neondatabase/serverless` driver for Workers compatibility.
- **Auth** (`packages/auth/`): Clerk-based identity. Backend middleware (`createClerkAuth`, `requireAuth`) validates JWT networklessly via `jwtKey`. Frontend uses `SignedIn`/`SignedOut` guards.
- **AWS Rekognition** (`apps/api/src/lib/rekognition/`): ML inference for face detection. 50 TPS limit (us-west-2). Rate-limited via Durable Object coordination.
- **R2 Storage**: Object storage for photos. Key pattern: `events/{event_id}/photos/{photo_id}`.
- **Queues**: Photo processing queue with max 50 batch size, 3 retries, dead-letter queue.

### From `docs/tech/tech_stack.md`:
- **Validation**: Zod 4.x (see `apps/api/src/lib/line/schemas.ts` for exemplar)
- **Testing**: Vitest 3.x with `@cloudflare/vitest-pool-workers` for Workers runtime tests
- **UI**: React 19, React Router 7, TanStack Query 5, Tailwind CSS 4, shadcn/ui (via `packages/ui`)
- **Payments**: Stripe integration exists (`apps/api/src/lib/stripe/`)

## Key conventions (observed via exemplars)

### Validation
- Use **Zod schemas** with `z.discriminatedUnion` for event types (see LINE schemas)
- Export both schema and inferred TypeScript types: `export type X = z.infer<typeof XSchema>`
- Validation errors: not yet standardized (no central error shape observed)

### Error handling
- **Domain-specific error modules**: Each external service has its own `errors.ts` (Rekognition, Stripe, Auth)
- **Error classification**: `isRetryableError()`, `isNonRetryableError()`, `isThrottlingError()` for queue retry logic
- **Backoff calculation**: `getBackoffDelay(attempts)` with exponential backoff + jitter
- **Auth errors**: `{ error: { code, message } }` envelope via `createAuthError()`
- **Stripe errors**: `FormattedStripeError` interface with `code`, `message`, `type`, `retryable`, `declineCode`, `param`

### Auth/authz
- **API middleware chain**: `createClerkAuth()` extracts JWT into `c.var.auth`, `requireAuth()` enforces
- **Protected routes**: Use `requireAuth()` middleware before handler
- **Dashboard**: `<ProtectedRoute>` component wraps authenticated routes, redirects to `/sign-in` if unauthenticated
- **API client**: `useApiClient()` hook provides `getToken()` for authenticated requests
- **Webhook verification**: Svix signature verification for Clerk/LINE, raw signature for Stripe

### Logging/metrics
- `console.log/warn/error` with structured prefixes like `[Queue]`, `[auth]`, `[EventBus]`
- Cloudflare observability enabled in staging/production (`head_sampling_rate: 1`)
- No structured logging library observed yet

### Testing patterns
- **Unit tests** (Node.js): `apps/api/src/lib/rekognition/rekognition.test.ts` - mock AWS SDK with `aws-sdk-client-mock`
- **Workers tests**: `*.workers.test.ts` suffix, run via `@cloudflare/vitest-pool-workers`
- **Test config**: Separate `vitest.config.ts` for Workers pool with isolated storage
- **No dashboard tests observed** - testing patterns not yet established for React components

## Best exemplars (top 3-5)

| Path | Why it matters | Pattern to copy |
|------|----------------|-----------------|
| `apps/api/src/lib/line/schemas.ts` | Comprehensive Zod schema with discriminated unions | Validation schema structure, export both schema + types |
| `apps/api/src/lib/rekognition/errors.ts` | Error classification + backoff logic | `isRetryableError()`, `getBackoffDelay()`, `formatErrorMessage()` |
| `apps/api/src/queue/photo-consumer.ts` | Queue consumer with rate limiting, parallel execution | Paced request initiation, per-message ack/retry, DO coordination |
| `apps/api/src/routes/webhooks/clerk.ts` | Webhook handler with signature verification | Svix verification, event routing via switch, handler functions |
| `packages/auth/src/middleware.ts` | Auth middleware with proper typing | `createClerkAuth()`, `requireAuth()`, context variable typing |

## Likely primary surfaces

| Surface | Priority | Rationale |
|---------|----------|-----------|
| **DB** | Primary | Stories require photographers, events, photos, faces, credits tables. Currently only test schema exists. |
| **API** | Primary | New routes needed: events CRUD, photo upload, credit purchase, face detection triggers |
| **UI** | Primary | Dashboard pages: events list, event detail, photo upload, credit purchase flow |
| **Jobs** | Secondary | Photo processing queue already exists; may need face indexing orchestration |
| **Ops** | Secondary | Webhook handlers for Clerk (user sync), Stripe (credit fulfillment) - shells exist |

## Gaps / flags

- `[GAP]` **Database schema**: Only `_db_test` table exists. Need: `photographers`, `events`, `photos`, `faces`, `credit_ledger`, `payments`. Build sheet must create migrations.
- `[GAP]` **No data schema doc**: `docs/tech/01_data_schema.md` does not exist. Architecture doc references it but file is missing.
- `[GAP]` **API error envelope**: No standardized error response shape across all routes. Auth uses `{ error: { code, message } }`, Stripe uses `FormattedStripeError`, others use ad-hoc.
- `[GAP]` **Dashboard tests**: No React component tests observed. Testing strategy needed for UI stories.
- `[NEED_VALIDATION]` **Clerk webhook user_type**: Code comment in `clerk.ts` notes `unsafe_metadata.user_type` is not secure - should verify from signup URL/origin or use separate Clerk apps.
- `[NEED_VALIDATION]` **LINE integration**: LINE webhook handler exists (`apps/api/src/routes/webhooks/line.ts`) but not reviewed - verify if it handles account linking for this slice.

## Provenance (commands run)

- `Read docs/tech/ARCHITECTURE.md` - System architecture overview
- `Read docs/tech/tech_stack.md` - Technology stack details
- `Glob apps/api/src/**/*.ts` - API source files
- `Glob packages/db/src/**/*.ts` - Database package files
- `Glob packages/auth/src/**/*.ts` - Auth package files
- `Glob apps/dashboard/src/**/*.{ts,tsx}` - Dashboard source files
- `Read apps/api/src/index.ts` - API entry point and middleware chain
- `Read packages/auth/src/middleware.ts` - Auth middleware implementation
- `Read apps/api/src/utils/error.ts` - Error utilities
- `Read packages/db/src/schema/index.ts`, `test.ts` - Current DB schema
- `Read packages/auth/src/errors.ts` - Auth error handling
- `Read apps/api/src/lib/rekognition/errors.ts` - Rekognition error handling
- `Read apps/api/src/lib/stripe/errors.ts` - Stripe error handling
- `Read apps/api/src/lib/rekognition/rekognition.test.ts` - Test patterns
- `Read apps/api/src/queue/photo-consumer.ts` - Queue consumer pattern
- `Read apps/api/src/routes/webhooks/clerk.ts` - Webhook handler pattern
- `Read apps/api/src/lib/line/schemas.ts` - Zod validation patterns
- `Read apps/dashboard/src/App.tsx` - Dashboard routing structure
- `Read apps/dashboard/src/components/auth/ProtectedRoute.tsx` - Protected route pattern
- `Read apps/dashboard/src/lib/api.ts` - API client pattern
- `Read apps/dashboard/src/routes/dashboard/index.tsx` - Dashboard page pattern
- `Read apps/api/src/durable-objects/rate-limiter.ts` - Durable Object pattern
- `Read apps/api/src/events/event-bus.ts` - Event bus pattern
- `Read apps/api/src/handlers/stripe.ts` - Event handler registration
- `Read apps/api/src/routes/auth.ts` - Protected route example
- `Read apps/api/wrangler.jsonc` - Infrastructure configuration
- `Read apps/api/vitest.config.ts` - Test configuration
- `Read packages/db/drizzle.config.ts` - Migration config
- `Read packages/db/drizzle/0000_concerned_boom_boom.sql` - Current migration
- `Read packages/db/src/client.ts` - Database client factory
- `Glob packages/ui/**/*.{ts,tsx}` - UI component files
- `Read packages/ui/src/components/button.tsx` - shadcn/ui component pattern
- `Read packages/ui/src/lib/utils.ts` - Utility functions
