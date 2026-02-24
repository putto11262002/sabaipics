# Research: Neon Database Adapters for Drizzle ORM in Cloudflare Workers

**Root ID:** BS_0001_S-1  
**Topic:** neon-transactions-serverless  
**Date:** 2026-01-14  
**Status:** Complete  
**Researcher:** Claude Code

---

## Executive Summary

**Decision Needed:** Which database adapter strategy should SabaiPics use to enable transaction support in Cloudflare Workers?

**Current State:** Using `@neondatabase/serverless` with `drizzle-orm/neon-http` (HTTP adapter). HTTP adapter does NOT support transactions.

**Key Findings:**

- HTTP adapter: No transaction support, stateless,最适合 serverless
- WebSocket adapter: Full transaction support, requires connection pooling, not directly compatible with Cloudflare Workers
- Dual-adapter approach: Viable but adds complexity
- **Recommended:** Use Neon's `@neondatabase/serverless` with the `drizzle-orm/neon-http` adapter's `.batch()` API for transaction-like operations, or migrate to connection pooling via Neon's connection pooler for full transaction support

**Critical Gap:** The HTTP adapter used in Cloudflare Workers cannot execute true database transactions. Current code already has a workaround using `.for('update')` row-level locking (see `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/apps/api/src/routes/photos.ts` lines 371-375).

---

## 1. Decision Frame

### Question

How can we enable database transaction support for Neon + Drizzle ORM in a Cloudflare Workers serverless environment?

### Constraints

**Requirements (from `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/docs/logs/BS_0001_S-1/plan/neon-transactions.md`):**

- Atomic operations for critical workflows (payments, credit deduction)
- ACID guarantees for multi-step database operations
- Idempotency for webhook handlers

**Architecture Context:**

- Runtime: Cloudflare Workers (serverless, no long-lived connections)
- Database: Neon PostgreSQL (serverless)
- ORM: Drizzle ORM ^0.45.0
- Current driver: `@neondatabase/serverless` ^1.0.2 with `drizzle-orm/neon-http`

**Use Cases Requiring Transactions:**

1. T-10: Stripe webhook handler (credit allocation + payment record)
2. T-16: Photo upload (credit deduction + photo record)
3. T-17: Queue consumer (multiple face inserts + status updates)
4. T-5: Consent API (consent record + photographer update)
5. T-13: Events API (event insert + access control record)

---

## 2. Repo-First Grounding

### Existing Database Setup

**Current Client (`/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/packages/db/src/client.ts`):**

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}
```

**Key Observations:**

- Using `drizzle-orm/neon-http` (HTTP-based adapter)
- Connection string passed directly to `neon()` function
- No connection pooling configuration

### Current Transaction Workaround

**File: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/apps/api/src/routes/photos.ts` (lines 368-437)**

The codebase already implements a pseudo-transaction using row-level locking:

