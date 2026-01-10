# Implementation Plan: T-4 - Clerk Webhook Handler for user.created

**Execution Root:** BS_0001_S-1
**Task ID:** T-4
**Date:** 2026-01-10
**Status:** Approved

## Task Summary

Implement the `handleUserCreated` function in the Clerk webhook handler to create photographer records in the database when new users sign up via Clerk.

## Current State

- File: `apps/api/src/routes/webhooks/clerk.ts`
- Webhook signature verification is already implemented using Svix
- Handler stub exists with logging but no DB insertion
- Schema for `photographers` table exists in `packages/db/src/schema/photographers.ts`
- DB is injected via middleware in `index.ts` but AFTER webhooks are registered

## Database Schema

```typescript
// photographers table
{
  id: uuid (primary key, default gen_random_uuid())
  clerkId: text (not null, unique)
  email: text (not null)
  name: text (nullable)
  pdpaConsentAt: timestamptz (nullable)
  createdAt: timestamptz (default now())
}
```

## Implementation Steps

### Step 1: Update index.ts to inject DB before webhooks
Add DB injection middleware BEFORE the webhook router so webhooks can use `c.var.db()`.

**File:** `apps/api/src/index.ts`

**Before:**
```typescript
const app = new Hono()
  .route("/webhooks", webhookRouter)
  .use("/*", (c, next) => {
    c.set("db", () => createDb(c.env.DATABASE_URL));
    return next();
  })
```

**After:**
```typescript
const app = new Hono()
  // DB injection for webhooks (no auth, no CORS)
  .use("/webhooks/*", (c, next) => {
    c.set("db", () => createDb(c.env.DATABASE_URL));
    return next();
  })
  .route("/webhooks", webhookRouter)
  // Then CORS and auth for all other routes
  .use("/*", cors({...}))
  .use("/*", (c, next) => {
    c.set("db", () => createDb(c.env.DATABASE_URL));
    return next();
  })
```

### Step 2: Update WebhookBindings and Variables
Add `db` function to webhook context variables.

**File:** `apps/api/src/routes/webhooks/clerk.ts`

```typescript
// Import Database type
import type { Database } from "@sabaipics/db";

// Update Variables type
type WebhookVariables = {
  db: () => Database;
};

// Update Hono type to include Variables
export const clerkWebhookRouter = new Hono<{
  Bindings: WebhookBindings;
  Variables: WebhookVariables;
}>().post("/", async (c) => {
  // Now c.var.db() is available
  const db = c.var.db();
```

### Step 3: Import Dependencies
Add imports for database operations.

```typescript
import { photographers } from "@sabaipics/db/schema";
import { eq } from "drizzle-orm";
```

### Step 4: Implement handleUserCreated
Replace the stub implementation with actual database insertion.

**Logic:**
1. Get DB client: `const db = c.var.db();`
2. Extract `clerk_id`, `email`, and `name` from Clerk webhook event data
3. Check if photographer already exists by `clerkId` (idempotency check)
4. If exists, log and return success (no-op)
5. If not exists, insert new photographer record with:
   - `clerkId`: user.id
   - `email`: email_addresses[0].email_address
   - `name`: first_name + last_name (or null)
6. Log success or errors appropriately

**Key Design Decisions:**
- **Idempotency:** Check if photographer exists by `clerkId` before inserting
- **Error Handling:** Log errors but return 200 to prevent Svix retries on bad data
- **User Type:** Per plan decision #4, only photographers sign up - no user_type check needed
- **Email:** Required per plan decision #10
- **Name:** Optional, constructed from first_name + last_name

### Step 5: Clean Up
Remove TODO comments and unused code:
- Remove `user_type` metadata extraction (decision #4)
- Remove `participant`-related logic
- Remove `line_user_id` extraction (can be added later if needed)
- Keep logging for debugging

## Acceptance Criteria

- [ ] Webhook creates `photographers` row with clerk_id, email, name
- [ ] Handles duplicate webhooks (idempotent on clerk_id)
- [ ] Returns 200 to Clerk on success
- [ ] Logs errors but returns 200 (prevent Svix retries on bad data)

## Testing

**Testing with ngrok + Clerk Dashboard:**
1. Start dev server with ngrok tunnel
2. Register ngrok URL in Clerk dashboard webhook settings (`https://xxx.ngrok.io/webhooks/clerk`)
3. Trigger signup via Clerk to test `user.created` event
4. Check database for photographer record
5. Test duplicate webhook delivery for idempotency (re-send from Clerk dashboard)

**Note:** Coordinate with user before testing - they will trigger the webhook from Clerk dashboard.

## Risk Assessment

- **Risk Level:** Medium (auth flow)
- **Mitigation:** Test with ngrok + Clerk dashboard before deploying
- **Rollback:** Simple function replacement if issues arise

## References

- Task spec: `docs/logs/BS_0001_S-1/tasks.md#T-4`
- Plan: `docs/logs/BS_0001_S-1/plan/final.md#phase-1-auth`
- Schema: `packages/db/src/schema/photographers.ts`
