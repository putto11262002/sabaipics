# Logs Scout

Task: T-12 — Credit packages page UI
Root: BS_0001_S-1
Date: 2026-01-10

## Prior implementation summaries scanned

- `T-1/summary/iter-001.md` — Database schema (all domain tables)
- `T-1/summary/iter-002.md` — Database schema iteration 2 (PR review feedback)
- `T-2/summary/iter-001.md` — requirePhotographer middleware
- `T-5/summary/iter-001.md` — PDPA consent API
- `T-6/summary/iter-001.md` — Signup UI + PDPA consent modal
- `T-7/summary/iter-001.md` — Dashboard API
- `T-8/summary/iter-001.md` — Credit packages public API
- `T-9/summary/iter-001.md` — Stripe checkout API
- `T-10/summary/iter-001.md` — Stripe webhook handler
- `T-11/summary/iter-001.md` — Dashboard UI
- `T-14/summary/iter-001.md` — QR code generation library

## Key patterns found

### 1. UI Component Architecture (from T-6, T-11)

**shadcn Component Usage:**
- **Card grid**: Responsive grid with `md:grid-cols-2 lg:grid-cols-3` for displaying items
- **Empty state**: `Empty` component with icon, title, description, action button
- **Loading skeletons**: Match final card dimensions exactly
- **Container queries**: `@container/card` for responsive typography
- **Alert banners**: Use appropriate variants (destructive for warnings, default for info)

**Component Organization:**
- Feature-specific components in `apps/dashboard/src/components/<feature>/`
- Reusable UI primitives in `packages/ui/src/components/`
- Install shadcn components via CLI: `pnpm --filter=@sabaipics/ui ui:add <component>`

### 2. Data Fetching Patterns (from T-6, T-11)

**React Query Conventions:**
- Custom hooks in `apps/dashboard/src/hooks/<feature>/use<FeatureName>.ts`
- Query key naming: `["<feature>"]` (e.g., `["credit-packages"]`)
- Common config: `staleTime`, `refetchOnWindowFocus`
- Error handling with try-catch and Zod-like error shape

**API Client Pattern:**
```typescript
const apiClient = useApiClient();
const token = await apiClient.getToken();
const response = await fetch(`${apiClient.baseUrl}/endpoint`, {
  headers: { Authorization: `Bearer ${token}` }
});
```

### 3. Route Protection (from T-6)

**Auth + Consent Gates:**
- All dashboard routes wrapped with `ProtectedRoute` (Clerk auth)
- Most routes also wrapped with `ConsentGate` (PDPA consent)
- Exception: `/onboarding` route bypasses ConsentGate
- Pattern: `<ProtectedRoute><ConsentGate><YourComponent /></ConsentGate></ProtectedRoute>`

### 4. TypeScript Patterns (from T-1, T-2, T-8)

**Type Exports:**
- Database types: `<TableName>` (select), `New<TableName>` (insert)
- API response types: envelope format `{ data: T }`
- Enum types exported from schema files
- Type safety enforced via Zod validation on API routes

### 5. Build & Validation (from T-11)

**Standard Validation Commands:**
```bash
pnpm check-types              # Type check all packages
pnpm --filter=@sabaipics/dashboard build  # Production build
pnpm dev                      # Local development
```

**Bundle Size:**
- T-11 dashboard build: 549 kB (within acceptable range)
- Watch for bundle size warnings >500 kB

### 6. Date Formatting (from T-11)

**date-fns Usage:**
- Already installed as dependency
- Used for date formatting and relative time calculations
- Pattern: `import { format, parseISO } from "date-fns"`

## Carry-forward constraints

### 1. Database Schema (from T-1, T-9)

**Credit Packages Table:**
- Fields: `id` (uuid), `name`, `credits`, `priceThb`, `active`, `sortOrder`, `createdAt`
- Price stored in **satang** (29900 = 299 THB) — must convert for display
- API returns raw value; frontend must format with currency

**API Contract (T-8):**
```typescript
GET /credit-packages
Response: {
  data: [
    {
      id: string,
      name: string,
      credits: number,
      priceThb: number  // in satang
    }
  ]
}
```

### 2. Stripe Checkout Flow (from T-9)

**Checkout Endpoint:**
```typescript
POST /credit-packages/checkout
Request: { packageId: string }
Response: { checkoutUrl: string, sessionId: string }
```

**Success/Cancel URLs (from T-9 summary):**
- Success: `{CORS_ORIGIN}/credits/success?session_id={CHECKOUT_SESSION_ID}`
- Cancel: `{CORS_ORIGIN}/credits/packages`

**Implications for T-12:**
- T-12 must implement `/credits/packages` route (cancel redirect destination)
- T-12 should implement `/credits/success` route (success redirect destination)
- Success page should handle `session_id` query param

### 3. Authentication Requirements (from T-2, T-6)

**Route Protection:**
- `/credits/packages` — **PUBLIC** (no auth required, pre-purchase browsing)
- `/credits/checkout` — **PROTECTED** (requires auth + consent)
- `/credits/success` — **PROTECTED** (requires auth to verify purchase)

