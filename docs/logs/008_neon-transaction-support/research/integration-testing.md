# Research: Integration Testing for Cloudflare Workers with Vitest and Miniflare

**Root ID:** 008  
**Task ID:** T-8 (Neon Transaction Support)  
**Topic:** integration-testing  
**Date:** 2026-01-14  
**Status:** Complete

---

## Executive Summary

**Decision Needed:** How should we write integration tests for the Neon transaction implementation in Cloudflare Workers?

**Key Findings:**

- The codebase already has `@cloudflare/vitest-pool-workers` configured for testing Workers runtime
- **Three-tier testing approach** already established: Unit tests (Node.js), Workers tests (workerd), Integration tests (Node.js with real services)
- **Database testing presents unique challenges**: Neon transactions require WebSocket connection, which may not work in workerd runtime
- **Recommended approach**: Hybrid testing strategy with mocked transactions for fast feedback + selective real-DB integration tests

**Critical Discovery**: The `@cloudflare/vitest-pool-workers` package provides a `cloudflare:test` module that gives access to Workers bindings (env, waitUntil) but **does not fully support outbound WebSocket connections** from the workerd runtime, which is required for Neon's transactional adapter.

---

## 1. Decision Frame

### Question

How can we write integration tests for the Neon transaction implementation (consent API with dual-adapter pattern) that verify end-to-end functionality while maintaining test speed and reliability?

### Constraints

**Requirements:**

- Verify transaction rollback behavior (both inserts succeed or both fail)
- Test the dual-adapter pattern (HTTP for reads, WebSocket for transactions)
- Ensure photographer authentication works end-to-end
- Validate PDPA consent idempotency

**Architecture Context:**

- Runtime: Cloudflare Workers (serverless)
- Database: Neon PostgreSQL with `drizzle-orm/neon-serverless` for transactions
- API: Hono framework with `testClient` for testing
- Testing: Vitest with `@cloudflare/vitest-pool-workers` v0.10.15

**Environment Constraints:**

- Workers CPU time limit: ~10-30ms (free), ~50s (paid)
- Neon serverless driver requires WebSocket for transactions
- Database URL must be accessible from test environment
- Test data must be isolated from production

---

## 2. Repo-First Grounding

### Existing Test Infrastructure

**File: `/apps/api/vitest.config.ts`**

```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.workers.test.ts'],
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.jsonc',
        },
        main: './src/durable-objects/rate-limiter.ts',
        isolatedStorage: true,
      },
    },
  },
});
```

**Key Observations:**

- Uses `@cloudflare/vitest-pool-workers` for workerd runtime
- Points to `wrangler.jsonc` for bindings configuration
- Includes isolated storage for DO state
- Only includes `*.workers.test.ts` files

**File: `/apps/api/vitest.integration.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.integration.ts'],
    include: ['tests/**/*.integration.ts'],
    environment: 'node',
  },
});
```

**Key Observations:**

- Standard Node.js environment for integration tests
- Loads `.dev.vars` for credentials
- Used for real AWS calls (not currently used for DB)

**File: `/apps/api/src/routes/consent.test.ts`**

```typescript
import { testClient } from 'hono/testing';
import { consentRouter } from './consent';

// Creates mock DB
function createMockDb(overrides = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    // ... mocked chain
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockConsentRecord]),
  };
}

// Test app with mocked dependencies
function createTestApp(options) {
  const app = new Hono()
    .use('/*', (c, next) => {
      c.set('db', () => mockDb);
      return next();
    })
    .route('/consent', consentRouter);

  return { app };
}
```

**Pattern Analysis:**

- Uses Hono's `testClient` for type-safe HTTP testing
- Mocks DB functions with vitest `vi.fn()`
- Tests request flow, not actual database operations
- **Does NOT test transaction behavior**

### Current Database Client Setup

**File: `/packages/db/src/client.ts`**

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzleServerless } from 'drizzle-orm/neon-serverless';

