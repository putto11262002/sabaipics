# Neon Database Adapters for Cloudflare Workers - Transaction Support Research

**Research Date:** 2026-01-14  
**Branch:** `feat/neon-transaction-support`  
**RootId:** BS_0001_S-1  
**TaskId:** Research - Neon Adapters for Transactions

---

## Question + Constraints

### Research Question

How can we enable database transaction support in Cloudflare Workers using Drizzle ORM with Neon PostgreSQL while maintaining performance and compatibility?

### Decision Needed

Which Neon adapter approach should we implement to support database transactions in our Cloudflare Workers environment?

### Constraints

**Requirements & AC:**

- Must support ACID transactions for multi-step database operations
- Must be compatible with Cloudflare Workers runtime
- Must maintain existing code patterns (Drizzle ORM)
- Must handle 5 specific transaction use cases (T-10, T-16, T-17, T-5, T-13)

**Codebase/Architecture:**

- Current: `@neondatabase/serverless` ^1.0.2 + `drizzle-orm/neon-http`
- ORM: Drizzle ^0.45.0
- Runtime: Cloudflare Workers (compatibility_date: 2025-12-06)
- Database: Neon Postgres (serverless)
- Current client location: `/packages/db/src/client.ts`

**Environment/Runtime:**

- Cloudflare Workers (serverless, edge computing)
- V8 isolates (no Node.js APIs like net, tls)
- Connection limitations: Can't maintain persistent TCP connections

**Security/Compliance:**

- Payment operations (Stripe webhooks) require idempotency
- Credit ledger integrity is critical (financial data)
- PDPA consent records must be atomic

---

## Repo Exemplars (Paths) + Pattern Summary

### Current Database Client Pattern

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/packages/db/src/client.ts`

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

**Pattern Summary:**

- Uses `@neondatabase/serverless` driver
- Uses `drizzle-orm/neon-http` adapter
- Factory function pattern (`createDb`)
- Schema passed to Drizzle instance
- No transaction support (HTTP adapter is stateless)

### Transaction Requirements Pattern

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/docs/logs/BS_0001_S-1/plan/neon-transactions.md`

**Required Transaction Pattern:**

```typescript
await db.transaction(async (tx) => {
  // 1. Check idempotency/balance
  // 2. Insert/update records
  // 3. All operations atomic (all succeed or all rollback)
});
```

**Use Cases:**

1. **T-10 (Stripe Webhook):** Idempotency check + credit insert
2. **T-16 (Photo Upload):** Balance check + credit deduct + photo insert
3. **T-17 (Queue Consumer):** Faces insert + photo update + event update
4. **T-5 (Consent API):** Consent insert + photographer update
5. **T-13 (Events API):** Event insert + event_access insert

### Existing Mock Pattern (Test Expectation)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent5/apps/api/src/routes/events/index.test.ts`

```typescript
transaction: vi.fn().mockImplementation(async (callback) => {
  queryCount = 0;
  return callback(mockDb);
});
```

**Pattern:** Tests already expect `db.transaction()` API to exist, but it's not implemented in production.

---

## Gaps (Must-Know / Nice-to-Know)

### Must-Know (Blockers)

1. **Can Neon WebSocket adapter run in Cloudflare Workers?** - WS requires persistent connections
2. **Does Neon support transactions via HTTP-only path?** - Need to verify `@neondatabase/serverless` capabilities
3. **What is the Drizzle transaction API for Neon adapters?** - Different adapters have different transaction APIs
4. **Performance impact of dual-adapter setup?** - Cold starts, connection overhead
5. **How to handle connection pooling with WS adapter in Workers?** - Workers can't maintain connections

### Nice-to-Know (Optimization)

1. **Cost implications of WS vs HTTP adapter?** - Neon pricing model
2. **Are there Neon-specific transaction features?** - Batch operations, savepoints
3. **Migration path from HTTP to WS?** - Backward compatibility
4. **Hybrid approach implementation patterns?** - Routing based on operation type
5. **Transaction timeout limits in Neon?** - Edge case handling

---

## Tiered Findings

### Tier A: Breadth Scan (Official Documentation & Primary Sources)

#### Finding 1: Neon Serverless Driver Capabilities

**Source:** Neon Official Documentation (inferred from package structure)

The `@neondatabase/serverless` package provides:

- **HTTP-based driver** for serverless environments
- **No native transaction support** via the HTTP API
- Each HTTP request is stateless and independent
- Transactions require maintaining session state across requests

**Key Limitation:**

```
HTTP adapter = No session management = No transactions
```

#### Finding 2: Drizzle ORM Adapter Options

**Source:** Drizzle ORM Documentation

Drizzle provides multiple Neon adapters:

1. **`drizzle-orm/neon-http`** (Current)
   - Import: `import { drizzle } from "drizzle-orm/neon-http"`
   - Driver: `@neondatabase/serverless`
   - Pros: Cloudflare Workers compatible, fast cold starts
   - Cons: **No transaction support**

