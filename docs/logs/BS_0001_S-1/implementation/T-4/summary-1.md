# Implementation Summary: T-4 Clerk Webhook Handler for user.created

**Task:** T-4 — Clerk webhook handler for user.created
**Root:** `BS_0001_S-1`
**Date:** 2026-01-10
**Iteration:** 1

---

## Overview

Implemented the `handleUserCreated` function in the Clerk webhook handler to create photographer records in the database when new users sign up via Clerk. Also added DB injection middleware before webhook routes so they can access `c.var.db()`.

---

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/index.ts` | Added DB injection middleware before webhook routes |
| `apps/api/src/routes/webhooks/clerk.ts` | Implemented `handleUserCreated` with DB insertion, cleaned up unused code |

---

## Key Changes

### 1. DB Injection for Webhooks (`apps/api/src/index.ts`)

**Problem:** Webhooks were registered BEFORE the DB injection middleware, so `c.var.db()` was not available.

**Solution:** Added DB injection middleware specifically for `/webhooks/*` routes BEFORE the webhook router is registered.

```typescript
const app = new Hono()
  // DB injection for webhooks (no auth, no CORS - verified by signature)
  .use("/webhooks/*", (c, next) => {
    c.set("db", () => createDb(c.env.DATABASE_URL));
    return next();
  })
  // Webhooks route (uses c.var.db from above)
  .route("/webhooks", webhookRouter)
```

### 2. Updated Clerk Webhook Handler (`apps/api/src/routes/webhooks/clerk.ts`)

**Added imports:**
```typescript
import { photographers } from "@sabaipics/db/schema";
import { eq } from "drizzle-orm";
import type { Database } from "@sabaipics/db";
```

**Added types:**
```typescript
type WebhookVariables = {
  db: () => Database;
};

export const clerkWebhookRouter = new Hono<{
  Bindings: WebhookBindings;
  Variables: WebhookVariables;
}...
```

**Implemented `handleUserCreated`:**
1. Extracts email from `user.email_addresses[0].email_address`
2. Builds display name from `first_name + last_name`
3. **Idempotency check:** Queries for existing photographer by `clerkId` before insert
4. Inserts new photographer record with `clerkId`, `email`, `name`
5. Returns early on duplicate (logs "already exists, skipping (idempotent)")

**Removed code (per plan decisions):**
- `user_type` metadata extraction (decision #4: only photographers sign up)
- `participant`-related logic (not needed)
- `line_user_id` extraction (can add later if needed)

---

## Idempotency Implementation

The webhook handler is idempotent on `clerk_id`:

```typescript
// Check if photographer already exists
const [existing] = await db
  .select({ id: photographers.id })
  .from(photographers)
  .where(eq(photographers.clerkId, user.id))
  .limit(1);

if (existing) {
  console.log("  → Photographer already exists, skipping (idempotent)");
  return;
}
```

This ensures duplicate webhook deliveries (which Clerk/Svix may send) don't create duplicate records.

---

## Error Handling

Per task requirements: "Logs errors but returns 200 (prevent Svix retries on bad data)"

```typescript
try {
  switch (event.type) {
    case "user.created":
      await handleUserCreated(event, c.var.db);
      break;
    // ...
  }
} catch (handlerError) {
  // Log error but return 200 to prevent retries on bad data
  console.error(`[Clerk Webhook] Handler error for ${event.type}:`, handlerError);
}

return c.json({ success: true }, 200);
```

---

## Validation

- ✅ TypeScript build passes
- ✅ All packages build successfully
- ✅ DB injection tested (webhooks can access `c.var.db()`)
- ✅ Idempotency check prevents duplicates

---

## Testing Instructions

**Testing with ngrok + Clerk Dashboard:**

1. Start dev server with ngrok tunnel:
   ```bash
   pnpm --filter @sabaipics/api dev:local
   # In another terminal:
   ngrok http 8787
   ```

2. Register ngrok URL in Clerk dashboard webhook settings:
   - URL: `https://xxx.ngrok.io/webhooks/clerk`
   - Events: Select `user.created`

3. Trigger signup via Clerk to test `user.created` event

4. Check database for photographer record:
   ```sql
   SELECT * FROM photographers;
   ```

5. Test idempotency: Re-send webhook from Clerk dashboard → verify no duplicate

---

## Known Limitations / TODOs

- `handleUserUpdated` and `handleUserDeleted` are stubs with TODO comments
- These can be implemented when needed (not in scope for T-4)

---

## References

- Task spec: `docs/logs/BS_0001_S-1/tasks.md#T-4`
- Plan: `docs/logs/BS_0001_S-1/plan/final.md#phase-1-auth`
- Plan decision #4: User type verification not needed (only photographers sign up)
- Plan decision #10: Clerk email required
