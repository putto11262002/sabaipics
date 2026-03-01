# Risk Scout: T-11 (Dashboard UI)

**Task:** T-11 — Dashboard UI  
**Root:** BS_0001_S-1  
**Surface:** UI (Dashboard)  
**Dependencies:** T-7 (Dashboard API)  
**Generated:** 2026-01-10

---

## Executive Summary

**Overall Risk:** LOW-MEDIUM

T-11 builds dashboard UI on top of the completed T-7 API. The API contract is stable and tested. Primary risks are:

1. UI state management for empty vs populated states
2. Pending T-10 (Stripe webhook) means credit balance won't update in real-time
3. Event list UI is implemented but events don't exist yet (T-13)
4. Navigation sidebar has placeholder links to unimplemented routes

---

## Technical Risks

### [RISK] T-10 (Stripe webhook) not complete

- **Impact:** Credit balance won't auto-update after purchase
- **Manifestation:** User buys credits → returns to dashboard → sees old balance until page refresh
- **Mitigation:**
  - Add manual refresh button or auto-refresh on focus/mount
  - Use React Query's `refetchInterval` or `refetchOnWindowFocus`
  - Document in UI that balance updates may take a few seconds
- **Severity:** MEDIUM (affects UX but not functionality)

### [RISK] Empty state testing

- **Impact:** New users see placeholder UI, need clear guidance
- **Manifestation:** Empty events list, zero credits, no stats
- **Current state:** T-7 API returns proper empty state (`{ balance: 0, events: [], stats: { totalPhotos: 0, totalFaces: 0 } }`)
- **Mitigation:**
  - Design empty state with clear CTAs ("Buy Credits", "Create Event")
  - Use shadcn `Empty` component (already in codebase from T-6)
  - Test with mock empty response
- **Severity:** LOW (well-defined API contract)

### [RISK] Credit expiry warning logic