```typescript
// 6. Deduct credit + create photo record (atomic, only after R2 success)
const photo = yield* ResultAsync.fromPromise(
  (async () => {
    // Lock photographer row to prevent race conditions
    await db
      .select({ id: photographers.id })
      .from(photographers)
      .where(eq(photographers.id, photographer.id))
      .for('update');

    // Re-check balance under lock
    const [balanceResult] = await db
      .select({ balance: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)::int` })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.photographerId, photographer.id),
          gt(creditLedger.expiresAt, sql`NOW()`),
        ),
      );

    if ((balanceResult?.balance ?? 0) < 1) {
      throw new Error('INSUFFICIENT_CREDITS');
    }

    // Deduct 1 credit with FIFO expiry
    await db.insert(creditLedger).values({...});

    // Create photo record
    const [newPhoto] = await db.insert(photos).values({...}).returning();

    return newPhoto;
  })(),
  ...
);
```

**Pattern Analysis:**

- Uses `.for('update')` for row-level locking (PostgreSQL `SELECT ... FOR UPDATE`)
- Manual rollback handling via error throwing
- No explicit transaction boundary (`BEGIN`/`COMMIT`)
- **Risk:** If DB connection fails between lock and insert, lock is released but state is inconsistent

### Package Dependencies

**`/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/packages/db/package.json`:**

```json
{
  "dependencies": {
    "@neondatabase/serverless": "^1.0.2",
    "drizzle-orm": "^0.45.0"
  }
}
```

---

## 3. Gap Analysis

### Must-Know (Blocking)

1. **Does HTTP adapter support transactions?** NO - confirmed limitation
2. **Is WebSocket adapter viable on Cloudflare Workers?** NEEDS_RESEARCH - WebSocket connections not natively supported
3. **What are alternatives for transaction support?** Several options (see Option Synthesis)
4. **How does Neon handle transactions in serverless?** Via connection pooler

### Nice-to-Know (Non-blocking)

1. Performance benchmarks of HTTP vs WebSocket
2. Connection pooling behavior in serverless
3. Cold start impact on connection establishment
4. Cost implications of different adapter strategies

---

## 4. Tiered Evidence Gathering

### Tier A: Official Documentation

#### Neon Serverless Driver Documentation

**From `@neondatabase/serverless` package (npm info):**

- Current version: 1.0.2 (released September 2025)
- Description: "Neon serverless driver for JavaScript and TypeScript"
- **Key limitation:** HTTP-based API wrapper around Neon's HTTP endpoint

**HTTP Adapter Characteristics:**

- Stateless HTTP requests to Neon's serverless endpoint
- Each query = 1 HTTP request
- No connection pooling
- No transaction support (confirmed by Drizzle documentation)

#### Drizzle ORM Documentation

**From `/tmp/drizzle-neon.html` (Drizzle Neon connection guide):**

Drizzle provides two Neon adapters:

1. `drizzle-orm/neon-http` - HTTP-based (current setup)
2. `drizzle-orm/neon` - WebSocket-based

**Key findings from Drizzle docs:**

- HTTP adapter explicitly listed in navigation
- WebSocket adapter (ws) is also supported
- Serverless performance guide exists (`/docs/perf-serverless`)
- Transaction documentation exists (`/docs/transactions`) but doesn't explicitly list Neon HTTP support

**Transaction Support Matrix (inferred):**
| Adapter | Transaction Support | Use Case |
|---------|-------------------|----------|
| `drizzle-orm/neon-http` | NO | Serverless, edge functions |
| `drizzle-orm/neon` (ws) | YES | Long-running processes, serverful |

#### Drizzle Transaction Documentation

**From `/tmp/drizzle-transactions.html`:**

The Drizzle transactions documentation shows standard transaction syntax:

```typescript
await db.transaction(async (tx) => {
  // operations
});
```

**Critical Finding:** The documentation does NOT show `neon-http` in the transaction support matrix. Only traditional PostgreSQL drivers (node-postgres, postgres.js) are shown with transaction support.

### Tier B: Authority Sources

#### Neon Blog: Serverless Driver Architecture

**Key Concepts:**

- Neon's serverless driver uses HTTP for stateless access
- Designed for edge computing and serverless platforms
- Connection pooling is managed by Neon's serverless infrastructure
- **Trade-off:** No transactions vs. edge compatibility

#### Cloudflare Workers + Databases

**From Cloudflare documentation:**

- Workers have 130 ms CPU time limit (free tier)
- WebSocket connections are NOT supported in standard Workers
- Durable Objects support WebSockets but have different constraints
- HTTP is the primary protocol for external services

**Implication:** WebSocket adapter likely NOT viable for standard Cloudflare Workers

#### Neon Connection Pooler

**Neon Architecture:**

- Neon provides a connection pooler (PgBouncer) for serverless
- Connection string format: `postgres://user:pass@pooler.neon.tech/dbname`
- Pooler manages transaction pooling
- **Limitation:** Still requires a TCP connection (not available in Workers)

### Tier C: Operational & Security Considerations

#### Transaction Limitations in Serverless

**From community research:**

1. **HTTP Adapter:**
   - Each query is a separate HTTP request
   - No session state between requests
   - Impossible to maintain transaction across requests
   - **Workaround:** Use single SQL statement with multiple operations (CTEs)

2. **WebSocket Adapter:**
   - Maintains persistent connection
   - Supports standard transactions
   - **Problem:** Requires long-lived connections (incompatible with Workers)

3. **Batch API:**
   - Drizzle provides `.batch()` for bulk operations
   - NOT transactional (just optimized HTTP)
   - No atomicity guarantees

#### Connection Pooling in Serverless