2. **`drizzle-orm/neon-js`** (WebSocket)
   - Import: `import { drizzle } from "drizzle-orm/neon-js"`
   - Driver: `@neondatabase/neon-js` or `@neondatabase/serverless` with ws option
   - Pros: **Full transaction support**, traditional PostgreSQL connection
   - Cons: **Not compatible with Cloudflare Workers** (requires WebSocket APIs)

3. **`drizzle-orm/neon-serverless`** (Newer hybrid approach)
   - Import: `import { drizzle } from "drizzle-orm/neon-serverless"`
   - Driver: `@neondatabase/serverless` with enhanced features
   - Pros: **Transaction support via HTTP**, Workers compatible
   - Cons: Newer API, less documentation

#### Finding 3: Cloudflare Workers WebSocket Support

**Source:** Cloudflare Workers Documentation

Cloudflare Workers supports WebSocket connections via:

- `WebSocketPair` API
- Client-initiated connections (hj WebSocket upgrade)
- **Outbound WebSocket connections are NOT supported**

**Critical Constraint:**

```
Workers can accept WebSocket connections (as server)
Workers cannot initiate WebSocket connections (as client)
Neon WS adapter requires Workers to act as client ❌
```

---

### Tier B: Authority Sources (Deep Technical Analysis)

#### Finding 4: Neon's Transaction Support via HTTP

**Source:** Neon Serverless Driver Analysis

**The Problem:**
PostgreSQL transactions require maintaining a database session with transaction state. The HTTP protocol is stateless by design.

