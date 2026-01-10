# Upstream Dossier: T-11

## Task definition

- **ID:** T-11
- **Title:** Dashboard UI
- **Type:** `feature`
- **Surface:** `UI`
- **Dependencies:** T-7 (Dashboard API)
- **Story refs:** US-3 (Photographer dashboard showing stats, credits, events)
- **Description:** Create dashboard page showing credit balance, event list, and action buttons.
- **Acceptance criteria:**
  - Shows credit balance with expiry warning
  - Lists events with photo counts
  - "Buy Credits" button links to `/credits/packages`
  - "Create Event" button opens modal
  - Empty state for new users
  - <2s p95 load time

## Plan context

### Relevant approach sections from final.md

**Phase 2: Dashboard (US-3, US-4)** — T-11 is part of Phase 2, specifically implementing US-3.

**US-3: Dashboard display (plan section lines 227-243)**

| Step | Surface | Action |
|------|---------|--------|
| 1 | UI | Dashboard loads |
| 2 | API | `GET /dashboard` |
| 3 | UI | Show credit balance, event list, CTAs |

**API Contract (final.md lines 236-243):**
```
GET /dashboard
Response: {
  credits: { balance, nearestExpiry? },
  events: [{ id, name, photoCount, faceCount, createdAt }],
  stats: { totalPhotos, totalFaces }
}
```

**Success Path (final.md lines 440-454)** — Dashboard appears after PDPA consent, shows 0 credits for new user, provides clear CTA to buy credits and create events.

**Performance requirement:** <2s p95 load time (acceptance criteria + research note on CF Images caching).

### API/DB contracts

**API endpoint (T-7):**
- `GET /dashboard` — Returns credit balance (FIFO unexpired sum query), events list (sorted by createdAt desc), and stats (totalPhotos, totalFaces).
- Authentication: Requires `requirePhotographer` middleware (T-2).
- Response shape:
  ```typescript
  {
    credits: { 
      balance: number, 
      nearestExpiry?: string // ISO date of first expiring credit batch
    },
    events: Array<{
      id: string,
      name: string,
      photoCount: number,
      faceCount: number,
      createdAt: string
    }>,
    stats: {
      totalPhotos: number,
      totalFaces: number
    }
  }
  ```

**DB schema (final.md lines 178-186):**
- `photographers` table (primary entity)
- `credit_ledger` table (for balance calculation with FIFO expiry)
- `events` table (for event list)
- `photos` table (for photo counts)
- `faces` table (for face counts)

**Credit ledger mechanics (final.md lines 131-173):**
- Append-only ledger with FIFO expiry inheritance
- Balance = SUM(amount) WHERE expires_at > NOW()
- Deductions inherit expiry from oldest unexpired purchase
- Important: `nearestExpiry` shows when the oldest unexpired credit batch expires (6-month window from purchase)

**Routing:**
- Dashboard is at `/dashboard` (already defined in `apps/dashboard/src/App.tsx` per surface-map.md line 28).
- "Buy Credits" button must link to `/credits/packages` (T-12 responsibility, but navigation contract here).
- "Create Event" button opens modal (NOT navigation; modal component in T-11 scope).

### Key risks/constraints

**Performance (acceptance criteria):**
- <2s p95 load time required
- Empty state must render fast (no data fetching delays)
- Event list may grow large over time → pagination consideration [NEED_DECISION: is pagination needed for events list?]

**Dependencies:**
- T-7 must be complete and deployed (Dashboard API returns correct shape)
- T-2 must be complete (requirePhotographer middleware for auth)
- T-1 must be complete (DB schema for credit_ledger, events, photos, faces)

**UI framework constraints (surface-map.md):**
- Stack: Vite + React (existing `apps/dashboard`)
- Component library: shadcn/ui (use `pnpm --filter=@sabaipics/ui ui:add <component>`)
- Current state: `routes/dashboard/index.tsx` is test page placeholder, needs full replacement

**Empty state UX (plan line 289):**
- Must handle new photographers with 0 credits, 0 events gracefully
- Should guide user toward first action (buy credits OR create event with existing credits)

**Error handling [GAP]:**
- Plan doesn't specify error states for API failures
- [NEED_DECISION: retry logic? offline state? error boundaries?]

## ADR / Research links

**Research: CF Images Thumbnails** (`docs/logs/BS_0001_S-1/research/cf-images-thumbnails.md`)
- **Relevance:** Dashboard shows event list with photo counts. If thumbnails are shown in event cards, T-11 needs to use CF Images URL pattern.
- **Key decision:** URL-based transformations recommended for thumbnails (Option A).
- **Contract:** Thumbnail URLs follow pattern `/cdn-cgi/image/width=200,fit=cover,format=auto/photos.sabaipics.com/{r2_key}`.
- **Impact on T-11:** If event cards show photo thumbnails, use this pattern. Otherwise, defer to T-15 (Events UI).
- **Note:** Plan (line 277) shows event card has "QR thumbnail" but no photo thumbnails. Dashboard events list may only show counts, not images. [NEED_VALIDATION: does dashboard event list show photo thumbnails or just counts?]