- **Impact:** Users don't see when credits expire
- **API contract:** `credits.nearestExpiry` is ISO string or null
- **UI requirement:** Show warning if expiry < 7 days
- **Edge cases:**
  - Null expiry (no credits) → no warning
  - Already expired (shouldn't happen, API filters `> NOW()`) → defensive check
  - Multiple purchases with different expiries → API returns MIN (earliest)
- **Mitigation:**
  - Use `date-fns` for expiry calculation
  - Show relative time ("expires in 5 days")
  - Color coding: green (>30d), yellow (7-30d), red (<7d)
- **Severity:** LOW (API handles complexity, UI just displays)

### [RISK] Performance with large event lists

- **Impact:** Slow render if photographer has 100+ events
- **Current API behavior:** Returns last 10 events (hardcoded LIMIT 10 in T-7)
- **Gap:** No pagination in API yet
- **Mitigation:**
  - Accept 10-event limit for MVP
  - If needed, add "View All Events" link to future /events page
  - Virtual scrolling not needed with 10 items
- **Severity:** LOW (API limit mitigates)

---

## Coupling / Integration Points

### [COUPLING] Dashboard API contract (T-7)

- **File:** `apps/api/src/routes/dashboard/types.ts`
- **Contract:**
  ```typescript
  type DashboardResponse = {
    credits: { balance: number; nearestExpiry: string | null };
    events: DashboardEvent[];
    stats: { totalPhotos: number; totalFaces: number };
  };
  ```
- **Status:** STABLE (T-7 complete, tests passing, PR merged)
- **Risk:** LOW (breaking changes unlikely, but version if needed)

### [COUPLING] Consent gate (T-6)

- **File:** `apps/dashboard/src/components/auth/ConsentGate.tsx`
- **Behavior:** Redirects to `/onboarding` if not consented
- **Integration:** Dashboard route wrapped in ConsentGate (App.tsx line 32-34)
- **Risk:** LOW (already working in production)

### [COUPLING] Sidebar navigation (PR #16)

- **File:** `apps/dashboard/src/components/shell/app-sidebar.tsx`
- **Issue:** Sidebar has links to unimplemented routes:
  - `/events` (T-15)
  - `/galleries` (not in current slice)
  - `/settings/profile`, `/settings/billing` (out of scope)
- **Behavior:** Clicking these links → 404 or redirect loop
- **Mitigation:**
  - Keep sidebar as-is (shows vision)
  - Add `disabled` state or tooltip "Coming soon" to unimplemented links
  - OR remove unimplemented items until routes exist
- **Severity:** MEDIUM (UX confusion)

### [COUPLING] API client pattern

- **File:** `apps/dashboard/src/lib/api.ts`
- **Pattern:** Uses Hono RPC client for type safety
- **Current usage:** Dashboard page uses raw `fetch()` instead of RPC client
- **Inconsistency:** T-6 uses `fetch()`, but RPC client exists
- **Decision needed:** Standardize on one approach
- **Options:**
  1. Use RPC client: `const { dashboard } = await createAuthClient(); const data = await dashboard.$get();`
  2. Keep fetch for flexibility (current approach)
- **Severity:** LOW (both work, but consistency matters)

---

## HI Gates (Block if Not Resolved)

### [HI_GATE] Sidebar navigation scope

**Question:** Should unimplemented routes be visible in sidebar?

**Options:**

1. **Show all routes with "Coming soon" tooltips**
   - Pro: Shows product vision, encourages exploration
   - Con: Users click and get confused
2. **Hide unimplemented routes, add as features ship**
   - Pro: Clean UX, no dead links
   - Con: Requires updating sidebar in every feature PR
3. **Show but disable (grayed out + tooltip)**
   - Pro: Balance of vision + clarity
   - Con: More UI code (disabled state)

**Recommendation:** Option 2 (hide unimplemented) for MVP, add routes incrementally.

**Impact if unresolved:** Users click Events → 404 → confusion.

---

### [HI_GATE] Credit balance refresh strategy

**Question:** How should dashboard handle stale credit balance?

**Context:** T-10 (Stripe webhook) not done, so balance won't update immediately after purchase.

**Options:**

1. **Manual refresh button**
   - Pro: Simple, no polling overhead
   - Con: Users must remember to click
2. **Auto-refresh on window focus**
   - Pro: Works when user returns from Stripe
   - Con: Doesn't help if user stays on page
3. **Polling every 30s**
   - Pro: Always up-to-date
   - Con: Extra API calls, battery drain on mobile
4. **Optimistic update (add credits on checkout redirect)**
   - Pro: Instant feedback
   - Con: Out of sync if webhook fails

**Recommendation:** Option 2 (refetch on focus) + Option 1 (manual refresh button).

**Impact if unresolved:** User confusion ("I paid but balance didn't update").

---

### [HI_GATE] Empty state CTAs

**Question:** What actions should empty state encourage?

**Context:** New photographer lands on dashboard with 0 credits, 0 events.

**Options:**

1. **Primary CTA: "Buy Credits"**
   - Links to `/credits/packages` (T-12)
   - Assumes user needs credits first
2. **Primary CTA: "Create Event"**
   - Opens event modal (T-15)
   - But user has 0 credits → can't upload photos → confusing
3. **Dual CTAs: "Buy Credits" + "Learn More"**
   - Onboarding flow with explanation

**Recommendation:** Option 1 (Buy Credits primary) + secondary "Create Event" button with tooltip "You'll need credits to upload photos".

**Impact if unresolved:** User doesn't know what to do first.

---

## Unknowns

### [UNKNOWN] Event card design

- **What:** How to display events in dashboard list
- **API provides:** name, photoCount, faceCount, createdAt, expiresAt, startDate, endDate
- **Questions:**
  - Show thumbnail (first photo)? → No, photos not fetched in dashboard API
  - Click behavior? → Navigate to `/events/:id` (not in this task)
  - Show expiry countdown? → Nice-to-have, not critical
- **Resolution:** Use simple card with text info, defer thumbnail to T-15

### [UNKNOWN] Stats card design

- **What:** How to display totalPhotos, totalFaces
- **Options:**
  - Separate cards ("120 Photos", "340 Faces")
  - Single card with grid
  - Part of credit card
- **Resolution:** Refer to shadcn card patterns, keep simple

### [UNKNOWN] Loading states

- **What:** Dashboard loads 3 queries (T-7 returns all in one response)
- **Options:**
  - Single skeleton for whole page
  - Per-card skeletons
  - Spinner + blur
- **Resolution:** Use shadcn Skeleton component (already added in PR #16)

---

## Mitigation Recommendations

### High Priority

1. **Sidebar navigation cleanup**
   - Remove unimplemented routes OR add disabled state with tooltips
   - Only show: Dashboard, Settings (with Clerk modal)
   - Add Events/Galleries when T-15 ships

2. **Credit refresh UX**
   - Add `refetchOnWindowFocus: true` to React Query
   - Add manual refresh icon button in credit card header
   - Show timestamp "Updated 5 seconds ago"

3. **Empty state design**
   - Use `Empty` component from shadcn (T-6 pattern)
   - Primary CTA: "Buy Credits" → `/credits/packages`
   - Secondary text: "You need credits to upload photos"
   - Image/illustration (optional)

### Medium Priority

4. **Standardize API client usage**
   - Decide: RPC client vs raw fetch
   - Document in `.claude/rules/ui.md`
   - Apply consistently in T-11

5. **Error boundaries**
   - Dashboard API can fail (network, DB down)
   - Show error state with retry button
   - Use shadcn Alert component

6. **Expiry warning thresholds**
   - Define color coding (green/yellow/red)
   - Add to Tech Image conventions
   - Use across all credit displays

### Low Priority

7. **Loading skeletons**
   - Use Skeleton component for cards
   - Match card layout (width/height)

8. **Mobile responsive testing**
   - Dashboard already has shell from PR #16
   - Test credit cards on narrow screens
   - Ensure CTAs are thumb-friendly

---

## Dependencies Status

| Task                      | Status           | Impact on T-11                       |
| ------------------------- | ---------------- | ------------------------------------ |
| T-7 (Dashboard API)       | ✅ DONE (PR #12) | Core dependency, stable              |
| T-10 (Stripe webhook)     | ❌ NOT DONE      | Credit balance won't auto-update     |
| T-6 (Signup + Consent)    | ✅ DONE (PR #14) | ConsentGate working                  |
| PR #16 (Shell layout)     | ✅ DONE          | Sidebar, Layout ready                |
| T-12 (Credit packages UI) | ❌ NOT DONE      | "Buy Credits" button links here      |
| T-13 (Events API)         | ❌ NOT DONE      | Event list shows but no events exist |

**Critical path:** T-7 is done ✅ → T-11 can proceed.

**Blockers:** None (T-10 is parallel, not blocking).

---

## Sensitive Areas

### [SECURITY] No PII in dashboard API

- **Check:** T-7 returns photographer data (name, email) → not exposed in dashboard response
- **Verification:** Review `apps/api/src/routes/dashboard/route.ts` lines 100-109
- **Status:** SAFE (only returns aggregated data, no PII)

### [SECURITY] Credit balance exposure

- **Risk:** Balance visible in network response
- **Mitigation:** Already protected by `requirePhotographer()` + `requireConsent()` middleware
- **Status:** SAFE (authenticated endpoints only)

### [AUTH] Consent gate bypass

- **Risk:** Direct navigation to /dashboard bypasses consent check
- **Mitigation:** ConsentGate wraps Layout in App.tsx (line 32-34)
- **Status:** SAFE (tested in T-6)

---

## Testing Strategy

### Unit Tests (Component)

- [ ] Dashboard page renders with mock data
- [ ] Empty state shows when balance=0, events=[]
- [ ] Credit expiry warning shows when nearestExpiry < 7 days
- [ ] Loading state shows skeleton
- [ ] Error state shows alert with retry

### Integration Tests (E2E)

- [ ] Full flow: Login → Dashboard loads → Shows credit balance
- [ ] Click "Buy Credits" → Navigates to /credits/packages (when T-12 done)
- [ ] Refresh after Stripe purchase → Balance updates (when T-10 done)

### Manual Testing Checklist

- [ ] Desktop: Chrome, Safari, Firefox
- [ ] Mobile: Safari iOS, Chrome Android
- [ ] Empty state (new user)
- [ ] Populated state (user with credits + events)
- [ ] Network error (API down) → Error state
- [ ] Slow network (3G throttle) → Loading skeleton

---

## Rollout Notes

### Feature Flags

- None required (dashboard is core feature)

### Migrations

- None (UI only)

### Environment Variables

- `VITE_API_URL` (already configured)

### Monitoring

- Track page load time (React Query devtools)
- Track API errors (dashboard endpoint failures)
- Track empty vs populated state ratio (analytics)

---

## Follow-Up Tasks

### Immediate (In T-11)

- Resolve HI gates (sidebar scope, refresh strategy, empty CTAs)
- Implement dashboard page with cards
- Add loading/error/empty states
- Test responsive layout

### Future (Post-T-11)

- T-12: Wire "Buy Credits" button
- T-10: Add credit refresh logic after webhook
- T-15: Add "Create Event" button functionality
- Add pagination if event list grows >10

---

## Provenance

**Context sources:**

- `docs/logs/BS_0001_S-1/tasks.md` (T-11 requirements)
- `docs/logs/BS_0001_S-1/plan/final.md` (architecture)
- `docs/logs/BS_0001_S-1/context/repo-scout.md` (codebase patterns)
- `docs/logs/BS_0001_S-1/context/surface-map.md` (touch points)
- `apps/api/src/routes/dashboard/route.ts` (T-7 implementation)
- `apps/dashboard/src/routes/dashboard/index.tsx` (current state)
- `apps/dashboard/src/components/shell/app-sidebar.tsx` (PR #16)
- `apps/dashboard/src/components/auth/ConsentGate.tsx` (T-6)
- Git log: PRs #12 (T-7), #14 (T-6), #16 (Shell)

**Commands run:**

- `Read` tasks.md, plan/final.md, context reports
- `Read` API route, dashboard page, sidebar, consent gate
- `Glob` dashboard components
- `git log --oneline -10`
- `git show 69e02c5 --stat` (PR #16)

---

**Risk Scout Completed:** 2026-01-10  
**Next Step:** Review with human, resolve HI gates, proceed to implementation.