// HTTP adapter - for non-transactional queries
export function createDbHttp(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

// Serverless adapter - for transactional queries only
let serverlessDbCache: ReturnType<typeof drizzleServerless> | null = null;

export function createDbTx(connectionString: string) {
  if (serverlessDbCache) return serverlessDbCache;
  serverlessDbCache = drizzleServerless(connectionString, { schema });
  return serverlessDbCache;
}
```

**Testing Implications:**

- `createDbHttp()` uses HTTP - works in Node.js and workerd
- `createDbTx()` uses `drizzle-orm/neon-serverless` - **may require WebSocket**
- Singleton caching pattern could cause test pollution

---

## 3. Gap Analysis

### Must-Know (Blocking)

1. **Does `drizzle-orm/neon-serverless` require WebSocket?**
   - **Status**: Research confirms yes, it uses WebSocket under the hood for transaction support
   - **Impact**: WebSocket may not work in workerd runtime

2. **Can workerd runtime make outbound WebSocket connections?**
   - **Status**: Partially supported for Durable Objects, unclear for external services
   - **Impact**: May need Node.js environment for transaction tests

3. **How to handle test database isolation?**
   - **Status**: No test database setup exists
   - **Impact**: Need strategy for test data cleanup

4. **How to verify transaction rollback?**
   - **Status**: No existing patterns for testing transactions
   - **Impact**: Need to design test approach

### Nice-to-Know (Non-blocking)

1. Performance impact of real DB tests vs mocks
2. How to run migrations in test setup
3. Parallel test execution with shared DB
4. Connection pool behavior in tests

---

## 4. Tiered Evidence Gathering

### Tier A: Official Documentation

#### Cloudflare Workers Vitest Integration

**From Cloudflare docs (referenced in `log/006-testing-setup.md`):**

- `@cloudflare/vitest-pool-workers` provides `cloudflare:test` module
- `env` from `cloudflare:test` exposes bindings (R2, DO, Queue)
- Uses real workerd runtime via `workerd` package
- Supports `waitUntil`, `fetch`, and other Workers APIs

**Limitations:**

- Documentation focuses on DO/R2/Queue testing
- No explicit mention of database WebSocket testing
- AWS SDK CJS dependencies fail in workerd (known issue)

#### Hono Testing Documentation

**From Hono docs:**

- `testClient` provides type-safe request testing
- Works with standard fetch API
- Can test middleware and routes
- **Does not support Workers-specific bindings out of the box**

### Tier B: Authority Sources

#### Neon Serverless Driver Behavior

**From `@neondatabase/serverless` package analysis:**

- Version 1.0.2 uses WebSocket for transaction support
- HTTP adapter (stateless) - no transactions
- WebSocket adapter (stateful) - supports transactions
- Connection pooling handled internally

**Implication for Testing:**

```typescript
// This works in workerd (HTTP only)
const db = createDbHttp(connectionString);
const photos = await db.select().from(photos);

// This MAY NOT work in workerd (WebSocket required)
const dbTx = createDbTx(connectionString);
await dbTx.transaction(async (tx) => {
  // transaction operations
});
```

#### Drizzle ORM Transaction Testing

**From Drizzle community patterns:**

- Transaction tests typically use real database
- Mocking transactions is difficult and not recommended
- Common pattern: Use test database with transaction rollback after each test

**Example Pattern:**

```typescript
beforeEach(async () => {
  await db.transaction(async (tx) => {
    // Setup test data
  });
});

afterEach(async () => {
  // Rollback or cleanup
});
```

### Tier C: Operational & Security Considerations

#### Test Database Strategy

**Options:**

1. **Separate Test Database**
   - Create `neon_test` database
   - Run migrations before test suite
   - Truncate tables after each test
   - **Pros**: Isolated, safe
   - **Cons**: Slower, requires DB management

2. **Transaction Rollback Pattern**
   - Start transaction before each test
   - Rollback after test completes
   - **Pros**: Fast, automatic cleanup
   - **Cons**: Requires working transaction support (circular dependency)

3. **Mocked Transactions**
   - Mock `dbTx` function
   - Verify transaction was called
   - **Pros**: Fast, no DB needed
   - **Cons**: Doesn't verify actual transaction behavior

#### WebSocket Connections in workerd

**Research Findings:**

- workerd supports WebSocket for Durable Objects communication
- Outbound WebSocket to external services (like Neon) is **not well documented**
- AWS SDK fails in workerd due to CJS dependencies (similar pattern possible)

**Recommendation**: Use Node.js environment for transaction tests, workerd for DO/R2/Queue tests.

---

## 5. Option Synthesis

### Option A: Mocked Transaction Tests (Fast, Low Confidence)

**Description:** Continue using mocked DB functions, add verification that transaction was called.

**Approach:**

```typescript
function createMockDbTx() {
  const transactionSpy = vi.fn();
  return {
    transaction: transactionSpy.mockImplementation(async (callback) => {
      // Mock transaction context
      const tx = {
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockRecord]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      return callback(tx);
    }),
  };
}

it('wraps operations in transaction', async () => {
  const mockDbTx = createMockDbTx();
  const { app } = createTestApp({ mockDbTx });

  await client.consent.$post();

  expect(mockDbTx.transaction).toHaveBeenCalled();
});
```

**Pros:**

- Fast execution (no real DB)
- No external dependencies
- Works in workerd runtime
- Already established pattern

**Cons:**

- **Does NOT verify transaction atomicity**
- **Does NOT verify rollback behavior**
- False sense of security
- Doesn't catch DB schema mismatches

**Risks:**

- **HIGH**: Transaction bugs not caught until production
- **MEDIUM**: Mock may drift from actual implementation

**Prerequisites:**

- None - uses existing infrastructure

**Code Example:**

```typescript
// tests/consent.test.ts (existing pattern)
describe('POST /consent - Transaction', () => {
  it('calls dbTx.transaction with correct operations', async () => {
    const transactionSpy = vi.fn();
    const { app } = createTestApp({
      mockDbTx: { transaction: transactionSpy },
    });

    await client.consent.$post();

    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function), // callback
    );
  });
});
```

**Effort:** Low (1 day) - extend existing tests

---

### Option B: Real Database Tests with Test Database (Slow, High Confidence)

**Description:** Use real Neon test database for integration tests, run in Node.js environment.

**Approach:**

```typescript
// tests/setup.integration.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

let testDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  testDb = createDbHttp(connectionString);

  // Run migrations
  await migrate(testDb);
});

afterEach(async () => {
  // Clean up test data
  await testDb.delete(consentRecords);
  await testDb.delete(photographers);
});
```

**Test file:**

```typescript
// tests/consent.integration.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDbTx } from '@sabaipics/db';
import { consentRouter } from '../src/routes/consent';
import { testClient } from 'hono/testing';

describe('POST /consent - Integration', () => {
  let testDbTx: ReturnType<typeof createDbTx>;
  let testPhotographerId: string;

  beforeAll(async () => {
    testDbTx = createDbTx(process.env.TEST_DATABASE_URL);
    // Create test photographer
    const [photographer] = await testDbTx
      .insert(photographers)
      .values({ clerkId: 'test-clerk-123' })
      .returning();
    testPhotographerId = photographer.id;
  });

  it('inserts consent record and updates photographer atomically', async () => {
    const app = new Hono()
      .use((c, next) => {
        c.set('dbTx', () => testDbTx);
        c.set('photographer', { id: testPhotographerId, pdpaConsentAt: null });
        return next();
      })
      .route('/consent', consentRouter);

    const client = testClient(app);
    const res = await client.consent.$post();

    expect(res.status).toBe(201);

    // Verify both operations succeeded
    const [consent] = await testDbTx
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.photographerId, testPhotographerId));
    expect(consent).toBeDefined();

    const [photographer] = await testDbTx
      .select()
      .from(photographers)
      .where(eq(photographers.id, testPhotographerId));
    expect(photographer.pdpaConsentAt).not.toBeNull();
  });
});
```

**Pros:**

- **Verifies actual transaction behavior**
- Catches schema mismatches
- Tests real Neon driver behavior
- High confidence in production behavior

**Cons:**

- Slower execution (real DB I/O)
- Requires test database setup
- Requires test data cleanup
- Must run in Node.js (not workerd)

**Risks:**

- **LOW**: Tests reflect production behavior
- **MEDIUM**: Test database availability
- **LOW**: Data cleanup failures between tests

**Prerequisites:**

- Set up test database in Neon
- Add `TEST_DATABASE_URL` to `.dev.vars`
- Create migration runner for tests

**Effort:** Medium (2-3 days) - setup test DB + migration runner

---

### Option C: Hybrid Approach (Balanced)

**Description:** Use mocked transactions for fast feedback during development, run real DB tests in CI/nightly builds.

**Approach:**

```bash
# Development: Fast unit tests
pnpm test                    # Mocked tests only

