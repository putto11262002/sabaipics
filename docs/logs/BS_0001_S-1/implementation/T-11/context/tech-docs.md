# Tech Docs Scout: T-11

**Task:** T-11 - Dashboard UI  
**Root:** BS_0001_S-1  
**Generated:** 2026-01-10

---

## Task Specification (from tasks.md)

```
### T-11 - Dashboard UI
- [ ] Done
- **Type:** `feature`
- **StoryRefs:** US-3
- **Goal:** Create dashboard page showing credit balance, event list, and action buttons.
- **PrimarySurface:** `UI`
- **Scope:** `apps/dashboard/src/routes/dashboard/`
- **Dependencies:** `T-7`
- **Acceptance:**
  - Shows credit balance with expiry warning
  - Lists events with photo counts
  - "Buy Credits" button links to `/credits/packages`
  - "Create Event" button opens modal
  - Empty state for new users
  - <2s p95 load time
- **Tests:**
  - Component tests for dashboard cards
  - Test empty state rendering
- **Rollout/Risk:**
  - Low risk
```

---

## Repo stack (UI)

### Framework & Build
- **Framework:** React ^19.2.0
- **Build Tool:** Vite ^7.2.4
- **Router:** React Router ^7.10.1
- **TypeScript:** 5.9.2

### Component Library
- **Component System:** shadcn/ui (new-york style)
- **Component Primitives:** Radix UI (@radix-ui/react-slot ^1.2.4)
- **Styling:** Tailwind CSS ^4.1.17
- **CSS Variables:** Yes (cssVariables: true)
- **Base Color:** neutral
- **Icon Library:** Lucide React ^0.556.0

### State Management & Data Fetching
- **Data Fetching:** TanStack Query ^5.90.12
- **API Client:** Hono RPC client (`hc` from `hono/client`)
- **Auth State:** Clerk React SDK (@clerk/clerk-react ^5.58.0)

### Available shadcn/ui Components

From `/packages/ui/src/components/`:
- alert
- avatar
- breadcrumb
- button
- card
- checkbox
- collapsible
- dialog
- dropdown-menu
- empty
- input
- scroll-area
- separator
- sheet
- sidebar
- skeleton
- spinner
- tooltip

### Testing
- **Framework:** Vitest ^3.2.0
- **Test Location:** Co-located with components or in `__tests__` directories

---

## Conventions (must-follow)

### File Locations

From CLAUDE.md and project structure:
- **Dashboard routes:** `apps/dashboard/src/routes/dashboard/`
- **Shared components:** `apps/dashboard/src/components/`
- **Shell components:** `apps/dashboard/src/components/shell/` (sidebar, page-header, nav components)
- **UI components:** Import from `@sabaipics/ui/components/*`
- **API client:** `apps/dashboard/src/lib/api.ts`

### Naming Conventions

- **Route files:** `index.tsx` for main route component
- **Component files:** PascalCase (e.g., `DashboardCard.tsx`)
- **Util files:** camelCase (e.g., `formatDate.ts`)

### Import Patterns

```typescript
// Auth
import { useAuth, useUser } from "@sabaipics/auth/react";

// UI Components
import { Button } from "@sabaipics/ui/components/button";
import { Card, CardHeader, CardTitle, CardContent } from "@sabaipics/ui/components/card";
import { Alert, AlertTitle, AlertDescription } from "@sabaipics/ui/components/alert";
import { Skeleton } from "@sabaipics/ui/components/skeleton";

// Shell Components
import { PageHeader } from "../../components/shell/page-header";

// Utils
import { cn } from "@sabaipics/ui/lib/utils";

// Icons
import { Plus, CreditCard, Calendar } from "lucide-react";

// Data Fetching
import { useQuery } from "@tanstack/react-query";

// API
import { useApiClient } from "../../lib/api";
```

### Form Error Display Pattern

From existing dashboard page:
```typescript
{error && (
  <Alert variant="destructive">
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
  </Alert>
)}
```

### Loading/Empty/Error States

