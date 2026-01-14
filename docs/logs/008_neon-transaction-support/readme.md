# 008: Neon Transaction Support

**Date:** 2026-01-14
**Branch:** `feat/neon-transaction-support`
**Status:** Implementation

---

## Problem Statement

Several API endpoints perform multi-step database operations without transactional guarantees. This creates risks:

| Endpoint | Risk | Impact |
|----------|------|--------|
| T-10 Stripe webhook | Idempotency check + credit allocation not atomic | Double credit allocation on webhook retry |
| T-16 Photo upload | Credit deduction + photo insert not atomic | User loses credit, photo lost |
| T-17 Queue consumer | Faces insert + photo/events updates not atomic | Inconsistent UI, possible duplicate processing |

---

## Design Decision: Dual-Adapter Pattern

We chose a **dual-adapter approach** rather than a single adapter:

```
HTTP Adapter (neon-http)        WebSocket Adapter (neon-js)
    ↓                                    ↓
 Stateless, Fast                    Persistent, With Tx
    ↓                                    ↓
 90% of queries                    10% transactional queries
```

### Why Dual-Adapter?

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| HTTP only | Fast, stateless | No transaction support | ❌ Insufficient |
| WebSocket only | Transactions everywhere | Higher latency, connection overhead | ❌ Overkill |
| **Dual-adapter** | Fast for reads, tx when needed | Slightly more complex | ✅ **Chosen** |

### Key Trade-offs

**Performance vs. Consistency:**
- HTTP: ~5-10ms per query, no tx
- WebSocket: ~10-20ms first query, then ~5ms, with tx

**Connection Management:**
- HTTP: Stateless, no pooling needed
- WebSocket: Singleton pattern in CF Workers for connection reuse

---

## Architecture

### Client Setup (`packages/db/src/client.ts`)

```typescript
// HTTP adapter - for non-transactional queries (90% of cases)
export function createDbHttp(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

// WebSocket adapter - for transactional queries only
let wsDbCache: ReturnType<typeof drizzleWs> | null = null;

export function createDbTx(connectionString: string) {
  if (wsDbCache) return wsDbCache;  // Singleton for connection pooling

  const sql = neon(connectionString, { webSocket: true });
  wsDbCache = drizzleWs(sql, { schema });
  return wsDbCache;
}
```

### Hono Middleware (`apps/api/src/index.ts`)

```typescript
.use((c, next) => {
  // HTTP client - for reads and simple writes (default)
  c.set('db', () => createDbHttp(c.env.DATABASE_URL));
  // WebSocket client - for transactions only
  c.set('dbTx', () => createDbTx(c.env.DATABASE_URL));
  return next();
})
```

### Usage Pattern

```typescript
// Non-transactional (most cases) - use HTTP
const db = c.var.db();
const photos = await db.select().from(photosTable);

// Transactional (critical paths) - use WebSocket
const dbTx = c.var.dbTx();
await dbTx.transaction(async (tx) => {
  // 1. Check idempotency
  // 2. Insert credit_ledger
  // All or nothing
});
```

---

## Implementation Summary

### Files Modified

| File | Change |
|------|--------|
| `packages/db/src/client.ts` | Added `createDbHttp()` and `createDbTx()` |
| `apps/api/src/index.ts` | Middleware exposes both `db` and `dbTx` |
| `apps/api/src/types.ts` | Added `dbTx` to Env.Variables |
| `routes/webhooks/stripe.ts` | T-10: Wrapped in transaction |
| `routes/photos.ts` | T-16: Wrapped credit deduction in transaction |
| `queue/photo-consumer.ts` | T-17: Wrapped faces+updates in transaction |
| `routes/consent.ts` | T-5: Wrapped consent in transaction |
| `routes/events/index.ts` | T-13: Wrapped event creation in transaction |

### Transaction Scope by Task

**T-10 Stripe Webhook (HIGH PRIORITY)**
```typescript
await dbTx.transaction(async (tx) => {
  // 1. Check if stripe_session_id exists (idempotency)
  // 2. Insert credit_ledger with credits
});
```

**T-16 Photo Upload (HIGH PRIORITY)**
```typescript
await dbTx.transaction(async (tx) => {
  // 1. Check credit balance >= 1
  // 2. Insert negative credit_ledger entry
  // 3. Insert photos row
});
```

**T-17 Queue Consumer (MEDIUM PRIORITY)**
```typescript
await dbTx.transaction(async (tx) => {
  // 1. Insert all faces from Rekognition
  // 2. Update photos status and face_count
  // 3. Update events counts
});
```

**T-5 Consent API (LOW PRIORITY)**
```typescript
await dbTx.transaction(async (tx) => {
  // 1. Insert consent_record
  // 2. Update photographers.pdpa_consent_at
});
```

**T-13 Events API (LOW PRIORITY)**
```typescript
await dbTx.transaction(async (tx) => {
  // 1. Insert event
  // 2. Insert default event_access
});
```

---

## Technical Notes

### CF Workers WebSocket Support

**Critical Finding:** CF Workers DOES support outbound WebSocket connections (client mode).

Reference: https://developers.cloudflare.com/workers/examples/websockets/#write-a-websocket-client

Previous research incorrectly stated this wasn't possible. The `@neondatabase/serverless` package handles the WebSocket connection transparently.

### Connection Pooling

The WebSocket adapter uses a singleton pattern within the CF Worker context:

```typescript
let wsDbCache: ReturnType<typeof drizzleWs> | null = null;
```

This works because:
1. CF Workers maintain execution context for multiple requests
2. The WebSocket connection is reused across invocations
3. Connection is closed when the worker instance is recycled

### Transaction Timeouts

**Open Question:** How long can a transaction run in CF Workers before timeout?

- CF Workers: CPU time limit ~10-30ms (free), ~50s (paid)
- Neon: Default statement timeout ~60s
- **Recommendation:** Keep transactions short (<1 second ideally)

---

## Future Considerations

### Potential Optimizations

1. **Connection pool configuration:** Tune pool size for high-traffic scenarios
2. **Transaction retry logic:** Add retry for serialization failures
3. **Read replicas:** Use HTTP for reads from replicas when available

### Monitoring

Add observability for:
- Transaction success/failure rates
- WebSocket connection lifecycle
- Transaction duration metrics

### Alternative Futures

If Neon adds transaction support to HTTP adapter (via session mode), we could:
- Simplify to single adapter
- Remove WebSocket dependency
- Reduce connection management complexity

---

## References

- Plan: `docs/logs/BS_0001_S-1/plan/neon-transactions.md`
- Research: `docs/logs/BS_0001_S-1/research/neon-adapters-transactions.md`
- Tasks: `docs/logs/BS_0001_S-1/tasks.md`
- Neon Docs: https://neon.com/docs
- Drizzle ORM: https://orm.drizzle.team

---

## Changelog

### 2026-01-14
- Created log directory
- Documented dual-adapter design decision
- Listed transaction scopes for all affected tasks