# Pre-commit: Fast validation
pnpm test:run               # All unit tests

# CI: Full integration
pnpm test:ci                # Unit + integration tests

# Nightly: Full test suite
pnpm test:integration       # Real DB + AWS tests
```

**Config structure:**

```typescript
// vitest.config.ts - unit tests (mocked)
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});

// vitest.integration.config.ts - integration tests (real DB)
export default defineConfig({
  test: {
    include: ['tests/**/*.integration.ts'],
    environment: 'node',
    setupFiles: ['./tests/setup.integration.ts'],
  },
});
```

**File organization:**

```
apps/api/
├── src/
│   └── routes/
│       ├── consent.ts
│       └── consent.test.ts           # Mocked transaction tests
└── tests/
    ├── setup.integration.ts          # Test DB setup
    └── consent.integration.ts        # Real transaction tests
```

**Pros:**

- Fast feedback for development (mocked tests)
- High confidence for CI (integration tests)
- Gradual migration path
- Flexibility to adjust test ratio

**Cons:**

- More complex test setup
- Two types of tests to maintain
- Longer CI pipeline

**Risks:**

- **LOW**: Best of both worlds
- **MEDIUM**: Team must understand when to use which test

**Prerequisites:**

- Set up test database
- Document test writing guidelines
- Configure CI pipeline

**Effort:** Medium (2-3 days) - setup + documentation

---

### Option D: In-Memory SQLite with Transaction Simulation (Experimental)

**Description:** Use better-sqlite3 in tests with transaction simulation, avoiding Neon dependencies.

**Approach:**

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

let testDb: ReturnType<typeof drizzle>;

beforeEach(() => {
  const sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });

  // Push schema to in-memory DB
  migrate(testDb);
});

it("tests transaction behavior", async () => {
  // Use testDb which supports transactions
  await testDb.transaction(async (tx) => {
    await tx.insert(consentRecords).values({...});
    await tx.update(photographers).set({...});
  });
});
```

**Pros:**

- Fast execution (in-memory)
- Supports real transactions
- No external dependencies
- Works in workerd

**Cons:**

- **Does NOT test Neon-specific behavior**
- SQLite != PostgreSQL (different SQL dialect)
- Schema mismatch risk
- Doesn't catch Neon driver bugs

**Risks:**

- **HIGH**: SQLite behavior differs from PostgreSQL
- **MEDIUM**: False confidence from passing tests

**Prerequisites:**

- Add `better-sqlite3` and `drizzle-orm/better-sqlite3`
- SQLite-compatible schema migrations

**Effort:** High (3-4 days) - adapter setup + schema migration

**Red Flag**: Drizzle SQLite adapter has different query builder behavior than PostgreSQL. High risk of test/production mismatch.

---

## 6. Comparison Matrix

| Aspect                          | Option A: Mocked | Option B: Real DB     | Option C: Hybrid | Option D: SQLite |
| ------------------------------- | ---------------- | --------------------- | ---------------- | ---------------- |
| **Execution Speed**             | Fast (~100ms)    | Slow (~2-5s per test) | Mixed            | Fast (~200ms)    |
| **Confidence Level**            | Low              | High                  | Medium-High      | Low-Medium       |
| **Workers Compatible**          | YES              | NO\*                  | Mixed            | YES              |
| **Tests Transaction Atomicity** | NO               | YES                   | Partially        | YES (but SQLite) |
| **Infrastructure Setup**        | None             | Test DB required      | Test DB required | None             |
| **Maintenance Effort**          | Low              | Medium                | Medium           | High             |
| **Implementation Time**         | 1 day            | 2-3 days              | 2-3 days         | 3-4 days         |
| **Risk Level**                  | HIGH             | LOW                   | LOW-MEDIUM       | HIGH             |