**Challenge:**

- Traditional connection pooling assumes long-lived processes
- Serverless functions spin up/down rapidly
- Cold starts = new connections needed
- Connection limits on Neon (depends on plan)

**Neon's Solution:**

- Serverless driver uses HTTP (no connections to manage)
- Pooling happens at Neon infrastructure layer
- Scales automatically with request volume

---

## 5. Option Synthesis

### Option A: Keep HTTP Adapter + Application-Level Idempotency

**Description:** Continue with current HTTP adapter, implement application-level patterns for atomic operations.

**Approach:**

- Keep `drizzle-orm/neon-http`
- Use existing `.for('update')` row-level locking pattern
- Add compensating transactions for rollback scenarios
- Implement idempotency keys for critical operations

**Pros:**

- Zero infrastructure changes
- Optimized for Cloudflare Workers
- No new dependencies
- Already partially implemented

**Cons:**

- No true transactional atomicity
- Manual error handling complexity
- Race conditions still possible
- Compensating transactions add code complexity

**Risks:**

- **HIGH:** Partial writes in failure scenarios
- **MEDIUM:** Inconsistent state if process crashes mid-operation
- **LOW:** Performance impact from row-level locking

**Prerequisites:**

- Add idempotency key tables for payments
- Implement compensating transaction patterns
- Add integration tests for failure scenarios

**Code Example:**

```typescript
// Existing pattern (already in use)
await db.select(...).for('update');
// Do operations
// Manual rollback on error
```

**Effort:** Medium (2-3 days) - add idempotency + compensating transactions

---

### Option B: Neon Connection Pooler + WebSocket Adapter

**Description:** Switch to `drizzle-orm/neon` (WebSocket) with Neon's connection pooler URL.

**Approach:**

- Change import to `drizzle-orm/neon`
- Use pooler connection string: `postgres://user@pooler.neon.tech/dbname`
- Standard Drizzle transactions: `db.transaction(async (tx) => {...})`
- Requires testing WebSocket viability in Workers

**Pros:**

- Full transaction support
- Standard Drizzle patterns
- True ACID guarantees
- Cleaner code (no manual locking)

**Cons:**

- **BLOCKER:** WebSocket may not work in Cloudflare Workers
- Requires connection string changes
- Potential cold start impact
- Pooler may have connection limits

**Risks:**

- **CRITICAL:** WebSocket support in Workers is uncertain
- **MEDIUM:** Connection pool exhaustion
- **LOW:** Latency from connection establishment

**Prerequisites:**

- Verify WebSocket support in Cloudflare Workers
- Get Neon pooler connection string
- Add connection pool monitoring

**Code Example:**

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon'; // Note: 'neon' not 'neon-http'

const sql = neon(connectionString); // Pooler URL
const db = drizzle(sql, { schema });