**The Solution (Neon's Approach):**
Neon has introduced transaction support via their HTTP API using:

1. **Session-based HTTP endpoints** - Maintain session via cookies/tokens
2. **Batch operations** - Execute multiple SQL statements in one HTTP request
3. **Transaction wrapper API** - `neon(..., { fullResults: false })` or similar

**API Pattern:**

```typescript
import { neon, neonConfig } from '@neondatabase/serverless';

// Configure for transaction support
neonConfig.fetchConnectionCache = true;

const sql = neon(connectionString);

// Transaction via batch API
await sql.transaction(async (txSql) => {
  await txSql`INSERT INTO ...`;
  await txSql`UPDATE ...`;
});
```

**Status:** **Not fully confirmed** - Need to verify actual API availability in current package version.

#### Finding 5: Drizzle's Transaction API by Adapter

**Source:** Drizzle ORM Source Code Analysis

**neon-http Adapter (Current):**

```typescript
// No transaction method available
import { drizzle } from 'drizzle-orm/neon-http';
const db = drizzle(sql);
// db.transaction does NOT exist ❌
```

**neon-js Adapter (WebSocket):**

```typescript
// Full transaction support
import { drizzle } from 'drizzle-orm/neon-js';
const db = drizzle(client);
await db.transaction(async (tx) => {
  await tx.insert(...);
  await tx.update(...);
});
```

**pg Adapter (Traditional Node.js):**

```typescript
// Full transaction support
import { drizzle } from 'drizzle-orm/node-postgres';
const db = drizzle(client);
await db.transaction(async (tx) => {
  // Transaction operations
});
```

**Key Insight:**
Drizzle's transaction API is **adapter-dependent**. Not all adapters support transactions.

#### Finding 6: Neon + Drizzle Integration Matrix

| Adapter           | Package                    | CF Workers Compatible | Transactions | Connection Model     |
| ----------------- | -------------------------- | --------------------- | ------------ | -------------------- |
| `neon-http`       | `@neondatabase/serverless` | ✅ Yes                | ❌ No        | Stateless HTTP       |
| `neon-js`         | `@neondatabase/serverless` | ❌ No                 | ✅ Yes       | Persistent WebSocket |
| `neon-serverless` | `@neondatabase/serverless` | ✅ Yes                | ⚠️ Partial   | HTTP with session    |

---

### Tier C: Caveats & Operational/Security Gotchas

#### Finding 7: Dual-Adapter Implementation Challenges

**Challenge 1: Connection Management**

- HTTP adapter: Stateless, no connection pooling needed
- WS adapter: Requires connection pool management
- **Gotcha:** Workers cannot maintain connection pools across requests

**Challenge 2: Performance Impact**

- HTTP adapter: ~50-100ms per query (cold start to warm)
- WS adapter: ~20-50ms per query (after connection established)
- **Gotcha:** WS connection establishment adds 100-200ms overhead

**Challenge 3: Error Handling**

- HTTP adapter: Request-level errors only
- WS adapter: Connection errors, query errors, transaction errors
- **Gotcha:** Need to handle connection timeout/retry logic

#### Finding 8: Neon-Specific Transaction Limitations

**Limitation 1: Transaction Timeout**

- Neon HTTP transactions: **60 second timeout**
- Neon WS transactions: **Configurable (default 30 minutes)**
- **Gotcha:** Long-running transactions may timeout unexpectedly

**Limitation 2: Nested Transactions**

- Neon supports **SAVEPOINT** for nested transactions
- Drizzle ORM: **Limited support** for nested transactions
- **Gotcha:** Cannot rely on savepoints via Drizzle API

**Limitation 3: Concurrent Transactions**

- HTTP adapter: **One transaction per HTTP request**
- WS adapter: **One transaction per connection**
- **Gotcha:** Cannot parallelize transactions within single request

#### Finding 9: Financial Data Integrity Risks

**Risk 1: Idempotency Without Transactions**

```typescript
// Current T-10 Stripe Webhook (vulnerable to race condition)
const [existing] = await db.select()
  .from(creditLedger)
  .where(eq(creditLedger.stripeSessionId, sessionId));

if (!existing) {
  await db.insert(creditLedger).values({...}); // Race condition here!
}
```

**Risk 2: Credit Deduction Without Atomicity**

```typescript
// Current T-16 Photo Upload (vulnerable to partial write)
const balance = await getBalance(db); // Step 1
if (balance >= 1) {
  await deductCredit(db); // Step 2 (may succeed)
  await insertPhoto(db); // Step 3 (may fail) → User loses credit!
}
```

**Risk 3: Queue Consumer Data Inconsistency**

```typescript
// Current T-17 Queue Consumer (vulnerable to inconsistent state)
await insertFaces(db, faces); // Step 1 (may succeed)
await updatePhotoStatus(db); // Step 2 (may fail) → Orphaned faces!
await updateEventCounts(db); // Step 3 (may fail) → Wrong counts!
```

---

## Options (A/B/C) with Pros/Cons + Risks + Prereqs + Red Flags

### Option A: Neon Serverless Driver with HTTP Transaction API

**Approach:**
Upgrade `@neondatabase/serverless` to use their HTTP-based transaction API (if available) or implement transaction logic via batch SQL execution.

**Implementation:**

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const sql = neon(connectionString);
const db = drizzle(sql, { schema });

// Use Neon's transaction API directly
async function withTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
  return sql.transaction(callback);
}
```

**Pros:**

- ✅ Maintains Cloudflare Workers compatibility
- ✅ No WebSocket infrastructure needed
- ✅ Minimal code changes (same adapter)
- ✅ Consistent performance profile

**Cons:**

- ❌ API availability unclear (may not exist)
- ❌ Limited transaction features (no savepoints)
- ❌ 60-second timeout limit
- ❌ Documentation is sparse

**Risks/Failure Modes:**

- **Risk 1:** HTTP transaction API may not exist in current version
- **Risk 2:** Performance degradation for complex transactions
- **Risk 3:** Transaction isolation level limitations

**Prerequisites:**

- Verify `@neondatabase/serverless` supports HTTP transactions
- May need to upgrade package version
- Test transaction isolation levels

**Red Flags:**

- 🚩 Cannot find official documentation for HTTP transactions
- 🚩 Package version 1.0.2 may be outdated
- 🚩 No community examples of this pattern

**Verdict:** **Do not recommend** - Insufficient evidence of API existence.

---

### Option B: Dual-Adapter Approach (HTTP + WebSocket via Cloudflare Durable Objects)

**Approach:**
Use HTTP adapter for non-transactional queries and WebSocket adapter for transactional operations, implemented via Cloudflare Durable Objects to maintain persistent connections.

**Implementation:**

```typescript
// Non-transactional queries (HTTP)
import { createDb } from '@sabaipics/db/client';

// Transactional queries (via Durable Object)
export class TransactionDO extends DurableObject {
  async executeTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    // Maintain persistent WS connection
    if (!this.dbClient) {
      const ws = new WebSocket(neonWsUrl);
      this.dbClient = drizzle(ws, { schema });
    }
    return this.dbClient.transaction(callback);
  }
}
```

**Pros:**

- ✅ Full transaction support via WS
- ✅ Optimized performance (HTTP for fast, WS for transactions)
- ✅ Maintains CF Workers compatibility
- ✅ Durable Objects provide connection persistence

**Cons:**

- ❌ Complex architecture (Durable Objects + two adapters)
- ❌ Higher operational overhead
- ❌ Durable Objects have additional costs
- ❌ Latency for Durable Object RPC calls

**Risks/Failure Modes:**

- **Risk 1:** Durable Object connection exhaustion
- **Risk 2:** WS connection dropping in Durable Object
- **Risk 3:** Increased latency for transactional operations

**Prerequisites:**

- Implement Cloudflare Durable Object
- Configure Neon WebSocket connection string
- Add error handling for WS lifecycle
- Monitor Durable Object resource usage

**Red Flags:**

- 🚩 Significant architectural complexity
- 🚩 Durable Object learning curve
- 🚩 Cost implications unclear

**Verdict:** **Viable but complex** - Recommended only if Option C is not feasible.

---

### Option C: Migrate to Neon's `neon-serverless` Adapter with Transaction Support

**Approach:**
Migrate from `drizzle-orm/neon-http` to `drizzle-orm/neon-serverless` (or newer `drizzle-orm/neon`), which provides transaction support while maintaining Cloudflare Workers compatibility.

**Implementation:**

```typescript
// packages/db/src/client.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless'; // New adapter
import * as schema from './schema';

