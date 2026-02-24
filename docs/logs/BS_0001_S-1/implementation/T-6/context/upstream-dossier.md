# Upstream Dossier: T-6

**Task:** Signup UI + PDPA consent modal
**Type:** feature
**StoryRefs:** US-1, US-2
**PrimarySurface:** UI

---

## Task Goal

Create photographer signup page with Clerk components and PDPA consent modal that blocks dashboard access until accepted.

---

## Acceptance Criteria (verbatim from tasks.md)

- `/photographer/signup` shows Clerk SignUp component
- After signup, PDPA modal appears (blocking)
- Accept calls `POST /consent`, then redirects to dashboard
- Decline shows explanation with retry option
- Session persists across browser restarts (24h)

---

## Tests (from tasks.md)

- E2E test signup flow (mock Clerk)
- Test PDPA modal blocking behavior

---

## Rollout/Risk

- Medium risk (auth UX)
- Test on mobile browsers (Thai users)

---

## Dependencies

| Task | Description                            | Status                   |
| ---- | -------------------------------------- | ------------------------ |
| T-4  | Clerk webhook handler for user.created | **Done**                 |
| T-5  | PDPA consent API                       | **Done** (PR #11 merged) |

---

## Load-Bearing References

| Path                                                    | Purpose                                  |
| ------------------------------------------------------- | ---------------------------------------- |
| `docs/logs/BS_0001_S-1/plan/final.md`                   | Execution plan with full flow spec       |
| `apps/api/src/routes/consent.ts`                        | PDPA consent API implementation          |
| `apps/api/src/routes/webhooks/clerk.ts`                 | Clerk webhook (creates photographer row) |
| `apps/dashboard/src/components/auth/ProtectedRoute.tsx` | Existing protected route pattern         |
| `apps/dashboard/src/lib/api.ts`                         | Authenticated API client hook            |

---

## Implied Contracts

### Endpoints

| Endpoint        | Method | Purpose             | Status          |
| --------------- | ------ | ------------------- | --------------- |
| `POST /consent` | POST   | Record PDPA consent | **Implemented** |

#### POST /consent Contract (from `apps/api/src/routes/consent.ts`):

**Request:**

- Requires `requirePhotographer()` middleware (authenticated Clerk user + photographer exists in DB)
- No request body required

**Responses:**

- `201 Created`: `{ data: { id, consentType, createdAt } }`
- `409 Conflict`: `{ error: { code: "ALREADY_CONSENTED", message: "PDPA consent already recorded" } }`
- `401/403`: From auth middleware (not authenticated or photographer not found)

### Database

| Table             | Relevant Columns             | Notes                                         |
| ----------------- | ---------------------------- | --------------------------------------------- |
| `photographers`   | `pdpaConsentAt: timestamptz` | NULL = not consented, set after POST /consent |
| `consent_records` | `consentType: 'pdpa'`        | Audit record with IP address                  |

### UI Flow (from plan Phase 1)

```
1. User visits /photographer/signup
2. Clicks Google/LINE/email
3. Clerk handles OAuth/email
4. If LINE doesn't provide email -> Clerk prompts
5. Webhook: user.created -> create photographers row
6. UI: PDPA consent modal (blocking)
7. API: POST /consent records consent
8. UI: Redirect to dashboard
```

---

## Gaps, Decisions, and Validation Needs

### [GAP] Route Path Inconsistency

- Task specifies `/photographer/signup`
- Existing implementation uses `/sign-up`
- **Need to clarify**: Keep `/sign-up` or change to `/photographer/signup`?

### [GAP] PDPA Consent Copy

- `[PM_FOLLOWUP]` marked in plan: "PDPA consent copy"
- No PDPA text content provided
- **Need placeholder or actual content for modal**

### [GAP] How to detect new signup vs returning user

- Modal should appear "after signup" but how to detect:
  - Check `photographer.pdpaConsentAt === null`?
  - Query API on every protected route load?
- **Recommend**: ProtectedRoute should fetch photographer profile and check `pdpaConsentAt`

### [NEED_VALIDATION] Session 24h persistence

- Acceptance: "Session persists across browser restarts (24h)"
- This is Clerk configuration, not UI code
- Plan Decision #1: "Session timeout: 24 hours"
- **Validate**: Clerk is configured for 24h session in Clerk dashboard

### [NEED_DECISION] Where modal should appear

- Options:
  1. In signup flow (after Clerk auth, before redirect)
  2. In ProtectedRoute wrapper (blocks dashboard access)
  3. Dedicated `/consent` route
- Plan implies: Modal after signup, blocking dashboard
- **Recommend**: ProtectedRoute wrapper checks consent status

### [NEED_DECISION] Decline behavior

- "Decline shows explanation with retry option"
- What happens after decline + retry?
- Can user navigate away? Sign out?
- **Recommend**: Stay on consent modal, cannot access dashboard until accepted

---

## Existing Patterns to Follow

### File Locations

- Routes: `apps/dashboard/src/routes/`
- Components: `apps/dashboard/src/components/`
- Auth components: `apps/dashboard/src/components/auth/`

### UI Components Available

- `@sabaipics/ui/components/card`
- `@sabaipics/ui/components/button`
- `@sabaipics/ui/components/alert`
- Clerk components from `@sabaipics/auth/react`: `SignUp`, `SignedIn`, `SignedOut`, `useAuth`, `useUser`

### API Client Pattern

```typescript
import { useApiClient } from '../../lib/api';
const { getToken } = useApiClient();
const token = await getToken();
// Use fetch or hono client with Authorization header
```

---

## Scope

| In Scope                        | Out of Scope             |
| ------------------------------- | ------------------------ |
| Signup page with Clerk SignUp   | Admin UI                 |
| PDPA consent modal              | Credit purchase UI       |
| POST /consent integration       | Dashboard data display   |
| Redirect to dashboard on accept | Other dashboard features |
| Decline explanation + retry     |                          |
| Mobile browser compatibility    |                          |

---

## Implementation Notes

1. **shadcn Dialog component** may be needed for modal - use `pnpm --filter=@sabaipics/ui ui:add dialog`

2. **Query consent status** - likely need API endpoint or piggyback on existing `/auth/profile` to return `pdpaConsentAt`

3. **ProtectedRoute enhancement** - modify to check consent status and render modal if not consented

4. **Thai market focus** - ensure Thai language support consideration, mobile-first testing
