# Codebase Exemplars: T-11 (Dashboard UI)

**Surface:** UI (Dashboard)  
**Generated:** 2026-01-10  
**Task:** Create dashboard page showing credit balance, event list, and action buttons.

---

## 1. Primary Exemplar: Dashboard Page (Current Implementation)

### File: `/apps/dashboard/src/routes/dashboard/index.tsx`

**What it demonstrates:**
- Protected dashboard page with PageHeader + layout
- API data fetching with React Query
- Loading/error/success states
- Card-based layout with placeholder sections
- Authentication via `useApiClient()` hook

**Current code:**

```tsx
import { useUser } from "@sabaipics/auth/react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sabaipics/ui/components/card";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/ui/components/alert";
import { PageHeader } from "../../components/shell/page-header";

export function DashboardPage() {
  const { user } = useUser();
  const { getToken } = useApiClient();

  // Test protected route
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/auth/profile`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    },
  });

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Dashboard" }]} />

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back,{" "}
            {user?.firstName || user?.emailAddresses[0]?.emailAddress}!
          </p>
        </div>

        {/* Placeholder cards */}
        <div className="grid auto-rows-min gap-4 md:grid-cols-3">
          <div className="bg-muted/50 aspect-video rounded-xl" />
          <div className="bg-muted/50 aspect-video rounded-xl" />
          <div className="bg-muted/50 aspect-video rounded-xl" />
        </div>

        {/* Test Protected API Call */}
        <Card>
          <CardHeader>
            <CardTitle>Protected API Test</CardTitle>
            <CardDescription>
              Testing authenticated request to /auth/profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && <p>Loading...</p>}

            {error && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            )}

            {profile && (
              <div className="space-y-2">
                <Alert>
                  <AlertTitle>Success!</AlertTitle>
                  <AlertDescription>{profile.message}</AlertDescription>
                </Alert>
                <pre className="bg-slate-100 p-4 rounded text-sm overflow-auto">
                  {JSON.stringify(profile, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
```

**Key patterns to reuse for T-11:**

1. **Page Structure:**
   ```tsx
   <>
     <PageHeader breadcrumbs={[{ label: "Dashboard" }]} />
     <div className="flex flex-1 flex-col gap-4 p-4">
       {/* Content */}
     </div>
   </>
   ```

2. **Data Fetching:**
   ```tsx
   const { getToken } = useApiClient();
   const { data, isLoading, error } = useQuery({
     queryKey: ["dashboard"],
     queryFn: async () => {
       const token = await getToken();
       const response = await fetch(`${import.meta.env.VITE_API_URL}/dashboard`, {
         headers: { Authorization: `Bearer ${token}` }
       });
       if (!response.ok) throw new Error(`HTTP ${response.status}`);
       return response.json();
     }
   });
   ```

3. **Loading/Error/Success States:**
   ```tsx
   {isLoading && <p>Loading...</p>}
   {error && <Alert variant="destructive">...</Alert>}
   {data && <ActualContent />}
   ```

---

## 2. API Response Shape (T-7 Dashboard API)

### File: `/apps/api/src/routes/dashboard/route.ts` + `types.ts`

**Dashboard API Response:**

```typescript
// Type definition
export type DashboardResponse = {
  credits: {
    balance: number;
    nearestExpiry: string | null;  // ISO 8601 timestamp
  };
  events: DashboardEvent[];
  stats: {
    totalPhotos: number;
    totalFaces: number;
  };
};

export type DashboardEvent = {
  id: string;
  name: string;
  photoCount: number;
  faceCount: number;
  createdAt: string;
  expiresAt: string;
  startDate: string | null;
  endDate: string | null;
};

// Actual API envelope
{
  "data": {
    "credits": { "balance": 100, "nearestExpiry": "2026-07-10T..." },
    "events": [...],
    "stats": { "totalPhotos": 50, "totalFaces": 200 }
  }
}
```

**How to consume:**

```tsx
interface DashboardData {
  data: {
    credits: { balance: number; nearestExpiry: string | null };
    events: Array<{
      id: string;
      name: string;
      photoCount: number;
      faceCount: number;
      createdAt: string;
      expiresAt: string;
      startDate: string | null;
      endDate: string | null;
    }>;
    stats: { totalPhotos: number; totalFaces: number };
  };
}

const { data } = useQuery<DashboardData>({
  queryKey: ["dashboard"],
  queryFn: async () => {
    const token = await getToken();
    const res = await fetch(`${import.meta.env.VITE_API_URL}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
});

// Access data
const balance = data?.data.credits.balance ?? 0;
const events = data?.data.events ?? [];
```

---

## 3. Exemplar: Onboarding Page (Complex State Machine)

### File: `/apps/dashboard/src/routes/onboarding/index.tsx`

**What it demonstrates:**
- Custom hook for API data (`useConsentStatus`)
- Multiple UI states (loading, timeout, error, success)
- Empty state pattern with `Empty` component
- Manual polling with `useEffect`
- Navigation with React Router

**Key patterns:**

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sabaipics/ui/components/empty";
import { Spinner } from "@sabaipics/ui/components/spinner";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/ui/components/alert";
import { AlertTriangle } from "lucide-react";

export function OnboardingPage() {
  const navigate = useNavigate();
  const [hasTimeout, setHasTimeout] = useState(false);
  
  const { photographerExists, isConsented, refetch } = useConsentStatus();

  // State-based rendering
  if (hasTimeout) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Timeout</AlertTitle>
          <AlertDescription>...</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Loading state with Empty component
  return (
    <Empty className="min-h-screen">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Spinner className="size-5" />
        </EmptyMedia>
        <EmptyTitle>Setting up your account...</EmptyTitle>
        <EmptyDescription>
          We're preparing your photographer profile.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
```

**Why it matters for T-11:**
- Empty state pattern for new users with no events
- Loading spinner pattern
- Alert component for warnings (credit expiry)

---

## 4. Exemplar: PDPA Consent Modal (Form + Mutation)

### File: `/apps/dashboard/src/routes/onboarding/_components/PDPAConsentModal.tsx`

**What it demonstrates:**
- React Query mutation (POST request)
- Form state management (checkbox)
- Loading/error states in forms
- Dialog component usage
- Query cache invalidation after mutation

**Key patterns:**

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@sabaipics/auth/react";
import { Button } from "@sabaipics/ui/components/button";
import { Checkbox } from "@sabaipics/ui/components/checkbox";
import { Alert, AlertDescription } from "@sabaipics/ui/components/alert";
import { Spinner } from "@sabaipics/ui/components/spinner";

export function PDPAConsentModal({ open, onAcceptSuccess }) {
  const [isAgreed, setIsAgreed] = useState(false);
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/consent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok && response.status !== 409) {
        throw new Error("Failed to submit consent");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consent-status"] });
      onAcceptSuccess();
    },
  });

  return (
    <Dialog open={open}>
      <DialogContent>
        {/* Form content */}
        <div className="flex items-start gap-3">
          <Checkbox
            id="consent"
            checked={isAgreed}
            onCheckedChange={(checked) => setIsAgreed(checked === true)}
            disabled={mutation.isPending}
          />
          <label htmlFor="consent">I accept...</label>
        </div>

        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>Failed to submit. Try again.</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={() => mutation.mutate()}
          disabled={!isAgreed || mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <Spinner className="mr-2" />
              Submitting...
            </>
          ) : (
            "Accept"
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

**Why it matters for T-11:**
- "Create Event" modal will use similar mutation pattern
- Button loading states
- Form validation (checkbox must be checked)

---

## 5. Exemplar: Custom Hook for API Data

### File: `/apps/dashboard/src/hooks/consent/useConsentStatus.ts`

**What it demonstrates:**
- Custom hook wrapping `useQuery`
- Polling support (`refetchInterval`)
- Error handling for specific status codes (403 = not found)
- Computed return values

```tsx
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@sabaipics/auth/react";

interface ConsentStatusResponse {
  data: {
    isConsented: boolean;
    consentedAt: string | null;
  };
}

export function useConsentStatus(options = {}) {
  const { isSignedIn, getToken } = useAuth();
  const { pollingInterval } = options;

  const query = useQuery({
    queryKey: ["consent-status"],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/consent`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Handle 403 as "not found" (not an error)
      if (response.status === 403) {
        return { photographerExists: false, isConsented: false };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: ConsentStatusResponse = await response.json();
      return {
        photographerExists: true,
        isConsented: data.data.isConsented,
        consentedAt: data.data.consentedAt,
      };
    },
    enabled: isSignedIn,
    refetchInterval: pollingInterval,
  });

  return {
    photographerExists: query.data?.photographerExists ?? false,
    isConsented: query.data?.isConsented ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
```

**Why it matters for T-11:**
- Create `useDashboardData()` hook following same pattern
- Encapsulate API call + error handling
- Return computed values

---

## 6. Component Library Patterns

### Card Component (shadcn/ui)

**File:** `/packages/ui/src/components/card.tsx`

**Usage pattern:**

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@sabaipics/ui/components/card";

<Card>
  <CardHeader>
    <CardTitle>Credit Balance</CardTitle>
    <CardDescription>Your available credits</CardDescription>
    <CardAction>
      <Button size="sm">Buy More</Button>
    </CardAction>
  </CardHeader>
  <CardContent>
    <div className="text-3xl font-bold">{balance} credits</div>
  </CardContent>
  <CardFooter>
    <p className="text-sm text-muted-foreground">
      {nearestExpiry && `Expires: ${formatDate(nearestExpiry)}`}
    </p>
  </CardFooter>
</Card>
```

**Why it matters:** Credit balance and stats will use Card components.

---

### Empty State Component

**File:** `/packages/ui/src/components/empty.tsx`

**Usage pattern:**

```tsx
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@sabaipics/ui/components/empty";
import { Calendar } from "lucide-react";
import { Button } from "@sabaipics/ui/components/button";

{events.length === 0 && (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Calendar />
      </EmptyMedia>
      <EmptyTitle>No events yet</EmptyTitle>
      <EmptyDescription>
        Create your first event to start organizing photos.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button>Create Event</Button>
    </EmptyContent>
  </Empty>
)}
```

**Why it matters:** Show empty state for new photographers with no events.

---

### Alert Component (Warnings)

**File:** `/packages/ui/src/components/alert.tsx`

**Usage pattern:**

```tsx
import { Alert, AlertTitle, AlertDescription } from "@sabaipics/ui/components/alert";
import { AlertTriangle } from "lucide-react";

{nearestExpiry && isExpiringSoon(nearestExpiry) && (
  <Alert variant="warning">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Credits Expiring Soon</AlertTitle>
    <AlertDescription>
      {balance} credits expire on {formatDate(nearestExpiry)}
    </AlertDescription>
  </Alert>
)}
```

**Why it matters:** Show expiry warnings when credits expire within 7 days.

---

## 7. Page Layout Pattern (Shell + PageHeader)

### File: `/apps/dashboard/src/components/Layout.tsx`

```tsx
import { Outlet } from "react-router";
import { SidebarInset, SidebarProvider } from "@sabaipics/ui/components/sidebar";
import { AppSidebar } from "./shell/app-sidebar";

export function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
```

### File: `/apps/dashboard/src/components/shell/page-header.tsx`

```tsx
interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  children?: React.ReactNode;
}

export function PageHeader({ breadcrumbs = [], children }: PageHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1 md:hidden" />
        <Separator orientation="vertical" className="mr-2 md:hidden" />
        {breadcrumbs.length > 0 && (
          <Breadcrumb>
            {/* Breadcrumb rendering logic */}
          </Breadcrumb>
        )}
      </div>
      {children && (
        <div className="ml-auto flex items-center gap-2 px-4">{children}</div>
      )}
    </header>
  );
}
```

**Usage in dashboard:**

```tsx
export function DashboardPage() {
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Dashboard" }]}>
        <Button>Buy Credits</Button>
        <Button>Create Event</Button>
      </PageHeader>
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Content */}
      </div>
    </>
  );
}
```

**Why it matters:** Consistent header across all dashboard pages.

---

## 8. API Client Pattern

### File: `/apps/dashboard/src/lib/api.ts`

```tsx
import { hc } from "hono/client";
import type { AppType } from "@sabaipics/api";
import { useAuth } from "@sabaipics/auth/react";

// Base client (unauthenticated)
export const api = hc<AppType>(import.meta.env.VITE_API_URL);

// Hook for authenticated requests
export function useApiClient() {
  const { getToken } = useAuth();

  const createAuthClient = async () => {
    const token = await getToken();
    return hc<AppType>(import.meta.env.VITE_API_URL, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  };

  return { api, createAuthClient, getToken };
}
```

**Why it matters:**
- Use `useApiClient()` in all dashboard components
- Hono RPC client provides type-safe API calls (but fetch is also fine for now)

---

## 9. Test Patterns

**Current state:** No UI tests exist yet in dashboard (`*.test.tsx` not found).

**Recommended pattern for T-11:**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardPage } from "./index";

// Mock API client
vi.mock("../../lib/api", () => ({
  useApiClient: () => ({
    getToken: vi.fn().mockResolvedValue("mock-token"),
  }),
}));

describe("DashboardPage", () => {
  it("renders loading state initially", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders credit balance when data loads", async () => {
    // Mock fetch
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
      expect(screen.getByText(/100 credits/i)).toBeInTheDocument();
    });
  });
});
```

---

## 10. Routing Pattern

### File: `/apps/dashboard/src/App.tsx`

```tsx
import { Routes, Route } from "react-router";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { DashboardPage } from "./routes/dashboard";

function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/credits/packages" element={<CreditPackagesPage />} />
        {/* More routes */}
      </Route>
    </Routes>
  );
}
```

**Why it matters:** Dashboard is already set up as a protected route with Layout.

---

## Summary: Implementation Checklist for T-11

### 1. Data Fetching
- [ ] Create `useDashboardData()` hook (pattern: `useConsentStatus.ts`)
- [ ] Use React Query with `queryKey: ["dashboard"]`
- [ ] Handle loading/error/success states
- [ ] Type the API response: `{ data: DashboardResponse }`

### 2. UI Components
- [ ] Replace placeholder cards with real data
- [ ] Credit Balance Card (show balance + expiry warning)
- [ ] Stats Cards (totalPhotos, totalFaces)
- [ ] Events List Card (show 10 most recent events)
- [ ] Empty state when `events.length === 0`

### 3. Action Buttons
- [ ] "Buy Credits" button → navigate to `/credits/packages`
- [ ] "Create Event" button → open modal (or navigate to create page)

### 4. Layout
- [ ] Keep existing `PageHeader` with breadcrumbs
- [ ] Add action buttons to PageHeader `children` slot
- [ ] Use existing grid layout: `grid auto-rows-min gap-4 md:grid-cols-3`

### 5. Error Handling
- [ ] Show Alert (destructive) if API returns error
- [ ] Show Alert (warning) if credits expiring within 7 days
- [ ] Graceful fallback for empty data

### 6. Performance
- [ ] Use `staleTime` in React Query (already set globally to 1 min)
- [ ] Avoid unnecessary re-renders
- [ ] Test p95 load time < 2s

### 7. Testing
- [ ] Component test: renders loading state
- [ ] Component test: renders credit balance correctly
- [ ] Component test: shows empty state for new users
- [ ] Component test: shows expiry warning when needed

---

## Common Patterns Across Exemplars

1. **Auth Pattern:** `useApiClient()` → `getToken()` → `fetch` with Bearer header
2. **Query Pattern:** `useQuery({ queryKey, queryFn })` with typed response
3. **Mutation Pattern:** `useMutation({ mutationFn, onSuccess })` + query invalidation
4. **Error Shape:** `{ error: { code, message } }` from API
5. **Success Shape:** `{ data: { ... } }` from API
6. **Loading State:** Check `isLoading` before rendering
7. **Error State:** Use `<Alert variant="destructive">` for errors
8. **Empty State:** Use `<Empty>` component with icon + title + description
9. **Card Layout:** `<Card><CardHeader>...<CardContent>...</Card>`
10. **Page Structure:** `<PageHeader />` + `<div className="flex flex-1 flex-col gap-4 p-4">`

---

## File Paths Reference

| What | Where |
|------|-------|
| Dashboard page | `apps/dashboard/src/routes/dashboard/index.tsx` |
| API client | `apps/dashboard/src/lib/api.ts` |
| PageHeader | `apps/dashboard/src/components/shell/page-header.tsx` |
| Layout | `apps/dashboard/src/components/Layout.tsx` |
| Dashboard API | `apps/api/src/routes/dashboard/route.ts` |
| Dashboard types | `apps/api/src/routes/dashboard/types.ts` |
| UI components | `packages/ui/src/components/*.tsx` |
| Auth hooks | `@sabaipics/auth/react` (from packages/auth) |

---

## Next Steps

1. **Implement `useDashboardData()` hook** following `useConsentStatus` pattern
2. **Update `DashboardPage` component** to consume real data
3. **Add credit balance card** with expiry warning logic
4. **Add events list** with proper formatting
5. **Add action buttons** (Buy Credits, Create Event)
6. **Test with empty/populated states**
7. **Write component tests**