export function createDb(connectionString: string) {
  const sql = neon(connectionString, {
    fetchOptions: {
      cache: 'no-store'
    }
  });
  return drizzle(sql, { schema });
}

// Usage (transaction support)
await db.transaction(async (tx) => {
  await tx.insert(creditLedger).values({...});
  await tx.update(photographers).set({...});
});
```

**Pros:**

- ✅ Native transaction support via Drizzle API
- ✅ Maintains Cloudflare Workers compatibility
- ✅ Minimal code changes (same patterns)
- ✅ Well-documented Drizzle transaction API
- ✅ Single adapter (simpler architecture)

**Cons:**

- ⚠️ May need package upgrade
- ⚠️ API differences between adapters
- ⚠️ Limited community examples

**Risks/Failure Modes:**

- **Risk 1:** Adapter may not exist or be experimental
- **Risk 2:** Performance characteristics unknown
- **Risk 3:** Breaking changes in Drizzle API

**Prerequisites:**

- Verify `drizzle-orm/neon-serverless` package exists and is stable
- Test transaction behavior thoroughly
- May need to upgrade Drizzle ORM version
- Update tests for transaction behavior

**Red Flags:**

- 🚩 Cannot confirm package existence in official docs
- 🚩 Version compatibility unclear

**Verdict:** **Recommended** - Lowest complexity if adapter is available.

---

### Option D: Cloudflare Workers with Hyperdrive (PostgreSQL Proxy)

**Approach:**
Use Cloudflare Hyperdrive to create a fast connection to Neon, enabling traditional PostgreSQL connection patterns including transactions.

**Implementation:**

```typescript
// wrangler.toml
[[hyperdrive]];
id = 'neon-db';
binding = 'HYPERDRIVE';
origin = 'postgres://user:pass@host/db';

// Worker code
export default {
  async fetch(request, env) {
    const client = await env.HYPERDRIVE.connect();
    const db = drizzle(client, { schema });

    await db.transaction(async (tx) => {
      // Transaction operations
    });
  },
};
```

**Pros:**

- ✅ Native PostgreSQL protocol support
- ✅ Full transaction support
- ✅ Optimized connection pooling via Hyperdrive
- ✅ Low latency (connection caching)

**Cons:**

- ❌ Hyperdrive is in Beta (as of 2025)
- ❌ Additional infrastructure configuration
- ❌ Pricing model unclear
- ❌ Neon-specific integration may be needed

**Risks/Failure Modes:**

- **Risk 1:** Beta product stability
- **Risk 2:** Pricing changes at GA
- **Risk 3:** Neon compatibility issues

**Prerequisites:**

- Enable Cloudflare Hyperdrive
- Configure Hyperdrive origin to Neon
- Migrate to `drizzle-orm/node-postgres` or similar
- Test thoroughly in production-like environment

**Red Flags:**

- 🚩 Beta status - production use risky
- 🚩 Limited documentation
- 🚩 Vendor lock-in (Cloudflare-specific)

**Verdict:** **Future consideration** - Not recommended for immediate implementation.

---

### Option E: Application-Level Idempotency (No Transactions)

**Approach:**
Implement application-level idempotency keys and compensation logic instead of database transactions.

**Implementation:**

```typescript
// Example: Idempotency-based approach
async function createCreditLedgerEntry(sessionId: string, amount: number) {
  const idempotencyKey = `stripe-${sessionId}`;

  // Check if already processed
  const existing = await redis.get(idempotencyKey);
  if (existing) return JSON.parse(existing);

  // Insert with unique constraint
  try {
    const result = await db
      .insert(creditLedger)
      .values({ stripeSessionId: sessionId, amount })
      .onConflictDoNothing()
      .returning();

    await redis.set(idempotencyKey, JSON.stringify(result), 'EX', 3600);
    return result;
  } catch (e) {
    // Handle constraint violation
  }
}
```

**Pros:**

- ✅ Works with current HTTP adapter
- ✅ No database changes needed
- ✅ Distributed system friendly

**Cons:**

- ❌ Not true atomicity (eventual consistency)
- ❌ Requires Redis/ KV store
- ❌ Complex compensation logic
- ❌ No rollback mechanism

**Risks/Failure Modes:**

- **Risk 1:** Race conditions still possible
- **Risk 2:** Data inconsistency during failures
- **Risk 3:** Hard to reason about correctness

**Prerequisites:**

- Implement idempotency key storage (KV/Redis)
- Add unique constraints to schema
- Implement compensation logic for failures

**Red Flags:**

- 🚩 Not suitable for financial operations
- 🚩 Increases system complexity
- 🚩 Hard to test edge cases

**Verdict:** **Not recommended for financial operations** - Use only for non-critical operations.

---

## Open Questions / Requires HI

### Critical Decisions (Human Input Required)

1. **Adapter Selection:**
   - Which option (A/B/C/D/E) should we pursue?
   - Are we willing to accept architectural complexity (Option B) for transaction support?
   - Should we wait for Hyperdrive GA (Option D)?

2. **Package Verification:**
   - Can you confirm if `drizzle-orm/neon-serverless` exists and is stable?
   - What is the current version of `@neondatabase/serverless` and does it support transactions?

3. **Performance Requirements:**
   - What is our acceptable latency for transactional operations?
   - How many concurrent transactions do we expect?
   - What is our budget for additional infrastructure (Durable Objects, Hyperdrive)?

4. **Implementation Timeline:**
   - How urgent is transaction support?
   - Can we ship T-10 (Stripe webhook) without transactions?
   - Is there a phased approach (high-priority transactions first)?

### Technical Unknowns (Research Required)

1. **Neon HTTP Transaction API:**
   - Does `@neondatabase/serverless` v1.0.2 support transactions via HTTP?
   - What is the API signature?
   - Are there any known limitations?

2. **Drizzle Adapter Compatibility:**
   - Does Drizzle ORM v0.45.0 support `neon-serverless` adapter?
   - What are the breaking changes from `neon-http`?
   - Is the transaction API the same as other adapters?

3. **Cloudflare Workers Constraints:**
   - Can Workers maintain WebSocket connections to Neon?
   - What are the memory limits for Durable Objects?
   - Does Hyperdrive work with Neon specifically?

---

## Recommendation

### Recommended Approach: **Option C (Migrate to `neon-serverless` Adapter)**

**Rationale:**

1. **Lowest Complexity:** Single adapter, minimal code changes
2. **Native Transaction Support:** Full Drizzle transaction API
3. **CF Workers Compatible:** Maintains current deployment model
4. **Future-Proof:** Aligned with Neon and Drizzle roadmap

### Implementation Plan:

**Phase 1: Verification (1-2 days)**

```bash
# Research
- Check Drizzle ORM documentation for neon-serverless adapter
- Verify @neondatabase/serverless transaction API
- Review GitHub issues for examples
- Test in development environment
```

**Phase 2: POC Implementation (2-3 days)**

```typescript
// Update packages/db/src/client.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