\*Real DB tests require Node.js environment, not workerd

---

## 7. Recommendation

### Primary Recommendation: Option C (Hybrid Approach)

**Rationale:**

1. **Balances speed and confidence**: Mocked tests for fast development feedback, real DB tests for CI validation
2. **Proven pattern**: Already used for AWS integration tests (see `log/006-testing-setup.md`)
3. **Incremental adoption**: Can start with mocked tests, add integration tests gradually
4. **CI-friendly**: Run fast tests on every push, slow integration tests on merge to main
5. **Future-flex**: Can adjust ratio based on team needs

**Implementation Priority:**

**Phase 1: Foundation (This Week)**

1. Create test database in Neon (branch from production DB)
2. Add `TEST_DATABASE_URL` to `.dev.vars` (and GitHub secrets)
3. Create `tests/setup.integration.ts` with DB connection and cleanup
4. Write first integration test for consent API

**Phase 2: Migration (Next Week)** 5. Add integration tests for all transactional endpoints:

- `POST /consent` (T-5)
- `POST /webhooks/stripe` (T-10)
- `POST /photos` (T-16)

6. Update CI pipeline to run integration tests

**Phase 3: Documentation (Following Week)** 7. Document testing guidelines in `.claude/rules/testing.md` 8. Add examples to test suite 9. Team training on when to write which type of test

### Alternative: Start with Option A, Add Option B Later

If time pressure is high:

1. Implement Option A (mocked tests) this week
2. Verify transaction code manually via `wrangler dev`
3. Add Option B (real DB tests) in next sprint

**Risk**: Transaction bugs may reach production. Only acceptable if manual testing is thorough.

---

## 8. Open Questions

### For Human Decision

1. **Test Database Provisioning:**
   - Should we create a separate Neon project for testing?
   - Or use a separate database within the same project?
   - **Recommendation**: Separate database in same project (cheaper, easier management)

2. **Test Data Strategy:**
   - Should we use transaction rollback for cleanup (requires working tx)?
   - Or truncate tables after each test?
   - **Recommendation**: Truncate tables (simpler, works with HTTP adapter)

3. **CI Pipeline Configuration:**
   - Should integration tests run on every PR?
   - Or only on merge to main?
   - **Recommendation**: Run on every PR for main branch, skip for feature branches

4. **Parallel Test Execution:**
   - Can tests run in parallel against shared test DB?
   - Or should they be sequential?
   - **Recommendation**: Sequential initially, parallelize with unique photographer IDs if needed

### Technical (Can Research Further)

1. Neon's free tier database limits for testing
2. Connection pool behavior with concurrent tests
3. Migration rollback strategy for test schema changes
4. Performance impact of truncating vs. dropping tables

---

## 9. Example Implementation

### File: `tests/setup.integration.ts`

```typescript
/**
 * Integration test setup for real database tests
 */

import { beforeAll, afterEach, afterAll } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@sabaipics/db/schema';
import { sql } from 'drizzle-orm';

let testDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  const connectionString = process.env.TEST_DATABASE_URL;

  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL not set');
  }

  testDb = drizzle(neon(connectionString), { schema });

  // Verify connection
  await testDb.execute(sql`SELECT 1`);
  console.log('Test database connected');
});

afterEach(async () => {
  // Clean up test data after each test
  // Delete in correct order due to foreign keys
  await testDb.execute(sql`DELETE FROM consent_records WHERE photographer_id LIKE 'test-%'`);
  await testDb.execute(sql`DELETE FROM photographers WHERE clerk_id LIKE 'test-%'`);
});

afterAll(async () => {
  // Close connection if needed (HTTP adapter is stateless)
  console.log('Test database cleanup complete');
});

export { testDb };
```