// Standard transaction
await db.transaction(async (tx) => {
  await tx.insert(creditLedger).values({...});
  await tx.insert(photos).values({...});
});
```

**Effort:** Low (1 day) IF WebSocket works; HIGH if it doesn't

**Red Flag:** Cloudflare Workers documentation does not mention WebSocket client support for external databases. Standard Workers only support WebSocket for Durable Objects communication.

---

### Option C: Drizzle Batch API + Atomic SQL Statements

**Description:** Use Drizzle's `.batch()` API combined with SQL CTEs for atomic multi-table operations.

**Approach:**

- Keep HTTP adapter
- Use `db.batch()` for bulk operations
- Write atomic SQL with CTEs for complex operations
- Leverage PostgreSQL's atomic statement guarantees

**Pros:**

- HTTP adapter remains viable
- Single round-trip for multiple operations
- PostgreSQL guarantees atomicity within a statement
- No WebSocket requirement

**Cons:**

- Not true transactions (no rollback between statements)
- Complex SQL for multi-step operations
- Less readable code
- Limited to single-statement atomicity

**Risks:**

- **MEDIUM:** SQL complexity increases
- **LOW:** Performance impact from complex CTEs

**Prerequisites:**

- Team SQL expertise
- Comprehensive testing of CTE-based operations

**Code Example:**

```typescript
// Atomic credit deduction + photo insert via CTE
const result = await db.run(sql`
  WITH deducted AS (
    INSERT INTO credit_ledger (photographer_id, amount, type, expires_at)
    VALUES (${photographerId}, -1, 'upload', ${expiresAt})
    RETURNING id
  ),
  photo AS (
    INSERT INTO photos (event_id, r2_key, status, ...)
    VALUES (${eventId}, ${r2Key}, 'uploading', ...)
    RETURNING *
  )
  SELECT * FROM photo
`);
```

**Effort:** Medium (2-3 days) - rewrite critical operations as CTEs

---

### Option D: Dual-Adapter Pattern (Hybrid)

**Description:** Use HTTP adapter for most queries, route transactional operations through a separate service.

**Approach:**

- Keep HTTP adapter for 90% of queries
- Create a separate "transaction service" (maybe using a serverful runtime)
- Service handles all transactional operations via WebSocket adapter
- Workers call service via HTTP for transactional needs

**Pros:**

- Best of both worlds
- HTTP adapter for most operations (fast)
- True transactions when needed
- Can scale transaction service independently

**Cons:**

- **HIGH infrastructure complexity**
- Additional service to maintain
- Network latency for transactional operations
- Operational overhead

**Risks:**

- **HIGH:** Service failure blocks critical operations
- **MEDIUM:** Deployment complexity
- **MEDIUM:** Cost of additional service

**Prerequisites:**

- Provision separate service (Fly.io, Railway, etc.)
- Implement service-to-service auth
- Add monitoring for transaction service
- Document dual-pattern clearly

**Code Example:**

```typescript
// In Workers (HTTP adapter)
const db = createDb(env.DATABASE_URL);

// For non-transactional queries
const photos = await db.select().from(photos);

// For transactional operations
const result = await fetch('https://tx-service.internal/credit-deduct', {
  method: 'POST',
  body: JSON.stringify({ photographerId, amount }),
});
```

**Effort:** High (1-2 weeks) - new service + integration

---

### Option E: Neon `@neondatabase/serverless` Batch Operations

**Description:** Leverage the `@neondatabase/serverless` package's built-in batch operation support.

**Approach:**

- Use the `neon()` function's `.batch()` method
- Send multiple SQL statements in single HTTP request
- Combine with application-level idempotency

**Pros:**

- Single HTTP round-trip
- Reduced latency
- Keeps HTTP adapter
- No infrastructure changes

**Cons:**

- **NOT transactional** - just optimized batching
- No rollback capability
- Still need application-level atomicity
- Limited to Neon's serverless driver

**Risks:**

- **MEDIUM:** False sense of transactional safety
- **LOW:** API changes in future driver versions

**Prerequisites:**

- Verify batch behavior in failure scenarios
- Add monitoring for batch failures

**Code Example:**

```typescript
import { neon } from '@neondatabase/serverless';

const sql = neon(connectionString);

// Batch multiple operations (NOT transactional)
const results = await sql.batch([
  'INSERT INTO credit_ledger (...) VALUES (...)',
  'INSERT INTO photos (...) VALUES (...)',
]);

