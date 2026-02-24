# Implementation Plan

Task: `T-11 — Dashboard UI`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-10`
Owner: `Claude (implementv3)`

## Inputs

- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: T-11)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-11/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-11/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-11/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-11/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-11/context/risk-scout.md`

## Goal / non-goals

### Goal

Implement the photographer dashboard page showing:

- Credit balance with expiry warning
- Event list with photo/face counts (last 10 events)
- Action buttons ("Buy Credits", "Create Event")
- Empty state for new users
- Performance: <2s p95 load time

### Non-goals

- Pagination for events (API returns 10 max)
- Real-time credit updates (T-10 webhook not done yet)
- Event detail view (deferred to T-15)
- Create Event modal implementation (placeholder/link for now)
- Photo thumbnails in event cards (API doesn't return photo URLs)

## Approach (data-driven)

### Architecture

Replace the placeholder dashboard page (`apps/dashboard/src/routes/dashboard/index.tsx`) with a production implementation that consumes the stable T-7 Dashboard API.

### Data Fetching Strategy

**Pattern:** Custom hook `useDashboardData()` following `useConsentStatus` exemplar (codebase-exemplars.md #5)

```typescript
// apps/dashboard/src/hooks/dashboard/useDashboardData.ts
export function useDashboardData() {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 1000 * 60, // 1 minute (global default)
    refetchOnWindowFocus: true, // Handle credit staleness when T-10 ships
  });
}
```

**Response Type** (from `apps/api/src/routes/dashboard/types.ts`):

```typescript
interface DashboardData {
  data: {
    credits: { balance: number; nearestExpiry: string | null };
    events: DashboardEvent[];
    stats: { totalPhotos: number; totalFaces: number };
  };
}
```

### UI Components

#### 1. Page Structure (from exemplar #1)

```tsx
export function DashboardPage() {
  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Dashboard' }]}>
        <Button asChild>
          <Link to="/credits/packages">Buy Credits</Link>
        </Button>
        <Button variant="outline">Create Event</Button>
      </PageHeader>

      <div className="flex flex-1 flex-col gap-4 p-4">{/* Content grid */}</div>
    </>
  );
}
```

#### 2. Credit Balance Card

- Show balance (large font, 3xl)
- Show expiry warning if `nearestExpiry` exists and < 7 days
- Use `Alert` component with `variant="warning"` for expiry (exemplar #7)
- Manual refresh button in card header (mitigates T-10 staleness)

**Expiry Logic:**

```typescript
const isExpiringSoon = (expiry: string | null) => {
  if (!expiry) return false;
  const days = differenceInDays(new Date(expiry), new Date());
  return days <= 7 && days >= 0;
};
```

#### 3. Stats Cards (Total Photos, Total Faces)

- Two cards in grid layout: `md:grid-cols-3`
- Simple text display, icon from lucide-react
- Handle zero state gracefully

#### 4. Events List Card

- Show last 10 events (API limit)
- Display: name, photoCount, faceCount, createdAt
- No click behavior (T-15 adds event detail view)
- Empty state when `events.length === 0` using `Empty` component (exemplar #7)

**Empty State:**

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <Calendar />
    </EmptyMedia>
    <EmptyTitle>No events yet</EmptyTitle>
    <EmptyDescription>Create your first event to start organizing photos</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Create Event</Button>
  </EmptyContent>
</Empty>
```

#### 5. Loading State

Use `Skeleton` component for card placeholders (exemplar #1, tech-docs.md)

#### 6. Error State

Use `Alert` with `variant="destructive"` + retry button (exemplar #1)

### Component Files

**New files:**

- `apps/dashboard/src/hooks/dashboard/useDashboardData.ts` (custom hook)

**Modified files:**

- `apps/dashboard/src/routes/dashboard/index.tsx` (full replacement)

### Styling (tech-docs.md conventions)

- Use Tailwind CSS only
- Use shadcn CSS variables: `bg-card`, `text-muted-foreground`, `border`
- Grid layout: `grid auto-rows-min gap-4 md:grid-cols-3`
- Card components from `@sabaipics/ui/components/card`
- Icons from `lucide-react`

## Contracts (only if touched)

### API

- **Endpoint:** `GET /dashboard` (T-7)
- **Auth:** Requires Bearer token via `Authorization` header
- **Response:** `{ data: DashboardResponse }` envelope
- **Status:** Stable (T-7 complete, tested)

### Navigation

- **"Buy Credits"** → `/credits/packages` (T-12 will implement this route)
- **"Create Event"** → No navigation yet; button is placeholder/disabled for now

### UI State

- **Loading:** Show skeleton cards while fetching
- **Error:** Show alert with retry button
- **Success:** Show data cards
- **Empty:** Show empty state when `events.length === 0`

## Success path

1. User navigates to `/dashboard` (already authenticated + consented)
2. Dashboard component mounts, triggers `useDashboardData()` hook
3. Loading state: Skeleton cards render
4. API responds with 200 + data envelope
5. Success state: Cards render with actual data
6. If balance > 0 and nearestExpiry < 7 days: Show warning alert
7. If events.length === 0: Show empty state with "Create Event" CTA
8. User can click "Buy Credits" → navigates to `/credits/packages` (T-12)
9. User can click "Create Event" → placeholder (no action yet; T-15 will implement)

## Failure modes / edge cases (major only)

### API Failures

- **Network error:** Show error alert with retry button
- **401 Unauthorized:** Redirect to login (Clerk handles this)
- **500 Server error:** Show error alert, log to console

### Data Edge Cases

- **Zero credits:** Show "0 credits" (no error), emphasize "Buy Credits" CTA
- **Empty events list:** Show empty state with "Create Event" CTA
- **Null nearestExpiry:** No warning (valid for zero balance)
- **Already expired credits:** Defensive check (API should filter, but handle gracefully)

### Performance

- **Slow API:** Skeleton shows until response (max 2s per acceptance criteria)
- **Large event list:** API limits to 10, no client-side pagination needed

### T-10 Webhook Not Done

- **Issue:** Credit balance won't auto-update after Stripe purchase
- **Mitigation:** `refetchOnWindowFocus: true` in React Query + manual refresh button
- **User flow:** Buy credits → return to dashboard → balance updates on focus/refresh

## Validation plan

### Tests to add

**Component Tests** (new file: `apps/dashboard/src/routes/dashboard/index.test.tsx`):

- Renders loading skeleton initially
- Renders credit balance when data loads
- Shows expiry warning when `nearestExpiry < 7 days`
- Shows empty state when `events.length === 0`
- Shows error alert when API fails
- Retry button refetches data after error

**Test Pattern** (from codebase-exemplars.md #9):

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardPage } from "./index";

vi.mock("../../lib/api", () => ({
  useApiClient: () => ({
    getToken: vi.fn().mockResolvedValue("mock-token"),
  }),
}));

describe("DashboardPage", () => {
  it("renders credit balance", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          credits: { balance: 100, nearestExpiry: null },
          events: [],
          stats: { totalPhotos: 0, totalFaces: 0 },
        },
      }),
    });

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/100/)).toBeInTheDocument();
    });
  });
});
```

### Commands to run

- `pnpm --filter=@sabaipics/dashboard check-types` (TypeScript validation)
- `pnpm --filter=@sabaipics/dashboard test` (run component tests)
- `pnpm dev` (manual testing in browser)
- `pnpm build` (verify production build)

### Manual Testing Checklist

- [ ] Desktop: Chrome, Safari (empty state, populated state)
- [ ] Mobile: Safari iOS, Chrome Android (responsive layout)
- [ ] Empty state: New user with 0 credits, 0 events
- [ ] Populated state: User with credits + events
- [ ] Expiry warning: Credits with `nearestExpiry` < 7 days
- [ ] Error state: Kill API server, verify error alert + retry works
- [ ] Loading state: Slow 3G throttle, verify skeleton renders
- [ ] Navigation: "Buy Credits" links to `/credits/packages` (will 404 until T-12 done)

## Rollout / rollback

### Deployment

- Standard dashboard deploy: `pnpm --filter=@sabaipics/dashboard pages:deploy`
- No environment variable changes
- No migrations (UI only)

### Rollback

- Revert PR if dashboard fails to load
- No data layer changes, safe to rollback

### Monitoring

- Track page load time (React Query DevTools)
- Track API errors (dashboard endpoint failures)
- User analytics: empty vs populated dashboard ratio

### Feature Flags

- None required (dashboard is core feature)

## Decisions (RESOLVED 2026-01-10)

### ✅ [RESOLVED] Sidebar navigation scope

**Decision:** Hide unimplemented routes for MVP

**Implementation:**

- Update `apps/dashboard/src/components/shell/app-sidebar.tsx`
- Show only `/dashboard` route in navigation
- Remove or comment out `/events`, `/galleries`, `/settings` links
- Add routes back incrementally as features ship (T-13, T-15, etc.)

### ✅ [RESOLVED] Credit balance refresh strategy

**Decision:** Use `refetchOnWindowFocus: true` + manual refresh button

**Implementation:**

- Add `refetchOnWindowFocus: true` to `useDashboardData()` hook
- Add refresh icon button in credit card header
- Handles staleness when T-10 webhook completes
- User flow: Buy credits → switch tabs → return → auto-refresh

### ✅ [RESOLVED] "Create Event" button behavior

**Decision:** Disabled state with tooltip "Coming soon" for T-11

**Implementation:**

- Button in PageHeader with `disabled` prop
- Tooltip: "Event creation coming soon"
- T-15 will enable and implement full event creation flow

### ✅ [RESOLVED] Event display pattern

**Decision:** Card grid (responsive 2-3 columns)

**Implementation:**

- Use shadcn Card components in responsive grid
- Pattern: `grid gap-4 md:grid-cols-2 lg:grid-cols-3`
- Each card shows: name, photoCount, faceCount, dates
- Not clickable in T-11 (click behavior added in T-15)
- Empty state uses shadcn `Empty` component

## Notes

### Dependencies Status

- ✅ T-7 (Dashboard API): Complete, stable contract
- ✅ T-6 (Consent Gate): Working, dashboard protected
- ✅ PR #16 (Shell Layout): Sidebar + PageHeader ready
- ❌ T-10 (Stripe Webhook): Not blocking, affects credit refresh UX
- ❌ T-12 (Credit Packages UI): Not blocking, "Buy Credits" will link to unimplemented route

### Known Limitations (carry-forward from logs-scout.md)

- No UI tests exist yet in dashboard (addressed in T-11 tests)
- T-10 webhook not done: Credit balance staleness (mitigated with refetch strategy)

### Performance Considerations

- React Query staleTime: 1 minute (global default)
- API returns last 10 events only (no pagination needed)
- Skeleton loading for perceived performance
- Target: <2s p95 load time (acceptance criteria)

### Security

- Dashboard route protected by `ProtectedRoute` + `ConsentGate`
- API requires Bearer token (Clerk auth)
- No PII exposed in dashboard API response (verified in risk-scout.md)