### File: `tests/consent.integration.ts`

```typescript
/**
 * Consent API Integration Tests
 *
 * Tests real database transactions with Neon
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDbTx } from '@sabaipics/db';
import { consentRouter } from '../src/routes/consent';
import { photographers, consentRecords } from '@sabaipics/db/schema';
import { testClient } from 'hono/testing';
import { eq } from 'drizzle-orm';
import type { PhotographerVariables } from '../src/middleware';

describe('POST /consent - Integration', () => {
  let testDbTx: ReturnType<typeof createDbTx>;
  let testPhotographerId: string;
  let testClerkId: string;

  beforeEach(async () => {
    testDbTx = createDbTx(process.env.TEST_DATABASE_URL!);

    // Create test photographer
    testClerkId = `test-clerk-${Date.now()}`;
    const [photographer] = await testDbTx
      .insert(photographers)
      .values({
        clerkId: testClerkId,
        pdpaConsentAt: null,
      })
      .returning();

    testPhotographerId = photographer.id;
  });

  it('creates consent record and updates photographer atomically', async () => {
    type Env = {
      Bindings: Record<string, unknown>;
      Variables: PhotographerVariables;
    };

    const app = new Hono<Env>()
      .use((c, next) => {
        c.set('dbTx', () => testDbTx);
        c.set('photographer', {
          id: testPhotographerId,
          pdpaConsentAt: null,
        });
        c.set('auth', {
          userId: testClerkId,
          sessionId: `test-session-${Date.now()}`,
        });
        return next();
      })
      .route('/consent', consentRouter);

    const client = testClient(app);
    const res = await client.consent.$post();

    // Verify response
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeDefined();
    expect(body.data.consentType).toBe('pdpa');

    // Verify consent record was created
    const [consent] = await testDbTx
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.photographerId, testPhotographerId));

    expect(consent).toBeDefined();
    expect(consent.consentType).toBe('pdpa');
    expect(consent.ipAddress).toBeNull(); // No CF-Connecting-IP header in test

    // Verify photographer was updated
    const [photographer] = await testDbTx
      .select()
      .from(photographers)
      .where(eq(photographers.id, testPhotographerId));

    expect(photographer.pdpaConsentAt).not.toBeNull();
  });

  it('rolls back both operations on error', async () => {
    // This test would require triggering an error mid-transaction
    // Implementation depends on how we can force a transaction failure
    // Possible approach: Use invalid data that violates a constraint
    // TODO: Implement once we have a scenario that causes transaction failure
  });
});
```

### Update: `vitest.integration.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import { readFileSync, existsSync } from 'fs';

// Load .dev.vars for integration tests
function loadDevVars() {
  const devVarsPath = './.dev.vars';
  if (existsSync(devVarsPath)) {
    const content = readFileSync(devVarsPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key] = valueParts.join('=');
        }
      }
    }
  }
}