**Middleware Stack:**
- Public routes: No middleware
- Protected routes: `requirePhotographer()` + `requireConsent()`

### 4. UI State Management (from T-11)

**Loading States:**
- Show skeleton cards matching final layout
- Disable buttons during async operations
- Show spinner on button during submit

**Error Handling:**
- Show alert banner with error message
- Include retry button for recoverable errors
- Use destructive variant for errors

**Empty States:**
- Use `Empty` component with descriptive message
- Include CTA button when appropriate

### 5. Navigation Patterns (from T-11)

**Dashboard Integration:**
- T-11 "Buy Credits" button links to `/credits/packages`
- T-11 expects `/credits/packages` route to exist (currently 404)
- After purchase success, user should be redirected back to dashboard

**Route Structure:**
```
/credits/packages  → Browse packages (T-12)
/credits/checkout  → Initiate Stripe checkout (T-9, server-side)
/credits/success   → Post-purchase success page (T-12)
```

## Known issues to avoid

### 1. `[KNOWN_LIMITATION]` No UI Test Infrastructure (from T-6, T-11)

**Issue:** Dashboard has no test runner configured (Vitest not set up)
- T-11 wrote comprehensive test file but had to remove before build
- Would cause compilation errors if included

**Action for T-12:**
- Skip writing unit tests for now
- Document as [ENG_DEBT] for future resolution
- Rely on manual testing checklist

### 2. `[KNOWN_LIMITATION]` PDPA Consent Copy Placeholder (from T-5, T-6)

**Issue:** PDPA consent text is placeholder
- Marked as [PM_FOLLOWUP] in T-5 and T-6
- Does not affect T-12 implementation

### 3. `[KNOWN_LIMITATION]` Dashboard Webhook Delay (from T-11)

**Issue:** Credit balance won't auto-update immediately after Stripe webhook
- T-10 webhook handler implemented but may have processing delay
- T-11 mitigated with `refetchOnWindowFocus` and manual refresh button

**Action for T-12:**
- Success page should include manual "Return to Dashboard" button
- Consider showing optimistic success message
- Rely on T-11's auto-refresh when user returns to dashboard

### 4. `[ENG_DEBT]` No Transaction Wrapping (from T-5)

**Issue:** Consent API inserts consent record + updates photographer without transaction
- Acceptable for MVP, both operations are idempotent-safe
- Does not affect T-12

### 5. `[ENG_DEBT]` PromptPay Async Payments Not Supported (from T-10)

**Issue:** `checkout.session.async_payment_succeeded` webhook not handled
- Only `checkout.session.completed` implemented
- Out of scope for current slice

**Action for T-12:**
- Success page should work for card payments only
- Document limitation if needed

## Notes

### Relevant Dependencies Already Installed
- `date-fns@^4.2.0` — Date formatting (T-11)
- `@tanstack/react-query` — Data fetching (T-6, T-11)
- All shadcn components used in T-11 are available

### API Dependencies Met
- `GET /credit-packages` — Implemented in T-8, ready to consume
- `POST /credit-packages/checkout` — Implemented in T-9, ready to consume
- `GET /dashboard` — Implemented in T-7, for refresh after purchase

### Routing Context
- T-11 dashboard route: `/dashboard`
- T-11 "Buy Credits" link: `/credits/packages` (404 until T-12)
- T-6 onboarding route: `/onboarding`

### Design System Context (from T-11)
- **Typography**: Use existing dashboard patterns
- **Spacing**: Consistent with T-11 dashboard cards
- **Colors**: Use shadcn theme (zinc for neutral, blue for primary)
- **Icons**: Lucide React (already in use)

### Performance Expectations
- Build time: ~1-2s (T-11 was 1.47s)
- Bundle size: <600 kB acceptable for dashboard pages
- API response time: <500ms for GET /credit-packages

### Manual Testing Scope
Given no automated UI tests, T-12 must include comprehensive manual testing checklist covering:
- Desktop responsive breakpoints
- Mobile responsive stacking
- Loading states (skeleton → data)
- Empty state (no packages)
- Error states (API failure)
- Stripe checkout redirect flow
- Success page with session_id
- Cancel flow back to packages page
- Navigation integration with dashboard

### Context for Price Formatting
**Critical:** Prices are stored in satang (smallest Thai Baht unit)
- 1 THB = 100 satang
- Example: 29900 satang = 299 THB
- Display format: "฿299" or "299 THB"
- Must divide by 100 before displaying

### Stripe Checkout Integration
**Flow:**
1. User on `/credits/packages` → selects package
2. Clicks "Purchase" → calls `POST /credit-packages/checkout` with `packageId`
3. API returns `{ checkoutUrl, sessionId }`
4. Frontend redirects to `checkoutUrl` (Stripe hosted page)
5. User completes payment:
   - Success → Redirected to `/credits/success?session_id={sessionId}`
   - Cancel → Redirected to `/credits/packages`
6. Webhook (T-10) fulfills credits asynchronously
7. User returns to dashboard → sees updated balance (via refetch)
