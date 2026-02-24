# Logs Scout: T-7 (Dashboard API)

**Root:** `BS_0001_S-1`
**Scanned:** T-1, T-2, T-3, T-4, T-5
**Date:** 2026-01-10

---

## Established Patterns

### Database & Schema (T-1)

1. **ID Type:** Native Postgres `uuid` type with `gen_random_uuid()` default
   - File: `packages/db/src/schema/*.ts`
2. **Timestamp Helpers:** Use `common.ts` builders

   ```typescript
   import { timestamptz, createdAtCol } from './common';

   createdAt: createdAtCol(); // Standard created_at
   expiresAt: timestamptz('expires_at').notNull(); // Custom timestamp
   ```

3. **Text Enums:** Defined as arrays
   - `creditLedgerTypes`: `['purchase', 'upload']`
   - `photoStatuses`: `['processing', 'indexed', 'failed']`
   - `consentTypes`: `['pdpa']`

4. **Typed JSONB:** Co-locate types with schema (e.g., `RekognitionFaceRecord` in `faces.ts`)

5. **Type Exports:**
   - Select type: `<TableName>` (e.g., `Photographer`, `Event`)
   - Insert type: `New<TableName>` (e.g., `NewPhotographer`, `NewEvent`)

6. **R2 Storage:** Store `r2_key` (not URL) - URLs change, keys are immutable

### Middleware Architecture (T-2)

1. **Middleware Location:** `apps/api/src/middleware/` (business logic stays in api app)

2. **DB Access Pattern:**

   ```typescript
   import { getDb } from '../lib/db';
   const db = getDb(c);
   ```

3. **Photographer Context Type:**

   ```typescript
   type PhotographerContext = {
     id: string;
     pdpaConsentAt: string | null;
   };
   ```

4. **Middleware Chaining:**

   ```typescript
   // Consent endpoint - no consent check needed
   app.post('/consent', requirePhotographer(), handler);

   // Protected routes - both required
   app.use('/dashboard/*', requirePhotographer(), requireConsent());
   ```

5. **Type Export Pattern:**
   - `PhotographerContext` - Minimal data in context
   - `PhotographerVariables` - `AuthVariables & { photographer: PhotographerContext }`

### Admin API Pattern (T-3)

1. **Admin Auth:** `X-Admin-API-Key` header, checked via `requireAdmin()` middleware

2. **Route Ordering (Critical):**

   ```typescript
   const app = new Hono()
     .route("/webhooks", webhookRouter)       // No auth
     .use("/*", cors(...))
     .route("/admin", adminRouter)            // API key auth (before Clerk)
     .use("/*", createClerkAuth())            // Clerk auth
     // Protected routes after this
   ```

3. **Validation:** Use `@hono/zod-validator` with `zValidator`
   - Enables type-safe request validation
   - Enables testClient type inference

4. **Testing Pattern:** Hono `testClient`

   ```typescript
   import { testClient } from 'hono/testing';
   const client = testClient(app, MOCK_ENV);

   // GET
   await client['resource'].$get(undefined, { headers });

   // POST
   await client['resource'].$post({ json: body }, { headers });

   // PATCH with params
   await client['resource'][':id'].$patch({ param: { id }, json: body }, { headers });
   ```

### Webhook Patterns (T-4)

1. **DB Injection for Webhooks:** Add before webhook router

   ```typescript
   .use("/webhooks/*", (c, next) => {
     c.set("db", () => createDb(c.env.DATABASE_URL));
     return next();
   })
   .route("/webhooks", webhookRouter)
   ```

2. **Idempotency:** Query before insert to prevent duplicates

   ```typescript
   const [existing] = await db
     .select({ id: table.id })
     .from(table)
     .where(eq(table.uniqueField, value))
     .limit(1);
   if (existing) return; // Skip
   ```

3. **Webhook Error Handling:** Log but return 200 (prevent retries on bad data)
   ```typescript
   try { /* handler */ }
   catch (err) { console.error(...); }
   return c.json({ success: true }, 200);
   ```

### Consent API Pattern (T-5)

1. **HTTP Status Codes:**
   - 201: Created (success)
   - 401: No valid auth session
   - 403: Photographer not in DB
   - 409: Already exists (idempotent conflict)

2. **Route Registration:** After Clerk auth middleware

   ```typescript
   .use("/*", createClerkAuth())
   .route("/consent", consentRouter)
   ```

3. **IP Capture:** Use `CF-Connecting-IP` header for Cloudflare Workers

---

## Known Limitations

| Source | Limitation                                            | Status                                  |
| ------ | ----------------------------------------------------- | --------------------------------------- |
| T-4    | `handleUserUpdated` and `handleUserDeleted` are stubs | Deferred (not in scope)                 |
| T-5    | No transaction wrapping for insert + update           | Accepted for MVP (both idempotent-safe) |

---

## Follow-ups That May Impact T-7

| Source | Follow-up                                    | Impact                 |
| ------ | -------------------------------------------- | ---------------------- |
| T-5    | PDPA consent copy needs review before launch | No code impact for T-7 |

---

## Conventions for T-7

Based on established patterns, T-7 (Dashboard API) should:

1. **Register routes** after Clerk auth middleware (like T-5)
2. **Use middleware chain:** `requirePhotographer()`, `requireConsent()` for dashboard routes
3. **Use Zod validation** with `zValidator` for request bodies
4. **Follow type exports:** `PhotographerContext`, `PhotographerVariables`
5. **Use `getDb(c)`** for database access
6. **Apply idempotency** pattern for any create operations
7. **Use testClient** for unit tests with proper type inference
8. **Return consistent status codes:** 401/403/409 as established
