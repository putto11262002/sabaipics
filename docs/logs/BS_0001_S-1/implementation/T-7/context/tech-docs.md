# Tech Docs Context for T-7 (Dashboard API)

**Task:** T-7 - Dashboard API  
**Root:** BS_0001_S-1  
**Generated:** 2026-01-10

---

## Task Specification (from tasks.md)

```
### T-7 - Dashboard API
- [ ] Done
- **Type:** `feature`
- **StoryRefs:** US-3
- **Goal:** Create `GET /dashboard` endpoint returning credit balance, events list, and stats.
- **PrimarySurface:** `API`
- **Scope:** `apps/api/src/routes/dashboard.ts`
- **Dependencies:** `T-1`, `T-2`
- **Acceptance:**
  - Returns `{ credits: { balance, nearestExpiry }, events: [...], stats: {...} }`
  - Balance uses FIFO unexpired sum query
  - Events sorted by createdAt desc
  - Stats include totalPhotos, totalFaces
- **Tests:**
  - Unit test balance calculation with expiry
  - Test empty state (new user)
- **Rollout/Risk:**
  - Low risk
```

---

## API Conventions

### Framework & Stack
- **Framework:** Hono ^4.10.7 on Cloudflare Workers
- **Validation:** Zod ^4.1.13 with `@hono/zod-validator`
- **ORM:** Drizzle ORM ^0.45.0 with Neon Postgres
- **Auth:** Clerk via `@sabaipics/auth`

### Response Format

**Success responses:**
```typescript
// Single entity or aggregate
c.json({ data: result });
c.json({ data: result }, 201);

// Lists (paginated or not)
c.json({ data: items });
```

**Error responses:**
```typescript
// Standard error shape
{
  error: {
    code: "ERROR_CODE",
    message: "Human readable message",
    details?: ZodIssue[]  // Optional, for validation errors
  }
}
```

**Error code patterns:**
| Code | HTTP Status | Usage |
|------|-------------|-------|
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Photographer not found in DB |
| `VALIDATION_ERROR` | 400 | Zod validation failure |
| `NOT_FOUND` | 404 | Resource not found |
| `ALREADY_CONSENTED` | 409 | Idempotency check failure |

### Routing Pattern

Routes are defined as separate Hono instances, then mounted in `index.ts`:

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/dashboard.ts` (new file)

```typescript
import { Hono } from "hono";
import type { Bindings } from "../types";
import { requirePhotographer, type PhotographerVariables } from "../middleware";

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

export const dashboardRouter = new Hono<Env>()
  .get("/", requirePhotographer(), async (c) => {
    // Implementation here
  });
```

**Mount in index.ts:**
```typescript
.route("/dashboard", dashboardRouter)
```

### Type Definitions

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/types.ts`

```typescript
import type { AuthVariables } from "@sabaipics/auth/types";
import type { Database } from "@sabaipics/db";

export type Bindings = CloudflareBindings & {
  ADMIN_API_KEY: string;
};

export type Variables = AuthVariables & {
  db: () => Database;
};

export type Env = { Bindings: Bindings; Variables: Variables };
```

---

## Authentication & Authorization

### Middleware Stack

1. **Clerk Auth** (`createClerkAuth()`) - Applied globally via `index.ts`
2. **requirePhotographer()** - Route-level middleware for photographer-only routes

**Pattern:**
```typescript
import { requirePhotographer, type PhotographerVariables } from "../middleware";

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};

export const router = new Hono<Env>()
  .get("/", requirePhotographer(), async (c) => {
    const photographer = c.var.photographer;  // { id, pdpaConsentAt }
    const db = c.var.db();
    // ...
  });
```

### Middleware Location
- **File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/middleware/require-photographer.ts`

### Photographer Context
```typescript
export type PhotographerContext = Pick<Photographer, "id" | "pdpaConsentAt">;
```

---

## Database Schema (Relevant Tables)

### photographers
```typescript
// File: packages/db/src/schema/photographers.ts
{
  id: uuid,
  clerkId: text,
  email: text,
  name: text | null,
  pdpaConsentAt: timestamptz | null,
  createdAt: timestamptz
}
```

### credit_ledger
```typescript
// File: packages/db/src/schema/credit-ledger.ts
{
  id: uuid,
  photographerId: uuid,
  amount: integer,          // Positive for purchase, negative for deduction
  type: "purchase" | "upload",
  stripeSessionId: text | null,
  expiresAt: timestamptz,
  createdAt: timestamptz
}
```

**Balance Query (FIFO unexpired):**
```sql
SELECT SUM(amount)
FROM credit_ledger
WHERE photographer_id = ?
  AND expires_at > NOW()
