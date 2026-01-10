# Tech Docs Context for T-6 (Signup UI + PDPA Consent Modal)

Task: T-6 -- Signup UI + PDPA consent modal
Surface: UI
Root ID: BS_0001_S-1

---

## 1. UI Stack & Conventions

### 1.1 Technology Stack (from `/docs/tech/TECH_STACK.md`)

| Technology | Version | Purpose |
|------------|---------|---------|
| React | ^19.2.0 | UI framework |
| React Router | ^7.10.1 | Routing |
| Vite | ^7.2.4 | Build tool |
| TanStack Query | ^5.90.12 | Data fetching & caching |
| Tailwind CSS | ^4.1.17 | Styling framework |
| shadcn/ui | latest (new-york style) | Component library |
| Clerk | @clerk/clerk-react ^5.58.0 | Authentication |
| Lucide React | ^0.556.0 | Icons |

### 1.2 Styling Conventions (from `/docs/tech/ui/index.md`)

MUST follow:
- Use Tailwind CSS for all styling
- Use shadcn predefined variables for colors, borders, etc.
- Reuse shadcn components, blocks, examples as much as possible

Reference docs:
- Components: `docs/shadcn/components`
- Blocks: `docs/shadcn/blocks`
- Examples: `docs/shadcn/examples`

---

## 2. Dashboard App Structure

Location: `apps/dashboard/`

### 2.1 File Structure (from `/apps/dashboard/README.md`)

```
apps/dashboard/
├── src/
│   ├── components/       # Shared components
│   │   ├── auth/         # Auth-related components (ProtectedRoute, etc.)
│   │   └── Layout.tsx    # App layout with header/main
│   ├── lib/
│   │   └── api.ts        # API client (Hono RPC + auth)
│   ├── routes/           # Page components by route
│   │   ├── dashboard/    # Dashboard pages
│   │   ├── sign-in.tsx   # Sign-in page
│   │   └── sign-up.tsx   # Sign-up page
│   ├── App.tsx           # Routes configuration
│   └── main.tsx          # Entry point with providers
├── public/
├── vite.config.ts
└── package.json
```

### 2.2 Provider Hierarchy (from `/apps/dashboard/src/main.tsx`)

```tsx
<StrictMode>
  <AuthProvider publishableKey={clerkPubKey}>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <ReactQueryDevtools />
    </QueryClientProvider>
  </AuthProvider>
</StrictMode>
```

MUST follow:
- Auth provider wraps everything
- QueryClient has `staleTime: 1000 * 60` (1 minute) and `retry: 1`
- Environment variable: `VITE_CLERK_PUBLISHABLE_KEY`

### 2.3 Route Structure (from `/apps/dashboard/src/App.tsx`)

```tsx
<Routes>
  {/* Public routes */}
  <Route path="/sign-in/*" element={<SignInPage />} />
  <Route path="/sign-up/*" element={<SignUpPage />} />

  {/* Protected routes */}
  <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
    <Route path="/dashboard" element={<DashboardPage />} />
    {/* Future routes... */}
  </Route>

  {/* Root redirect */}
  <Route path="/" element={...} />
</Routes>
```

MUST follow:
- Auth pages use `/*` wildcard for Clerk's internal routing
- Protected routes wrapped with `ProtectedRoute` component
- `Layout` component contains `<Outlet />` for nested routes

---

## 3. Clerk Integration Patterns

### 3.1 Auth Package Structure (`packages/auth/`)

The project uses a wrapper package `@sabaipics/auth` around Clerk.

Import patterns:
- React components/hooks: `import { ... } from "@sabaipics/auth/react"`

### 3.2 Exported Components (from `/packages/auth/src/components.tsx`)

```tsx
export {
  SignIn,
  SignUp,
  UserButton,
  SignedIn,
  SignedOut,
} from "@clerk/clerk-react";
```

### 3.3 Auth Hooks (from `/packages/auth/src/hooks.ts`)