**Loading:**
```typescript
{isLoading && <Skeleton className="h-32 w-full" />}
// Or use spinner from @sabaipics/ui/components/spinner
```

**Empty State:**
```typescript
// Use the Empty component from @sabaipics/ui/components/empty
import { Empty } from "@sabaipics/ui/components/empty";

<Empty
  title="No events yet"
  description="Create your first event to get started"
  action={
    <Button onClick={handleCreate}>
      <Plus className="mr-2 h-4 w-4" />
      Create Event
    </Button>
  }
/>
```

**Error:**
```typescript
{error && (
  <Alert variant="destructive">
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
  </Alert>
)}
```

### Styling

From `docs/tech/ui/index.md`:
- **MUST:** Use Tailwind CSS for all styling
- **MUST:** Use shadcn predefined variables for colors, borders, etc.
- **MUST:** Reuse shadcn components, blocks, examples as much as possible
- **MUST:** Use `cn()` utility for conditional classes

**shadcn CSS Variables (use in Tailwind classes):**
```css
bg-card
bg-background
bg-muted
bg-muted/50
text-foreground
text-muted-foreground
border
rounded-xl
```

**Reference Docs:**
- Components: `docs/shadcn/components`
- Blocks: `docs/shadcn/blocks`
- Examples: `docs/shadcn/examples`

---

## Dashboard API Integration

### Endpoint

From `apps/api/src/routes/dashboard/route.ts`:

**Endpoint:** `GET /dashboard`

**Authentication:** Requires photographer auth + PDPA consent (via `requirePhotographer()` and `requireConsent()` middleware)

**Response Type** (from `apps/api/src/routes/dashboard/types.ts`):
```typescript
export type DashboardResponse = {
  credits: {
    balance: number;
    nearestExpiry: string | null;  // ISO timestamp
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
```

**Success Response (200):**
```json
{
  "data": {
    "credits": {
      "balance": 100,
      "nearestExpiry": "2026-07-10T14:30:00Z"
    },
    "events": [
      {
        "id": "uuid",
        "name": "Wedding 2026",
        "photoCount": 150,
        "faceCount": 45,
        "createdAt": "2026-01-10T10:00:00Z",
        "expiresAt": "2026-02-09T10:00:00Z",
        "startDate": "2026-01-15T00:00:00Z",
        "endDate": "2026-01-15T23:59:59Z"
      }
    ],
    "stats": {
      "totalPhotos": 150,
      "totalFaces": 45
    }
  }
}
```

### API Client Pattern

From `apps/dashboard/src/lib/api.ts`:

```typescript
import { useApiClient } from "../../lib/api";
import { useQuery } from "@tanstack/react-query";

const { getToken } = useApiClient();

const { data, isLoading, error } = useQuery({
  queryKey: ["dashboard"],
  queryFn: async () => {
    const token = await getToken();
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/dashboard`,
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

// Type assertion for response
const dashboardData = data?.data as DashboardResponse | undefined;
```

**Alternative using Hono RPC client:**
```typescript
const { createAuthClient } = useApiClient();

const { data, isLoading, error } = useQuery({
  queryKey: ["dashboard"],
  queryFn: async () => {
    const client = await createAuthClient();
    const response = await client.dashboard.$get();
    if (!response.ok) {
      throw new Error("Failed to fetch dashboard");
    }
    return response.json();
  },
});
```

### Query Configuration

From `apps/dashboard/src/main.tsx`:
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,  // 1 minute
      retry: 1,
    },
  },
});
```

---

## Layout & Shell Pattern

### Current Layout Structure

From `apps/dashboard/src/components/Layout.tsx`:

```typescript
import { Outlet } from "react-router";
import {
  SidebarInset,
  SidebarProvider,
} from "@sabaipics/ui/components/sidebar";
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

**Dashboard page structure:**
```typescript
export function DashboardPage() {
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Dashboard" }]} />
      
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Page content */}
      </div>
    </>
  );
}
```

### Sidebar Navigation

From `apps/dashboard/src/components/shell/app-sidebar.tsx`:

Current nav items:
- Dashboard (`/dashboard`) - active
- Events (`/events`) - placeholder
- Galleries (`/galleries`) - placeholder
- Settings (`/settings`) - placeholder

For T-11, "Buy Credits" button should link to `/credits/packages` (to be implemented in T-12).

### PageHeader Component

From `apps/dashboard/src/components/shell/page-header.tsx`:

```typescript
<PageHeader 
  breadcrumbs={[{ label: "Dashboard" }]}
  // Optional: actions prop for header buttons
/>
```

---

## Security/Auth

### Auth Requirements

From `apps/dashboard/src/App.tsx`:

Dashboard route is wrapped with:
1. **ProtectedRoute:** Checks Clerk authentication
2. **ConsentGate:** Checks PDPA consent

```typescript
<Route
  element={
    <ProtectedRoute>
      <ConsentGate>
        <Layout />
      </ConsentGate>
    </ProtectedRoute>
  }
>
  <Route path="/dashboard" element={<DashboardPage />} />
</Route>
```

### User Context

From `@sabaipics/auth/react`:

```typescript
import { useAuth, useUser } from "@sabaipics/auth/react";

// Auth state
const { userId, isLoaded, isSignedIn, getToken } = useAuth();

// User info
const { user } = useUser();
// user.firstName, user.email, user.imageUrl
```

### Environment Variables

From dashboard README and existing code:
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk publishable key
- `VITE_API_URL` - API base URL

---

## Testing Requirements

### Test Stack

From T-6 tech docs and project conventions:
- **Unit/Component Tests:** Vitest ^3.2.0
- **Test Location:** Co-located or in `__tests__` directories

### Test Cases Required (from tasks.md)

1. **Component tests for dashboard cards**
   - Credit balance card renders correctly
   - Event list card renders correctly
   - Stats cards render correctly

2. **Test empty state rendering**
   - Empty events list shows empty state
   - Zero credits shows appropriate message

### Test Patterns

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardPage } from "./index";

describe("DashboardPage", () => {
  it("renders credit balance", () => {
    // Test implementation
  });

  it("shows empty state for new user", () => {
    // Test implementation
  });
});
```

---

## Must-Follow Rules Summary

### File Organization
- ✅ Route component: `apps/dashboard/src/routes/dashboard/index.tsx`
- ✅ Shell components: Use existing `PageHeader` from `components/shell/`
- ✅ Shared UI: Import from `@sabaipics/ui/components/*`

### Styling Rules
- ✅ Use Tailwind CSS classes only
- ✅ Use shadcn CSS variables (`bg-card`, `text-muted-foreground`, etc.)
- ✅ Use `cn()` utility for conditional classes
- ✅ Follow shadcn new-york style

### Data Fetching
- ✅ Use TanStack Query with `queryKey: ["dashboard"]`
- ✅ Use `useApiClient()` hook for auth
- ✅ Handle loading, error, success states explicitly
- ✅ Use type assertion for API response

### Component Patterns
- ✅ Use PageHeader with breadcrumbs
- ✅ Use Empty component for empty states
- ✅ Use Skeleton for loading states
- ✅ Use Alert for error states
- ✅ Use Card components for content containers

### Performance
- ✅ Target: <2s p95 load time
- ✅ Use TanStack Query caching (1 min staleTime)
- ✅ Consider skeleton loaders for perceived performance

---

## References

- **Task:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/logs/BS_0001_S-1/tasks.md`
- **API Route:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/api/src/routes/dashboard/route.ts`
- **API Types:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/api/src/routes/dashboard/types.ts`
- **Tech Stack:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/tech/TECH_STACK.md`
- **UI Guidelines:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/tech/ui/index.md`
- **Existing Dashboard:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/routes/dashboard/index.tsx`
- **Layout:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/components/Layout.tsx`
- **T-6 Tech Docs:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/docs/logs/BS_0001_S-1/implementation/T-6/context/tech-docs.md`