```

**Nearest Expiry Query:**
```sql
SELECT expires_at
FROM credit_ledger
WHERE photographer_id = ?
  AND expires_at > NOW()
  AND amount > 0
ORDER BY expires_at ASC
LIMIT 1
```

### events
```typescript
// File: packages/db/src/schema/events.ts
{
  id: uuid,
  photographerId: uuid,
  name: text,
  startDate: timestamptz | null,
  endDate: timestamptz | null,
  accessCode: text,
  qrCodeR2Key: text | null,
  rekognitionCollectionId: text | null,
  expiresAt: timestamptz,
  createdAt: timestamptz
}
```

---

## Expected API Response

**Endpoint:** `GET /dashboard`

**Response shape (from plan/final.md):**
```typescript
{
  credits: {
    balance: number;
    nearestExpiry: string | null;  // ISO timestamp or null if no credits
  };
  events: Array<{
    id: string;
    name: string;
    photoCount: number;
    faceCount: number;
    createdAt: string;
  }>;
  stats: {
    totalPhotos: number;
    totalFaces: number;
  };
}
```

---

## Testing Conventions

### Test Configuration

**Unit tests (co-located with source):**
```typescript
// File: vitest.node.config.ts
include: ["src/**/*.test.ts"]
environment: "node"
```

**Workers runtime tests:**
```typescript
// File: vitest.config.ts
include: ["tests/**/*.workers.test.ts"]
```

### Test Pattern

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/dashboard.test.ts` (new file)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { dashboardRouter } from "./dashboard";
import type { Database } from "@sabaipics/db";
import type { PhotographerVariables } from "../middleware";

// Mock DB pattern
function createMockDb(overrides = {}) {
  const base = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    // ... other methods
  };
  return { ...base, ...overrides };
}

// Test app setup
function createTestApp(options: { mockDb?: any; photographer?: any; hasAuth?: boolean }) {
  const app = new Hono<Env>()
    .use("/*", (c, next) => {
      if (options.hasAuth) {
        c.set("auth", { userId: "clerk_123", sessionId: "session_123" });
      }
      return next();
    })
    .use("/*", (c, next) => {
      c.set("db", () => options.mockDb);
      return next();
    })
    .use("/*", (c, next) => {
      if (options.photographer) {
        c.set("photographer", options.photographer);
      }
      return next();
    })
    .route("/dashboard", dashboardRouter);

  return { app, mockDb: options.mockDb };
}

describe("GET /dashboard", () => {
  it("returns credit balance with FIFO expiry", async () => {
    // Test implementation
  });

  it("returns empty state for new user", async () => {
    // Test implementation
  });
});
```

### Test Commands

```bash
# Run unit tests
pnpm --filter=@sabaipics/api test

# Run specific test file
pnpm --filter=@sabaipics/api test src/routes/dashboard.test.ts
```

---

## Drizzle Query Patterns

**Basic select with conditions:**
```typescript
const [row] = await db
  .select({ id: table.id, name: table.name })
  .from(table)
  .where(eq(table.photographerId, photographerId))
  .limit(1);
```

**Aggregation (SUM):**
```typescript
import { sql, sum, gt } from "drizzle-orm";

const [result] = await db
  .select({ total: sum(creditLedger.amount) })
  .from(creditLedger)
  .where(
    and(
      eq(creditLedger.photographerId, photographerId),
      gt(creditLedger.expiresAt, sql`NOW()`)
    )
  );
```

**Ordering:**
```typescript
import { desc, asc } from "drizzle-orm";

const events = await db
  .select()
  .from(eventsTable)
  .where(eq(eventsTable.photographerId, photographerId))
  .orderBy(desc(eventsTable.createdAt));
```

**Multiple conditions:**
```typescript
import { and, eq, gt } from "drizzle-orm";

.where(
  and(
    eq(table.photographerId, photographerId),
    gt(table.expiresAt, sql`NOW()`)
  )
)
```

---

## File Locations Summary

| Purpose | Path |
|---------|------|
| New route file | `apps/api/src/routes/dashboard.ts` |
| New test file | `apps/api/src/routes/dashboard.test.ts` |
| Mount route | `apps/api/src/index.ts` |
| Middleware | `apps/api/src/middleware/require-photographer.ts` |
| DB schemas | `packages/db/src/schema/*.ts` |
| Type definitions | `apps/api/src/types.ts` |

---

## References

- Plan: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/plan/final.md`
- Tasks: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/logs/BS_0001_S-1/tasks.md`
- Architecture: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/tech/ARCHITECTURE.md`
- Tech Stack: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/docs/tech/TECH_STACK.md`
- Example route: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/consent.ts`
- Example test: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/consent.test.ts`