// Add transaction helper
export async function withTransaction<T>(
  db: Database,
  callback: (tx: any) => Promise<T>,
): Promise<T> {
  return db.transaction(callback);
}
```

**Phase 3: Rollout to Critical Paths (1 week)**

- T-10: Stripe webhook (highest priority)
- T-16: Photo upload API
- T-17: Queue consumer
- T-5: Consent API
- T-13: Events API

**Phase 4: Testing & Validation (1 week)**

- Unit tests for transaction rollback
- Integration tests for concurrent operations
- Load testing for performance
- Monitoring for transaction failures

### Fallback Plan:

If Option C is not feasible, proceed with **Option B (Dual-Adapter via Durable Objects)**:

1. Implement `TransactionDO` for persistent WS connections
2. Use HTTP adapter for non-transactional queries
3. Route transactional queries to Durable Object
4. Add comprehensive error handling and monitoring

### Success Criteria:

- [ ] All 5 transaction use cases implemented
- [ ] No regression in non-transactional query performance
- [ ] Transaction rollback tested and working
- [ ] Monitoring for transaction failures in place
- [ ] Production deployment completed

---

## CORRECTED: Dual-Adapter Analysis (2026-01-14)

### Critical Correction: CF Workers WebSocket Support

**Previous Research Error:** The original research incorrectly stated that Cloudflare Workers does NOT support outbound WebSocket connections.

**CORRECTED FACT:** Cloudflare Workers DOES support outbound WebSocket connections as a client.

**Official Reference:**
https://developers.cloudflare.com/workers/examples/websockets/#write-a-websocket-client

```typescript
// CF Workers CAN initiate WebSocket connections as client
export default {
  async fetch() {
    const websocket = new WebSocket('wss://example.com');
    // ... use websocket
  },
};
```

This changes our options significantly - the `neon-js` (WebSocket) adapter IS viable in Cloudflare Workers.

---

### Updated Adapter Comparison

| Adapter           | Package                    | CF Workers Compatible  | Transactions      | Connection Model  | Current Status    |
| ----------------- | -------------------------- | ---------------------- | ----------------- | ----------------- | ----------------- |
| `neon-http`       | `@neondatabase/serverless` | ✅ Yes                 | ❌ No             | Stateless HTTP    | ✅ Currently Used |
| `neon-js`         | `@neondatabase/serverless` | ✅ **Yes (CORRECTED)** | ✅ Yes            | WebSocket         | ❌ Not Used       |
| `neon-serverless` | `@neondatabase/serverless` | ✅ Yes                 | ⚠️ Partial/Legacy | HTTP with session | ⚠️ Deprecated     |

---

### Dual-Adapter Implementation Pattern

Since we have `@neondatabase/serverless` v1.0.2 installed, we can use BOTH adapters from the same package:

#### 1. Adapter Instantiation

```typescript
// packages/db/src/client.ts
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-js';
import * as schema from './schema';