loadDevVars();

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.integration.ts'],
    include: ['tests/**/*.integration.ts'],
    exclude: ['tests/setup.integration.ts'],
    environment: 'node',
    // Increase timeout for database operations
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
```

---

## 10. Required Packages

**Already Installed:**

```json
{
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.10.14",
    "vitest": "^3.2.0",
    "vite": "6"
  }
}
```

**No Additional Packages Needed:**

- `@sabaipics/db` already exports `createDbTx`
- Hono already has `testClient`
- Drizzle ORM already installed

**Optional (for test data generation):**

- `@faker-js/faker` - Generate realistic test data
- `nanoid` - Already installed, can use for unique IDs

---

## 11. Gotchas and Limitations

### WebSocket Connection in Tests

**Issue:** The `drizzle-orm/neon-serverless` package uses WebSocket for transaction support. WebSocket connections may not work reliably in the workerd runtime provided by `@cloudflare/vitest-pool-workers`.

**Workaround:** Run transaction integration tests in Node.js environment using `vitest.integration.config.ts`.

### Singleton Cache Pollution

**Issue:** The `createDbTx()` function uses a singleton pattern for connection caching. This can cause test pollution if tests share the same process.

**Solution:** Reset cache in test setup:

```typescript
beforeEach(() => {
  // Clear singleton cache
  const dbModule = await import('@sabaipics/db');
  // Reset internal cache if exposed, or use unique connection strings
});
```

### Foreign Key Constraints

**Issue:** Test cleanup via `DELETE` may fail due to foreign key constraints.

**Solution:** Delete in correct order:

```typescript
afterEach(async () => {
  // Delete child records first
  await testDb.execute(sql`DELETE FROM consent_records WHERE photographer_id LIKE 'test-%'`);
  // Then delete parent records
  await testDb.execute(sql`DELETE FROM photographers WHERE clerk_id LIKE 'test-%'`);
});
```

### Parallel Test Execution

**Issue:** Tests running in parallel may conflict if they use the same test data identifiers.

**Solution:** Use unique identifiers with timestamp:

```typescript
const testId = `test-${Date.now()}-${Math.random()}`;
```

### Timeouts

**Issue:** Database operations may be slower than in-memory operations, causing test timeouts.

**Solution:** Increase timeout in vitest config:

```typescript
export default defineConfig({
  test: {
    testTimeout: 10000, // 10 seconds
    hookTimeout: 10000,
  },
});
```

---

## 12. Next Steps

### Immediate (This Week)

1. **Create Test Database**

   ```bash
   # In Neon console, create new database: "sabaipics_test"
   # Add to .dev.vars: TEST_DATABASE_URL=postgresql://...
   ```

2. **Setup Test Infrastructure**

   ```bash
   # Create tests/setup.integration.ts
   # Update vitest.integration.config.ts
   ```

3. **Write First Integration Test**

   ```bash
   # Create tests/consent.integration.ts
   # Test: POST /consent creates both records atomically
   ```

4. **Run Manual Test**
   ```bash
   pnpm test:integration tests/consent.integration.ts
   ```

### Short-term (Next Week)

5. **Add Integration Tests for All Transactional Endpoints**
   - `POST /webhooks/stripe` (T-10)
   - `POST /photos` (T-16)
   - Queue consumer (T-17)
   - `POST /events` (T-13)

6. **Update CI Pipeline**
   - Add `test:integration` step to CI workflow
   - Run on merge to main (not every PR)

7. **Document Testing Guidelines**
   - Add to `.claude/rules/testing.md`
   - Include examples and best practices

### Long-term (Future)

8. **Optimize Test Performance**
   - Consider test database pooling
   - Parallelize test execution with unique data

9. **Add Test Reporting**
   - Coverage reports
   - Test timing metrics
   - Transaction success/failure tracking

10. **Monitor Test Database Usage**
    - Set up alerts for test DB limits
    - Implement automated cleanup

---

## 13. References

### Codebase Files

- `/apps/api/vitest.config.ts` - Workers pool configuration
- `/apps/api/vitest.integration.config.ts` - Integration test configuration
- `/apps/api/tests/stripe.integration.ts` - Example integration test
- `/apps/api/src/routes/consent.test.ts` - Example mocked test
- `/apps/api/src/routes/consent.ts` - Implementation under test
- `/packages/db/src/client.ts` - Database client setup
- `/log/006-testing-setup.md` - Testing infrastructure documentation
- `/docs/logs/008_neon-transaction-support/readme.md` - Transaction implementation docs

### External Documentation

- [Cloudflare Workers Vitest Integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Hono Testing Documentation](https://hono.dev/docs/testing)
- [Drizzle ORM Transactions](https://orm.drizzle.team/docs/transactions)
- [Neon Serverless Driver](https://neon.tech/docs/serverless/driver)
- [Vitest Configuration](https://vitest.dev/config/)

### Related Research

- `/docs/logs/BS_0001_S-1/research/neon-transactions-serverless.md` - Neon transaction research
- `/docs/logs/BS_0001_S-1/research/neon-adapters-transactions.md` - Adapter comparison

---

**End of Research Document**