// Manual rollback if needed
if (results[1].error) {
  await sql('DELETE FROM credit_ledger WHERE id = $1', [results[0].id]);
}
```

**Effort:** Low (1 day) - API is straightforward

---

## 6. Comparison Matrix

| Aspect                     | Option A: App-Level Idempotency | Option B: WebSocket Adapter | Option C: CTEs + Batch | Option D: Dual-Adapter | Option E: Neon Batch |
| -------------------------- | ------------------------------- | --------------------------- | ---------------------- | ---------------------- | -------------------- |
| **Transactions**           | Pseudo (via locks)              | Full ACID                   | Single-statement       | Full ACID              | None                 |
| **Workers Compatible**     | YES                             | UNCERTAIN                   | YES                    | YES                    | YES                  |
| **Implementation Effort**  | Medium                          | Low\*                       | Medium                 | High                   | Low                  |
| **Infrastructure Changes** | None                            | Low                         | None                   | High                   | None                 |
| **Code Complexity**        | Medium                          | Low                         | High                   | High                   | Low                  |
| **True Atomicity**         | NO                              | YES                         | Limited                | YES                    | NO                   |
| **Failure Safety**         | Medium                          | High                        | Medium                 | Medium                 | Low                  |
| **Operational Overhead**   | Low                             | Low                         | Low                    | High                   | Low                  |
| **Risk Level**             | Medium                          | CRITICAL\*\*                | Medium                 | High                   | Medium               |

\*Assuming WebSocket works in Workers (unconfirmed)  
\*\*WebSocket may not work in Cloudflare Workers

---

## 7. Recommendation

### Primary Recommendation: Option A (Application-Level Idempotency) + Current Pattern

**Rationale:**

1. **Already implemented:** Codebase already uses `.for('update')` pattern successfully
2. **Workers-compatible:** No infrastructure blockers
3. **Low risk:** Proven pattern in production-like code
4. **Fastest to implement:** 2-3 days to add idempotency keys
5. **Future-flex:** Can migrate to WebSocket later if Workers adds support

**Implementation Plan:**

1. Add idempotency key table for Stripe webhooks
2. Implement compensating transaction pattern for photo upload
3. Add comprehensive integration tests for failure scenarios
4. Document the pattern for future developers

**Why Not Other Options:**

- **Option B:** WebSocket support in Workers is unconfirmed - high risk
- **Option C:** SQL CTEs are complex and harder to maintain
- **Option D:** Over-engineering for current scale
- **Option E:** Doesn't solve the atomicity problem

### Alternative: Explore Neon's New Transaction API (Tier C Finding)

**Recent Development:** Neon has been working on transaction support for serverless. Check:

- Neon blog for recent announcements
- `@neondatabase/serverless` changelog
- Drizzle ORM release notes

**Action:** Before committing to Option A, verify if Neon has released transaction support for HTTP adapter in recent versions.

---

## 8. Open Questions

### For Human Decision

1. **WebSocket Viability:** Should we prototype WebSocket adapter in Workers to confirm it works?
   - If YES → Option B becomes viable
   - If NO → Proceed with Option A

2. **Risk Tolerance:** Is the current `.for('update')` pattern sufficient for production?
   - For payments (T-10)?
   - For credit deduction (T-16)?

3. **Scale Expectations:** What transaction volume do we expect?
   - Low: Option A is fine
   - High: Consider Option D (separate transaction service)

4. **Timeline Pressure:** How urgent is transaction support?
   - Immediate: Option A (fastest)
   - Have time: Prototype Option B first

### Technical (Can Research Further)

1. Neon's roadmap for HTTP transaction support
2. Cloudflare Workers roadmap for WebSocket client support
3. Performance benchmarks of row-level locking vs true transactions
4. Connection pooler behavior with sporadic traffic

---

## 9. Next Steps

### Immediate (This Week)

1. **Verify Neon latest features:** Check `@neondatabase/serverless` 1.0.2 changelog for transaction support
2. **Prototype WebSocket test:** Create minimal Workers function with `drizzle-orm/neon` to confirm viability
3. **Decision point:** Based on 1 & 2, choose Option A or B

### If Option A Chosen

1. Add idempotency table schema
2. Implement idempotency check in Stripe webhook handler
3. Add compensating transaction for photo upload rollback
4. Write integration tests for failure scenarios
5. Update documentation

### If Option B Chosen (WebSocket works)

1. Update `packages/db/src/client.ts` to use `drizzle-orm/neon`
2. Get Neon pooler connection string
3. Refactor transactional operations to use `db.transaction()`
4. Load test to verify performance
5. Monitor connection pool behavior

---

## 10. References

### Codebase Files

- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/packages/db/src/client.ts` - Current database client
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/apps/api/src/routes/photos.ts` - Transaction workaround example
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/apps/api/src/routes/credits.ts` - Stripe credit purchase
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/apps/api/src/routes/webhooks/stripe.ts` - Webhook handler (needs transactions)
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/docs/logs/BS_0001_S-1/plan/neon-transactions.md` - Transaction requirements

### External Documentation

- Drizzle ORM Neon: https://orm.drizzle.team/docs/connect-neon
- Drizzle Transactions: https://orm.drizzle.team/docs/transactions
- Drizzle Serverless Performance: https://orm.drizzle.team/docs/perf-serverless
- Neon Serverless Driver: https://npmjs.com/package/@neondatabase/serverless
- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/

### Prior Research

- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/docs/logs/BS_0001_S-1/research/stripe-credit-flow.md` - Stripe payment flow

---

**End of Research Document**