Custom hook interfaces (not Clerk's raw types):

```tsx
// useAuth() returns:
interface AuthState {
  userId: string | null;
  sessionId: string | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<void>;
  getToken: (options?: { template?: string }) => Promise<string | null>;
}

// useUser() returns:
interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
  emailAddresses: Array<{ emailAddress: string }>;
}
```

### 3.4 Current Sign-up Page Pattern (from `/apps/dashboard/src/routes/sign-up.tsx`)

```tsx
import { SignUp } from "@sabaipics/auth/react";

export function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        afterSignUpUrl="/dashboard"
      />
    </div>
  );
}
```

MUST follow:
- Use `routing="path"` for path-based routing
- Specify `path` matching the route
- Use `afterSignUpUrl` for post-signup redirect

---

## 4. Protected Route Pattern

From `/apps/dashboard/src/components/auth/ProtectedRoute.tsx`:

```tsx
import { useAuth } from "@sabaipics/auth/react";
import { Navigate, useLocation } from "react-router";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return <div>Loading...</div>; // TODO: skeleton
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
```

T-6 MUST extend this pattern to:
- Check `photographer.pdpaConsentAt` after auth check
- Show PDPA modal if consent not given
- Block dashboard access until consent recorded

---

## 5. API Client Pattern

From `/apps/dashboard/src/lib/api.ts`:

```tsx
import { hc } from "hono/client";
import type { AppType } from "@sabaipics/api";
import { useAuth } from "@sabaipics/auth/react";

// Hook for authenticated API calls
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

MUST follow:
- Use `hc` from `hono/client` for type-safe API calls
- Use `useApiClient()` hook for authenticated requests
- Environment variable: `VITE_API_URL`

---

## 6. shadcn/ui Components Available

From `/packages/ui/`:

### 6.1 Currently Installed

| Component | Path | Use Case |
|-----------|------|----------|
| Button | `@sabaipics/ui/components/button` | Actions, form submit |
| Card | `@sabaipics/ui/components/card` | Content containers |
| Alert | `@sabaipics/ui/components/alert` | Status messages, errors |

### 6.2 Component Import Pattern

```tsx
import { Button } from "@sabaipics/ui/components/button";
import { Card, CardHeader, CardTitle, CardContent } from "@sabaipics/ui/components/card";
import { Alert, AlertTitle, AlertDescription } from "@sabaipics/ui/components/alert";
```

### 6.3 Adding New Components

For T-6, Dialog component is needed for PDPA modal:

```bash
# From packages/ui directory
pnpm --filter=@sabaipics/ui ui:add dialog
```

Or from project root:
```bash
cd packages/ui && pnpm dlx shadcn@latest add dialog
```

### 6.4 shadcn/ui Config (from `/packages/ui/components.json`)

```json
{
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@sabaipics/ui/components",
    "utils": "@sabaipics/ui/lib/utils",
    "hooks": "@sabaipics/ui/hooks",
    "lib": "@sabaipics/ui/lib",
    "ui": "@sabaipics/ui/components"
  }
}
```

### 6.5 Utility Function (from `/packages/ui/src/lib/utils.ts`)

```tsx
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

## 7. Consent API Integration

From `/apps/api/src/routes/consent.ts`:

### 7.1 Endpoint

`POST /consent` - Record PDPA consent

### 7.2 Response Shape

Success (201):
```json
{
  "data": {
    "id": "uuid",
    "consentType": "pdpa",
    "createdAt": "2024-01-10T..."
  }
}
```

Already consented (409):
```json
{
  "error": {
    "code": "ALREADY_CONSENTED",
    "message": "PDPA consent already recorded"
  }
}
```

### 7.3 Implementation Note

The API captures `CF-Connecting-IP` header for audit. The UI does not need to send IP.

---

## 8. TanStack Query Usage Pattern

From `/apps/dashboard/src/routes/dashboard/index.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";

const { getToken } = useApiClient();

const { data, isLoading, error } = useQuery({
  queryKey: ["profile"],
  queryFn: async () => {
    const token = await getToken();
    const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  },
});
```

For mutations (like consent):
```tsx
import { useMutation } from "@tanstack/react-query";

const mutation = useMutation({
  mutationFn: async () => {
    const token = await getToken();
    const response = await fetch(`${import.meta.env.VITE_API_URL}/consent`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) throw new Error("...");
    return response.json();
  },
  onSuccess: () => {
    // Handle success (e.g., redirect to dashboard)
  },
});
```

---

## 9. T-6 Implementation Requirements

From `/docs/logs/BS_0001_S-1/tasks.md`:

### 9.1 Scope

- Location: `apps/dashboard/src/routes/auth/`, `apps/dashboard/src/components/`

### 9.2 Acceptance Criteria

1. `/photographer/signup` shows Clerk SignUp component
2. After signup, PDPA modal appears (blocking)
3. Accept calls `POST /consent`, then redirects to dashboard
4. Decline shows explanation with retry option
5. Session persists across browser restarts (24h)

### 9.3 Tests Required

- E2E test signup flow (mock Clerk)
- Test PDPA modal blocking behavior

### 9.4 Risk Notes

- Medium risk (auth UX)
- Test on mobile browsers (Thai users)

---

## 10. Summary of Must-Follow Rules

### File Locations
- New auth routes: `apps/dashboard/src/routes/auth/`
- New components: `apps/dashboard/src/components/`
- Shared UI: `packages/ui/src/components/`

### Imports
- Auth: `@sabaipics/auth/react`
- UI: `@sabaipics/ui/components/*`
- Utils: `@sabaipics/ui/lib/utils`

### Styling
- Use Tailwind CSS classes
- Use shadcn CSS variables (e.g., `bg-card`, `text-muted-foreground`)
- Use `cn()` utility for conditional classes

### API Calls
- Use `useApiClient()` hook for authenticated requests
- Use TanStack Query for data fetching/mutations
- Handle loading, error, success states

### Components
- Add Dialog via shadcn CLI before implementing modal
- Follow shadcn new-york style
- Use Lucide icons from `lucide-react`

### Auth Flow
- Extend `ProtectedRoute` pattern for consent check
- Use Clerk's `afterSignUpUrl` to control post-signup flow
- Modal must be blocking (prevent dashboard access)
