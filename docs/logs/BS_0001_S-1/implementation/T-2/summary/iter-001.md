# Implementation Summary: T-2 requirePhotographer Middleware

**Task:** T-2 — Implement requirePhotographer middleware
**Root:** `BS_0001_S-1`
**Date:** 2026-01-10
**Iteration:** 1

---

## Overview

Implemented `requirePhotographer` and `requireConsent` middlewares in the API app for protecting routes that require authenticated photographers.

**Design Decision:** Middlewares live in `apps/api/` (not `packages/auth/`) because they're SabaiPics-specific business logic. The auth package remains reusable across projects.

---

## Files Created

| File                                              | Purpose                                           |
| ------------------------------------------------- | ------------------------------------------------- |
| `apps/api/src/lib/db.ts`                          | DB helper to get Drizzle client from Hono context |
| `apps/api/src/middleware/require-photographer.ts` | Middleware verifying auth + photographer exists   |
| `apps/api/src/middleware/require-consent.ts`      | Middleware verifying PDPA consent given           |
| `apps/api/src/middleware/index.ts`                | Barrel export                                     |

## Files Modified

| File                              | Change                                         |
| --------------------------------- | ---------------------------------------------- |
| `packages/auth/src/middleware.ts` | Removed placeholder `requirePhotographer` stub |
| `apps/api/package.json`           | Added `drizzle-orm` dependency                 |

---

## Key Components

### `getDb(c)` — `apps/api/src/lib/db.ts`

```typescript
export function getDb(c: { env: { DATABASE_URL: string } }) {
  return createDbClient(c.env.DATABASE_URL);
}
```

Use in any route/middleware to get a Drizzle DB instance.

### `requirePhotographer()` — `apps/api/src/middleware/require-photographer.ts`

Checks:

1. Valid Clerk auth exists (returns 401 if not)
2. Photographer record exists in DB by `clerkId` (returns 403 if not)

Sets minimal `PhotographerContext` in request:

```typescript
type PhotographerContext = {
  id: string; // For FK queries
  pdpaConsentAt: string | null; // For consent checks
};
```

### `requireConsent()` — `apps/api/src/middleware/require-consent.ts`

Must run AFTER `requirePhotographer()`. Checks `photographer.pdpaConsentAt` is not null. Returns 403 if consent not given.

---

## Exported Types

| Type                    | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `PhotographerContext`   | Minimal photographer data stored in context             |
| `PhotographerVariables` | `AuthVariables & { photographer: PhotographerContext }` |

---

## Usage Pattern

```typescript
import { requirePhotographer, requireConsent, PhotographerVariables } from './middleware';

// Consent endpoint - no consent check needed
app.post('/consent', requirePhotographer(), consentHandler);

// Protected routes - both required
app.use('/dashboard/*', requirePhotographer(), requireConsent());
app.use('/events/*', requirePhotographer(), requireConsent());
```

---

## Validation

- ✅ TypeScript build passes
- ✅ All 3 packages build successfully