**No specific ADRs found** — all architectural decisions are captured in final plan (decisions table, lines 19-42).

**Key decisions affecting T-11:**
- Decision #1: Session timeout 24 hours (affects dashboard session persistence)
- Decision #9: Credit expiration 6 months (affects nearestExpiry display logic)
- Decision #11: Credit packages UI on dedicated page (affects "Buy Credits" link target)

## Product docs traceability

**Initiative:** Not explicitly named in available docs.

**Slice:** `d999677d-0b51-4b3b-b163-eec36a5bdde3` (S-1: Photographer Onboarding & Photo Upload)

**Stories:**
- **US-3:** Photographer dashboard showing stats, credits, events
  - Dashboard displays credit balance (with expiry warning per Decision #9)
  - Dashboard lists events with photo/face counts
  - Dashboard provides CTAs: "Buy Credits" (→ `/credits/packages`), "Create Event" (modal)
  - Empty state for new photographers

**Workflow context [NEED_VALIDATION]:**
- Upstream PM docs not fully available in this execution root.
- Task references "US-3" but detailed user story text not in final.md.
- Workflow steps inferred from plan section (Phase 2, lines 227-243).

## Implied contracts

### Navigation contracts
- **Route:** `/dashboard` (primary landing after login per plan success path line 444)
- **Outbound links:**
  - "Buy Credits" → `/credits/packages` (T-12 responsibility, link contract here)
  - "Create Event" → opens modal (no navigation, modal in T-11 scope)
  - Individual event cards → [GAP: link target? `/events/:id`? Defer to T-15?]

### Component contracts
- **Dashboard layout:**
  - Credit balance widget (shows `balance` + `nearestExpiry` warning)
  - Event list/grid (shows name, photoCount, faceCount, createdAt)
  - Action buttons ("Buy Credits", "Create Event")
  - Empty state (when events.length === 0)
- **Create Event modal:**
  - Inputs: name (required), start/end dates (optional) per T-13 API contract
  - Calls `POST /events` (T-13 responsibility, but UI trigger in T-11)
  - [NEED_DECISION: does modal close on success? refresh events list? optimistic update?]

### Data contracts (from T-7 API)
- **credits.balance:** number (integer, ≥ 0)
- **credits.nearestExpiry:** string | undefined (ISO date string if any credits exist and haven't expired yet)
- **events:** Array (may be empty for new users)
- **stats.totalPhotos, stats.totalFaces:** numbers (may be 0)

### UI state contracts [NEED_VALIDATION]
- Loading state: dashboard waits for `GET /dashboard` response
- Error state: [GAP: plan doesn't specify error UI]
- Empty state: events.length === 0 → show onboarding CTA
- Expiry warning: if `nearestExpiry` exists and is < 30 days away, show warning banner? [NEED_DECISION]

## Uncertainty markers

- **[NEED_DECISION]** Does dashboard event list need pagination, or assume small count for MVP?
- **[NEED_DECISION]** Error handling UX: retry logic, offline state, error boundaries?
- **[NEED_VALIDATION]** Do event cards on dashboard show photo thumbnails, or just counts?
- **[NEED_VALIDATION]** Event card click target: navigate to `/events/:id` or open detail modal?
- **[NEED_DECISION]** Create Event modal: close on success? How to refresh event list?
- **[NEED_DECISION]** Credit expiry warning: show banner if nearestExpiry < 30 days? What threshold?
- **[GAP]** Plan doesn't specify loading skeleton UI vs spinner for dashboard load.
- **[GAP]** Plan doesn't specify real-time updates (e.g., if credits purchased in another tab).

## Notes for implementation

- **Existing code:** `apps/dashboard/src/routes/dashboard/index.tsx` currently has test placeholder (surface-map.md line 24). Full replacement needed.
- **Component library:** Use shadcn/ui. Add components via `pnpm --filter=@sabaipics/ui ui:add <component>`.
- **Auth check:** Dashboard is protected route (requires session from Clerk after PDPA consent per Phase 1).
- **API client:** Use existing pattern from `apps/dashboard` (check for API client setup in current codebase).
- **Testing (acceptance):** Component tests for dashboard cards, test empty state rendering (tasks.md line 291-292).
- **Performance target:** <2s p95 load time. Use lazy loading, skeleton UI during fetch, avoid blocking renders.

## Dependencies status (from tasks.md)

- **T-7 (Dashboard API):** ✅ Done (PR #12, tasks.md line 181)
- **T-2 (Auth Middleware):** ✅ Done (tasks.md line 68)
- **T-1 (DB Schema):** ✅ Done (tasks.md line 44)

**Dependency chain validation:** All direct dependencies marked done. T-11 is unblocked.

**Upstream tasks in Phase 2:**
- T-8 (Credit Packages API): ✅ Done (PR #13)
- T-9 (Stripe Checkout API): ✅ Done (PR #15)
- T-10 (Stripe Webhook): ❌ Not done (tasks.md line 250)
- T-12 (Credit Packages UI): ❌ Not done (tasks.md line 299)

**Note:** T-11 doesn't directly depend on T-10 or T-12, but "Buy Credits" link assumes T-12 exists (or shows "Coming Soon" if T-12 not ready).