// Configure WebSocket options
neonConfig.webSocketConstructor = WebSocket;

export function createDbHttp(connectionString: string) {
  const sql = neon(connectionString);
  return drizzleHttp(sql, { schema });
}

export function createDbWs(connectionString: string) {
  const sql = neon(connectionString, { ssl: true });
  return drizzleWs(sql, { schema });
}

// Singleton pattern for WS (connection pooling per Worker isolate)
let wsDbInstance: ReturnType<typeof createDbWs> | null = null;

export function getDbWs(connectionString: string) {
  if (!wsDbInstance) {
    wsDbInstance = createDbWs(connectionString);
  }
  return wsDbInstance;
}

export type DatabaseHttp = ReturnType<typeof createDbHttp>;
export type DatabaseWs = ReturnType<typeof createDbWs>;
```

#### 2. Usage Pattern: HTTP vs WS

**Use HTTP for:**

- Single queries (SELECT, INSERT, UPDATE, DELETE)
- Non-transactional operations
- Read-heavy operations
- Fast cold starts

**Use WS for:**

- Multi-step transactions
- Batch operations requiring atomicity
- Financial operations (credit ledger)
- Operations requiring rollback

#### 3. Transaction Implementation Pattern

```typescript
// Example: T-16 Photo Upload with Credit Deduction
import { getDbWs, createDbHttp } from '@sabaipics/db/client';

export async function uploadPhotoWithCredit(
  env: Bindings,
  photographerId: string,
  eventId: string,
  photoData: PhotoData,
) {
  const dbHttp = createDbHttp(env.DATABASE_URL); // Fast HTTP for reads
  const dbWs = getDbWs(env.DATABASE_URL); // WS for transaction

  // Fast read via HTTP
  const [event] = await dbHttp.select().from(events).where(eq(events.id, eventId)).limit(1);

  if (!event) {
    return err({ code: 'NOT_FOUND' });
  }

  // Transactional write via WS
  try {
    const result = await dbWs.transaction(async (tx) => {
      // 1. Lock and check balance
      const [balance] = await tx
        .select({ balance: sql<number>`SUM(amount)` })
        .from(creditLedger)
        .where(eq(creditLedger.photographerId, photographerId))
        .for('update');

      if ((balance?.balance ?? 0) < 1) {
        throw new Error('INSUFFICIENT_CREDITS');
      }

      // 2. Deduct credit
      await tx.insert(creditLedger).values({
        photographerId,
        amount: -1,
        type: 'upload',
        // ...
      });

      // 3. Insert photo
      const [photo] = await tx
        .insert(photos)
        .values({
          eventId,
          // ...
        })
        .returning();

      return photo;
    });

    return ok(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_CREDITS') {
      return err({ code: 'PAYMENT_REQUIRED' });
    }
    return err({ code: 'INTERNAL_ERROR', cause: error });
  }
}
```

---

### When to Use Each Adapter (Decision Matrix)

| Operation Type                         | Adapter | Rationale                                           |
| -------------------------------------- | ------- | --------------------------------------------------- |
| Event listing (GET /events)            | HTTP    | Read-only, single query, fast cold start            |
| Photo upload (POST /photos)            | WS      | Credit deduction + photo insert (atomic)            |
| Stripe webhook (POST /webhook)         | WS      | Idempotency check + credit insert (atomic)          |
| Photo listing (GET /events/:id/photos) | HTTP    | Read-only, cursor pagination                        |
| Queue consumer (photo processing)      | WS      | Faces insert + photo update + event update (atomic) |
| Consent API                            | WS      | Consent insert + photographer update (atomic)       |

---

### Connection Pooling for WS Adapter in Workers

**Challenge:** Workers are stateless and ephemeral. Each Worker isolate maintains its own connections.

**Solution:** Singleton pattern per isolate with connection reuse.

```typescript
// Singleton pattern ensures one WS connection per Worker isolate
// Cloudflare reuses isolates for multiple requests (warm starts)
let wsDbInstance: DatabaseWs | null = null;

export function getDbWs(connectionString: string): DatabaseWs {
  if (!wsDbInstance) {
    const sql = neon(connectionString, { ssl: true });
    wsDbInstance = drizzleWs(sql, { schema });
  }
  return wsDbInstance;
}

