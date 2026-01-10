# Logs Scout: T-11

## Relevant prior tasks

- **T-1**: Database schema - established all domain tables, UUID pattern, Drizzle ORM patterns, migration workflow
- **T-2**: requirePhotographer middleware - established auth middleware pattern, DB access via `getDb(c)` helper
- **T-3**: Admin credit packages API - established admin API key auth pattern, API placed before Clerk middleware, CRUD patterns with zValidator
- **T-4**: Clerk webhook handler - established webhook DB injection pattern, idempotency on clerk_id, error handling (log + return 200)
- **T-5**: PDPA consent API - established POST endpoint pattern, 409 for already-consented, no transaction wrapping (acceptable for MVP)
- **T-6**: Signup UI + PDPA consent modal - established polling pattern for webhook race condition, consent modal flow, ConsentGate wrapper
- **T-7**: Dashboard API - established aggregation query patterns, empty state handling, COALESCE for nullable aggregations
- **T-8**: Credit packages public API - established public endpoint pattern (before Clerk middleware), `{ data: [...] }` envelope pattern
- **T-9**: Stripe checkout API - established Stripe customer creation + storage pattern, metadata passing, success/cancel redirect URLs

## Patterns to follow

### Database & Schema (from T-1, T-9)
- All IDs use native `uuid` type with `gen_random_uuid()` default
- Use helper builders from `packages/db/src/schema/common.ts`:
  - `timestamptz(name)` for timestamp columns
  - `createdAtCol()` for standard created_at columns
- Co-locate types with schemas (e.g., Rekognition types in `faces.ts`)
- Export `<TableName>` (select) and `New<TableName>` (insert) types
- Indexes: composite for complex queries, standard FK indexes on foreign keys
- Foreign keys use `RESTRICT` cascade (prevent accidental deletion)

### API Routes (from T-2, T-3, T-5, T-7, T-8, T-9)
- Route file structure: `apps/api/src/routes/<domain>.ts`
- Test file co-located: `apps/api/src/routes/<domain>.test.ts`
- DB access: Use `getDb(c)` helper from `apps/api/src/lib/db.ts`
- Validation: Use `zValidator` from `@hono/zod-validator` for type-safe request validation
- Response envelope for collections: `{ data: [...] }`
- Error handling: Return proper status codes (400/401/403/404/409/500)
- Authentication flow:
  - Public endpoints: Register before Clerk middleware
  - Photographer endpoints: Use `requirePhotographer()` and `requireConsent()` middlewares
  - Admin endpoints: Use `requireAdmin()` middleware (API key auth)

### Middleware (from T-2, T-3, T-4)
- Location: `apps/api/src/middleware/<name>.ts`
- DB injection pattern for webhooks: Add DB middleware before route registration
- Auth context: Store minimal data in `c.var` (e.g., `PhotographerContext` with id + pdpaConsentAt)
- Idempotency: Check existence before insert operations

### Testing (from T-3, T-5, T-8)
- Use Hono `testClient` for type-safe API testing
- Test coverage: auth checks, happy path, empty state, error cases, idempotency
- Mock environment for tests with proper env vars

### Stripe Integration (from T-9)
- Store `stripeCustomerId` in photographers table for reuse
- Pass metadata to Stripe sessions: `photographer_id`, `package_id`, `package_name`, `credits`
- Redirect URLs use `CORS_ORIGIN` env var
- Webhook verification uses `STRIPE_WEBHOOK_SECRET`

### Webhook Handling (from T-4)
- Log errors but return 200 to prevent retries on bad data
- Implement idempotency checks (e.g., check existing record before insert)
- DB injection: Add middleware before webhook routes
- Proper typing: Define `WebhookVariables` with `db: () => Database`

## Constraints / carry-forward items

### [KNOWN_LIMITATION]
- **T-5**: No transaction wrapping for consent record insert + photographer update (acceptable for MVP, both operations are idempotent-safe)
- **T-6**: PDPA consent copy is placeholder text (needs PM review)
- **T-6**: No UI tests added (dashboard has no existing test infrastructure)
- **T-7**: nearestExpiry uses simple MIN of purchase expires_at (not FIFO-aware with actual consumption logic)

### [ENG_DEBT]
- **T-6**: Add UI tests for consent flow (Vitest + React Testing Library)
- **T-6**: Add loading skeleton to ConsentGate instead of simple spinner
- **T-9**: Add unit tests for checkout endpoint
- **T-9**: T-10: Implement webhook fulfillment handler for `checkout.session.completed`

### [PM_FOLLOWUP]
- **T-5**: PDPA consent copy needs review before launch
- **T-6**: Verify Clerk session lifetime is configured for 24h
- **T-6**: Test LINE in-app browser behavior
- **T-9**: T-12: Implement success/cancel page UI

## Ops conventions

### Environment Variables
- `DATABASE_URL` - Postgres connection string (injected via Cloudflare Workers bindings)
- `ADMIN_API_KEY` - Admin API authentication key (for T-3 admin endpoints)
- `STRIPE_SECRET_KEY` - Stripe API key (test/live)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signature verification
- `CORS_ORIGIN` - Frontend origin for CORS and redirect URLs
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` - Clerk authentication

### Migration Workflow
- Schema changes in `packages/db/src/schema/**/*.ts`
- Generate migration: `pnpm --filter=@sabaipics/db db:generate`
- Apply migration: `pnpm --filter=@sabaipics/db db:migrate` (or `db:push` for dev)
- Migrations stored in `packages/db/drizzle/*.sql`

### Route Registration Order (Critical)
1. `/webhooks/*` - DB injection middleware first, then webhook routes (no auth, no CORS)
2. `/admin/*` - Admin routes with API key auth (before Clerk)
3. Public routes (e.g., `/credit-packages`) - No auth required
4. Clerk middleware - `use("/*", createClerkAuth())`
5. Protected routes - Use `requirePhotographer()` and `requireConsent()`

### Error Shape
- Authentication errors: Use `createAuthError()` from `@sabaipics/auth`
- Validation errors: Zod automatically formats with path + message
- Business logic errors: Return JSON with appropriate status code

### Price/Currency Conventions
- Store prices in satang (smallest unit): `29900 = 299 THB`
- API returns raw value for frontend to format
- Stripe: Use `unit_amount` in satang (divide by 100 for THB display)

### Testing Commands
- Type check: `pnpm check-types`
- Run tests: `pnpm --filter=@sabaipics/api test`
- Build all: `pnpm build`
- Build specific package: `pnpm --filter=<package> build`
