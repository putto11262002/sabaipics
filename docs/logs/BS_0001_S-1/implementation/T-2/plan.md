# T-2 Implementation Plan

**Task:** Implement requirePhotographer middleware
**Approved:** 2026-01-10

---

## Scope

Create two composable middlewares:

1. `requirePhotographer()` - Verifies Clerk auth + photographer exists in DB
2. `requireConsent()` - Verifies PDPA consent was given

## Design Decisions

| Decision             | Choice                                           | Rationale                                  |
| -------------------- | ------------------------------------------------ | ------------------------------------------ |
| Location             | `apps/api/src/middleware/`                       | Business logic, not generic auth           |
| Context data         | `{ id, pdpaConsentAt }`                          | Minimal footprint, covers 90% of use cases |
| Separate middlewares | Yes                                              | Single responsibility, composable          |
| Error codes          | 401 for no auth, 403 for no photographer/consent | Standard HTTP semantics                    |

## Files

| File                                              | Action               |
| ------------------------------------------------- | -------------------- |
| `apps/api/src/lib/db.ts`                          | CREATE - DB helper   |
| `apps/api/src/middleware/require-photographer.ts` | CREATE               |
| `apps/api/src/middleware/require-consent.ts`      | CREATE               |
| `apps/api/src/middleware/index.ts`                | CREATE - barrel      |
| `packages/auth/src/middleware.ts`                 | MODIFY - remove stub |

## Dependencies Added

- `drizzle-orm` to `apps/api` (for `eq` operator)