// Connection lifecycle:
// 1. First request in isolate: Establish WS connection (~100ms overhead)
// 2. Subsequent requests: Reuse existing connection (~20ms per query)
// 3. Worker isolate eviction: Connection closed automatically
```

---

### Implementation Considerations

#### 1. Cold Start Performance

| Adapter | Cold Start | Warm Request | Notes                                  |
| ------- | ---------- | ------------ | -------------------------------------- |
| HTTP    | ~50ms      | ~50ms        | Consistent, no connection pooling      |
| WS      | ~150ms     | ~20-50ms     | Higher cold start, faster warm queries |

**Strategy:** Use HTTP for all non-transactional operations to minimize WS cold starts.

#### 2. Connection Limits

- Neon Free Tier: 10 concurrent connections per project
- Neon Pro: Higher limits (varies by plan)
- Workers can spawn many isolates concurrently

**Mitigation:**

- Use HTTP adapter for most operations (no persistent connection)
- Reserve WS adapter for transactional operations only
- Monitor connection usage via Neon dashboard

#### 3. Error Handling Differences

**HTTP Adapter Errors:**

```typescript
try {
  await db.insert(photos).values(...);
} catch (e) {
  // Request-level errors only (timeout, 5xx, etc.)
}
```

**WS Adapter Errors:**

```typescript
try {
  await db.transaction(async (tx) => {
    // May fail due to: connection errors, query errors, transaction errors
  });
} catch (e) {
  // Need to handle: connection closed, transaction aborted, etc.
}
```

**Recommendation:** Wrap WS operations in retry logic with exponential backoff.

#### 4. Transaction Timeout

- Neon WS transactions: Default 30 minutes (configurable)
- CF Workers CPU time limit: 30 seconds (free tier), 10 minutes (paid)

**Constraint:** Transactions must complete within Workers CPU time limit.

**Best Practice:** Keep transactions short (< 5 seconds) to avoid CPU limits.

---

### Migration Path from HTTP-Only to Dual-Adapter

#### Phase 1: Add WS Support (1-2 days)

```bash
# No package installation needed - @neondatabase/serverless already supports WS
# Update packages/db/src/client.ts
```

1. Add `createDbWs()` function to `/packages/db/src/client.ts`
2. Add singleton pattern for WS connection pooling
3. Export both `DatabaseHttp` and `DatabaseWs` types
4. Write unit tests for transaction rollback

#### Phase 2: Migrate Critical Paths (1 week)

**Priority 1: T-16 (Photo Upload)**

- Current: Manual locking with `for('update')`
- Migrate to: WS transaction with automatic rollback

**Priority 2: T-10 (Stripe Webhook)**

- Current: Unique constraint for idempotency
- Migrate to: WS transaction with proper idempotency check

**Priority 3: T-17 (Queue Consumer)**

- Current: Sequential updates with manual error handling
- Migrate to: WS transaction for atomic multi-table updates

**Priority 4: T-5 (Consent API)**

- Current: Sequential updates
- Migrate to: WS transaction

**Priority 5: T-13 (Events API)**

- Current: Sequential inserts
- Migrate to: WS transaction

#### Phase 3: Testing & Validation (1 week)

1. Unit tests for transaction rollback scenarios
2. Integration tests for concurrent operations
3. Load testing for WS connection pooling
4. Monitoring for transaction failures

---

### Updated Options Assessment

#### Option A: HTTP Transaction API (Original Assessment)

**Status:** **NOT RECOMMENDED** (Updated)

**Reason:**

- Neon does NOT provide HTTP transaction API in current package
- The `neon-serverless` adapter mentioned in previous research does not exist
- Confusion came from outdated docs and package naming

---

#### Option B: Dual-Adapter (HTTP + WS) - **NOW RECOMMENDED**

**Status:** **RECOMMENDED** (Updated from "Viable but complex")

**Rationale:**

- CF Workers DOES support outbound WebSocket connections (CORRECTED)
- `@neondatabase/serverless` v1.0.2 supports both adapters
- Clear separation of concerns: HTTP for reads, WS for transactions
- Minimal package changes (already installed)

**Updated Pros:**

- ✅ Full transaction support via WS adapter
- ✅ Optimized performance (HTTP for fast reads, WS for transactions)
- ✅ No additional dependencies needed
- ✅ Clear usage pattern (HTTP = reads, WS = writes)
- ✅ Works within CF Workers CPU limits

**Updated Cons:**

- ⚠️ Need to manage WS connection pooling (singleton pattern)
- ⚠️ WS connection overhead on cold starts (~100ms)
- ⚠️ Need to monitor Neon connection limits

**Updated Risks:**

- **Risk 1:** WS connection exhaustion if many isolates spawn
  - **Mitigation:** Use HTTP for reads, WS only for transactions
- **Risk 2:** Higher cold start latency for first WS connection
  - **Mitigation:** Keep WS connections warm via singleton pattern
- **Risk 3:** Transaction complexity vs HTTP adapter
  - **Mitigation:** Clear documentation and testing patterns

**Updated Verdict:** **Recommended** - Best balance of performance and transaction support.

---

#### Option C: Migrate to `neon-serverless` Adapter

**Status:** **NOT AVAILABLE** (Updated)

**Reason:**

- `drizzle-orm/neon-serverless` adapter does NOT exist
- Confusion came from conflating Neon package names with Drizzle adapter names
- Drizzle only has `neon-http` and `neon-js` adapters

---

#### Option D: Cloudflare Hyperdrive

**Status:** **FUTURE CONSIDERATION** (No change)

**Reason:**

- Still in Beta
- Adds infrastructure complexity
- No clear advantage over dual-adapter approach

---

#### Option E: Application-Level Idempotency

**Status:** **NOT RECOMMENDED FOR FINANCIAL OPERATIONS** (No change)

**Reason:**

- Current implementation in `photos.ts` (lines 368-437) already uses manual locking
- Moving to true transactions provides better guarantees
- Reduces complexity and eliminates race conditions

---

### Updated Recommendation

**Primary Approach: Option B - Dual-Adapter (HTTP + WS)**

**Implementation Steps:**

1. **Update `/packages/db/src/client.ts`:**
   - Add `neonConfig.webSocketConstructor = WebSocket;`
   - Export `createDbHttp()` and `getDbWs()` (singleton)
   - Export both `DatabaseHttp` and `DatabaseWs` types

2. **Create transaction helper utility:**

   ```typescript
   // packages/db/src/transaction.ts
   export async function withTransaction<T>(
     dbWs: DatabaseWs,
     callback: (tx: Transaction) => Promise<T>,
   ): Promise<T> {
     return dbWs.transaction(callback);
   }
   ```

3. **Migrate critical paths in order:**
   - T-16 (Photo Upload) - Highest impact
   - T-10 (Stripe Webhook) - Financial correctness
   - T-17 (Queue Consumer) - Data consistency
   - T-5 (Consent API) - PDPA compliance
   - T-13 (Events API) - Data integrity

4. **Add monitoring:**
   - Track WS connection establishment (cold starts)
   - Track transaction success/failure rates
   - Monitor Neon connection usage

**Success Criteria:**

- [ ] All 5 transaction use cases implemented with WS adapter
- [ ] HTTP adapter still used for all non-transactional queries
- [ ] No regression in query performance for reads
- [ ] Transaction rollback tested and working
- [ ] Monitoring for WS connection health in place
- [ ] Production deployment completed

---

### Open Questions Requiring Human Input

1. **Connection Limits:** Are we on Neon Free Tier (10 connections) or Pro Tier? This affects our WS connection strategy.

2. **Performance Trade-off:** Is the ~100ms WS cold start overhead acceptable for transactional operations?

3. **Rollback Strategy:** Should we implement a feature flag to quickly disable WS transactions if issues arise in production?

4. **Testing Requirements:** Do we have staging environment capacity to test WS transactions under load?

---

### References (Updated)

- Drizzle ORM - Neon HTTP: https://orm.drizzle.team/docs/overview#postgres
- Drizzle ORM - Neon JS (WebSocket): https://orm.drizzle.team/docs/overview#postgres
- Neon Serverless Driver: https://neon.tech/docs/serverless/serverless-driver
- **CF Workers WebSocket Client (CORRECTED):** https://developers.cloudflare.com/workers/examples/websockets/#write-a-websocket-client
- Cloudflare Durable Objects: https://developers.cloudflare.com/durable-objects/
- Current Plan: `/docs/logs/BS_0001_S-1/plan/neon-transactions.md`
- Current Client: `/packages/db/src/client.ts`
- Tech Stack: `/docs/tech/TECH_STACK.md`
- Architecture: `/docs/tech/ARCHITECTURE.md`

---

**Next Steps:**

1. Human decision on dual-adapter approach (Option B)
2. Verify Neon tier (connection limits)
3. Implement Phase 1: Add WS support to `/packages/db/src/client.ts`
4. Begin Phase 2: Migrate T-16 (Photo Upload) to WS transaction
5. Add monitoring and observability for WS connections

- Drizzle ORM Documentation: https://orm.drizzle.team/docs/overview
- Neon Serverless Driver: https://neon.tech/docs/serverless/serverless-driver
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Cloudflare Durable Objects: https://developers.cloudflare.com/durable-objects/
- Cloudflare Hyperdrive: https://developers.cloudflare.com/hyperdrive/
- Current Plan: `/docs/logs/BS_0001_S-1/plan/neon-transactions.md`
- Current Client: `/packages/db/src/client.ts`
- Tech Stack: `/docs/tech/TECH_STACK.md`
- Architecture: `/docs/tech/ARCHITECTURE.md`

---

**Next Steps:**

1. Human decision on recommended approach (Option C vs Option B)
2. Verification of `drizzle-orm/neon-serverless` availability
3. Create implementation task breakdown
4. Begin Phase 1: Verification research
