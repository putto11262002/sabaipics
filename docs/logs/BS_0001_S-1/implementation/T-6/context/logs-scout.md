# Logs Scout: T-6 (Signup UI + PDPA Consent Modal)

**Root ID:** BS_0001_S-1
**Task:** T-6
**Date:** 2026-01-10

---

## Summary

Scanned implementation summaries from T-1, T-2, T-3, T-4, T-5, and T-8 to extract patterns and constraints relevant to the Signup UI + PDPA consent modal implementation.

---

## Established Patterns

### 1. Database Patterns (from T-1)

- **UUID type:** All IDs use native Postgres `uuid` type with `gen_random_uuid()`
- **Timestamps:** Use `timestamptz(name)` helper from `packages/db/src/schema/common.ts`
- **Type exports:** Tables export `<TableName>` (select) and `New<TableName>` (insert) types
- **Relevant table:** `photographers` has `pdpa_consent_at` column (null until consent given)
- **Relevant table:** `consent_records` for PDPA audit trail

### 2. Auth Middleware Chain (from T-2, T-3, T-4)

- **Middleware location:** `apps/api/src/middleware/` (not packages/auth)
- **`requirePhotographer()`** - Verifies Clerk auth + photographer exists in DB
  - Returns 401 if no valid Clerk session
  - Returns 403 if photographer not found in DB
  - Sets `PhotographerContext` in request: `{ id: string, pdpaConsentAt: string | null }`
- **`requireConsent()`** - Must run AFTER `requirePhotographer()`, checks `pdpaConsentAt` is not null
- **Route ordering matters:**
  - Webhooks: DB injection -> webhook routes (no CORS, no auth)
  - Admin: API key auth before Clerk auth
  - Public: Before Clerk auth (e.g., `GET /credit-packages`)
  - Authenticated: After Clerk auth

### 3. API Response Patterns (from T-3, T-5, T-8)

- **Success envelope:** `{ data: {...} }` or `{ data: [...] }`
- **Error envelope:** `{ error: { code: "ERROR_CODE", message: "Human readable" } }`
- **Status codes:**
  - 201 for creates
  - 401 for unauthenticated
  - 403 for unauthorized/not found photographer
  - 409 for already exists/conflict

### 4. PDPA Consent API (from T-5)

**Endpoint:** `POST /consent`
- Requires authenticated photographer (uses `requirePhotographer()`)
- Returns 409 if already consented (`pdpaConsentAt` already set)
- Returns 201 on success with consent record
- Response shape:
  ```typescript
  { data: { id: string, consentType: "pdpa", createdAt: string } }
  ```
- Error shape:
  ```typescript
  { error: { code: "ALREADY_CONSENTED", message: "PDPA consent already recorded" } }
  ```

### 5. Existing UI Patterns (from current codebase)

**File locations:**
- Routes: `apps/dashboard/src/routes/`
- Components: `apps/dashboard/src/components/`
- Auth components: `apps/dashboard/src/components/auth/`

**Auth package imports:**
- `import { SignUp, SignIn, SignedIn, SignedOut, useAuth } from "@sabaipics/auth/react"`

**Clerk component configuration:**
```tsx
<SignUp
  routing="path"
  path="/sign-up"
  signInUrl="/sign-in"
  afterSignUpUrl="/dashboard"  // <-- T-6 may need to intercept this
/>
```

**ProtectedRoute pattern:**
```tsx
// apps/dashboard/src/components/auth/ProtectedRoute.tsx
const { isLoaded, isSignedIn } = useAuth();
// Returns loading state, redirect to sign-in, or children
```

**Route structure:**
```tsx
// Public routes
<Route path="/sign-up/*" element={<SignUpPage />} />

// Protected routes
<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
  <Route path="/dashboard" element={<DashboardPage />} />
</Route>
```

---

## Known Limitations Accepted

1. **[T-5] No transaction wrapping** for consent insert + photographer update
   - Acceptable for MVP, both operations are idempotent-safe

2. **[T-4] Webhook stubs** - `handleUserUpdated` and `handleUserDeleted` are stubs
   - Not needed for T-6

---

## Follow-ups That May Impact T-6

1. **[T-5] PM_FOLLOWUP** - PDPA consent copy needs review before launch
   - T-6 will display this copy in the modal - use placeholder text for now
   - Final copy should be reviewed by PM before production

---

## Constraints for T-6 Implementation

### Must Do

1. **Use existing auth package imports** - `@sabaipics/auth/react` for Clerk components
2. **Call `POST /consent` API** - Do not directly manipulate database from frontend
3. **Handle 409 conflict** - User may refresh page after consenting; handle gracefully
4. **Use existing ProtectedRoute pattern** - Extend or wrap for consent check
5. **Match error envelope pattern** - Parse `{ error: { code, message } }` responses

### Should Do

1. **Intercept post-signup flow** - After Clerk signup, check consent before dashboard
2. **Store consent state in component** - Avoid unnecessary API calls
3. **Mobile-first styling** - Thai users primarily on mobile (per task risk notes)
4. **Session persistence** - Task specifies 24h session persistence across browser restarts

### Avoid

1. **Do not skip consent check** - PDPA compliance is legally required
2. **Do not auto-dismiss modal** - User must explicitly accept
3. **Do not use custom auth flow** - Use Clerk components as established

---

## Relevant Files

### API (for reference)
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/routes/consent.ts`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/middleware/require-photographer.ts`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/api/src/middleware/require-consent.ts`

### UI (to modify/extend)
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/dashboard/src/App.tsx`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/dashboard/src/routes/sign-up.tsx`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/apps/dashboard/src/components/auth/ProtectedRoute.tsx`

### Schema (for types)
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/photographers.ts`
- `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent2/packages/db/src/schema/consent-records.ts`

---

## Test Patterns to Follow

### From T-5 consent.test.ts
- Test auth middleware rejection (401, 403)
- Test happy path (201)
- Test idempotency/conflict (409)
- Use Hono's `testClient` for API tests

### UI Tests (per task requirements)
- E2E test signup flow (mock Clerk)
- Test PDPA modal blocking behavior
- Test on mobile browsers (Thai users)
