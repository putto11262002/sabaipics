# Plan: Neon Transaction Support

**Branch:** `feat/neon-transaction-support`
**Date:** 2026-01-14
**Goal:** Add database transaction support using dual-adapter pattern (HTTP + WebSocket)

---

## Background

Neon offers two connection adapters:
- **HTTP adapter** (`drizzle-orm/neon-http`) - Fast, stateless, no transactions ← currently used
- **WebSocket adapter** (`drizzle-orm/neon-js`) - Supports transactions, persistent connection

**Solution:** Use HTTP for 90% of queries, WebSocket only for transactional operations.

**Key constraint:** CF Workers supports outbound WebSocket (client mode) for DB connections.

---

## Tasks Requiring Transactions

### 1. T-10 — Stripe Webhook Handler (HIGH PRIORITY)
**File:** `apps/api/src/routes/webhooks/stripe.ts`

**Operations (must be atomic):**
1. Check idempotency (has this `stripe_session_id` been processed?)
2. Insert `credit_ledger` row (+credits)

**Risk:** Webhook retries could allocate credits twice if idempotency check and insert aren't atomic.

**Transaction Scope:**
```typescript
await db.transaction(async (tx) => {
  // 1. Check if stripe_session_id exists
  // 2. If not, insert credit_ledger
})
```

---

### 2. T-16 — Photo Upload API (HIGH PRIORITY)
**File:** `apps/api/src/routes/photos.ts`

**Operations (must be atomic):**
1. Check credit balance ≥ 1
2. Deduct 1 credit (FIFO from `credit_ledger`)
3. Insert `photos` row with `status=processing`

**Risk:** Credit deducted but photo record not created → user loses credit, photo lost.

**Transaction Scope:**
```typescript
await db.transaction(async (tx) => {
  // 1. Query credit balance
  // 2. Insert negative credit_ledger entry
  // 3. Insert photos row
})
```

---

### 3. T-17 — Queue Consumer (MEDIUM PRIORITY)
**File:** `apps/api/src/queue/photo-consumer.ts`

**Operations (must be atomic):**
1. Insert multiple `faces` rows from Rekognition response
2. Update `photos` row: `status='indexed'`, `face_count=N`
3. Update `events`: `photo_count++`, `face_count+=N`

**Risk:** Faces indexed but photo status not updated → inconsistent UI, possible duplicate processing.

**Transaction Scope:**
```typescript
await db.transaction(async (tx) => {
  // 1. Insert all faces
  // 2. Update photos status
  // 3. Update events counts
})
```

---

### 4. T-5 — Consent API (LOW PRIORITY)
**File:** `apps/api/src/routes/consent.ts`

**Operations (should be atomic):**
1. Insert `consent_records` row
2. Update `photographers.pdpa_consent_at`

**Risk:** Consent recorded but photographer not updated → inconsistent state.

**Transaction Scope:**
```typescript
await db.transaction(async (tx) => {
  // 1. Insert consent_record
  // 2. Update photographers
})
```

---

### 5. T-13 — Events API (LOW PRIORITY)
**File:** `apps/api/src/routes/events.ts`

**Operations (should be atomic):**
1. Insert `events` row
2. Insert default `event_access` row

**Risk:** Event created but access record missing → broken access control.

**Transaction Scope:**
```typescript
await db.transaction(async (tx) => {
  // 1. Insert event
  // 2. Insert event_access
})
```

---

## Implementation Approach

### Step 1: Update `packages/db/src/client.ts` - Dual Adapter Setup

```typescript
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";      // Fast, no transactions
import { drizzle as drizzleWs } from "drizzle-orm/neon-js";  // With transactions
import * as schema from "./schema";

/**
 * HTTP adapter - for non-transactional queries (90% of cases)
 * Fast, stateless, no transaction support
 */
export function createDbHttp(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

/**
 * WebSocket adapter - for transactional queries only
 * Maintains persistent connection, supports transactions
 *
 * Uses singleton pattern within CF Worker context for connection pooling
 */
let wsDbCache: ReturnType<typeof drizzleWs> | null = null;

export function createDbTx(connectionString: string) {
  if (wsDbCache) return wsDbCache;

  const sql = neon(connectionString, { webSocket: true });
  wsDbCache = drizzleWs(sql, { schema });
  return wsDbCache;
}

// Type exports
export type Database = ReturnType<typeof createDbHttp>;
export type DatabaseTx = ReturnType<typeof createDbTx>;
```

### Step 2: Update Hono Middleware in `apps/api/src/index.ts`

```typescript
// Current middleware (line 44-48)
.use((c, next) => {
  c.set('db', () => createDb(c.env.DATABASE_URL));  // ← HTTP only
  return next();
})

// Updated middleware (dual adapter)
.use((c, next) => {
  // HTTP client - for reads and simple writes (default)
  c.set('db', () => createDbHttp(c.env.DATABASE_URL));
  // WebSocket client - for transactions only
  c.set('dbTx', () => createDbTx(c.env.DATABASE_URL));
  return next();
})
```

**TypeScript types update** in `apps/api/src/types.ts`:
```typescript
// Add to Env type
export type Env = {
  Bindings: Bindings;
  Variables: {
    db: () => Database;      // HTTP adapter
    dbTx: () => DatabaseTx;  // WebSocket adapter with transactions
    // ... existing vars
  };
};
```

### Step 3: Usage Pattern in Endpoints

**Default (HTTP adapter - most cases):**
```typescript
// Non-transactional - use HTTP (fast)
const db = c.var.db();
const photos = await db.select().from(photosTable).where(...);
```

**Transactional (WebSocket adapter):**
```typescript
// Transactional - use WebSocket
const dbTx = c.var.dbTx();

await dbTx.transaction(async (tx) => {
  // 1. Check idempotency
  // 2. Insert credit_ledger
});
```

### Step 4: Migrate Endpoints (Priority Order)

| Priority | Task | File | Change |
|----------|------|------|--------|
| 1 | T-10 Stripe webhook | `routes/webhooks/stripe.ts` | `c.var.db()` → `c.var.dbTx().transaction()` |
| 2 | T-16 Photo upload | `routes/photos.ts` | `c.var.db()` → `c.var.dbTx().transaction()` |
| 3 | T-17 Queue consumer | `queue/photo-consumer.ts` | Use transaction wrapper |
| 4 | T-5 Consent API | `routes/consent.ts` | `c.var.db()` → `c.var.dbTx().transaction()` |
| 5 | T-13 Events API | `routes/events.ts` | `c.var.db()` → `c.var.dbTx().transaction()` |

### Step 5: Add Tests

For each transactional endpoint:
- Unit test with mocked DB failure on second operation
- Verify rollback occurs (no partial writes)
- Test retry scenarios (webhook idempotency)

---

## Open Questions

- [x] Does Drizzle ORM with Neon support transactions? → Yes, via `neon-js` adapter
- [ ] How does Neon serverless handle transaction timeouts in CF Workers?
- [ ] Should we add retry logic for transaction conflicts?
- [ ] WS connection lifecycle in CF Workers - when does it close?

---

## References
- Tasks: `docs/logs/BS_0001_S-1/tasks.md`
- Plan: `docs/logs/BS_0001_S-1/plan/final.md`
