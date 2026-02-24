# Codebase Exemplars: T-6 (Signup UI + PDPA Consent Modal)

**Surface:** UI (Dashboard)  
**Generated:** 2026-01-10

---

## 1. Primary Exemplars

### 1.1 Signup Page Pattern

**File:** `/apps/dashboard/src/routes/sign-up.tsx`

```tsx
import { SignUp } from '@sabaipics/auth/react';

export function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" afterSignUpUrl="/dashboard" />
    </div>
  );
}
```

**How to copy:**

- Uses `@sabaipics/auth/react` wrapper (not direct Clerk imports)
- Centered layout with `flex min-h-screen items-center justify-center`
- Configures redirect URLs via props

**Why it matters for T-6:**

- T-6 needs to modify `afterSignUpUrl` to go through consent modal flow first
- Must maintain the existing wrapper pattern for auth components

---

### 1.2 Protected Route Pattern

**File:** `/apps/dashboard/src/components/auth/ProtectedRoute.tsx`

```tsx
import { useAuth } from '@sabaipics/auth/react';
import { Navigate, useLocation } from 'react-router';

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

**How to copy:**

- Check `isLoaded` first, show loading state
- Check auth state, redirect if not authenticated
- Use `Navigate` from react-router with `replace` and `state.from`

**Why it matters for T-6:**

- T-6 consent modal needs similar pattern: check consent status before rendering children
- Can create `ConsentGate` following same structure

---

### 1.3 API Client + Authenticated Fetch Pattern

**File:** `/apps/dashboard/src/lib/api.ts`

```tsx
import { hc } from 'hono/client';
import type { AppType } from '@sabaipics/api';
import { useAuth } from '@sabaipics/auth/react';

export const api = hc<AppType>(import.meta.env.VITE_API_URL);

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

**File:** `/apps/dashboard/src/routes/dashboard/index.tsx` (usage example)

```tsx
const { getToken } = useApiClient();

const {
  data: profile,
  isLoading,
  error,
} = useQuery({
  queryKey: ['profile'],
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

**How to copy:**

- Use `useApiClient()` hook to get token
- Use React Query's `useQuery` for fetching, `useMutation` for mutations
- Pattern: `const token = await getToken()` then fetch with Bearer header

**Why it matters for T-6:**

- POST /consent call must follow this pattern
- Use `useMutation` for consent submission

---

## 2. Dialog/Modal Pattern (shadcn/ui Reference)

**Reference:** `/docs/shadcn/examples/dialog-demo.tsx`

```tsx
import { Button } from '@sabaipics/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sabaipics/ui/components/dialog';

export function ConsentModal({ open, onSubmit }) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>PDPA Consent</DialogTitle>
          <DialogDescription>Please review and accept our data processing terms.</DialogDescription>
        </DialogHeader>
        {/* Form content here */}
        <DialogFooter>
          <Button type="submit" onClick={onSubmit}>
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Installation required:**

```bash
pnpm --filter=@sabaipics/ui ui:add dialog checkbox
```

**How to copy:**

- Import Dialog components from `@sabaipics/ui/components/dialog`
- Use controlled `open` prop (no `DialogTrigger` for forced modal)
- Standard structure: DialogHeader > DialogTitle + DialogDescription > content > DialogFooter

---

## 3. Checkbox with Label Pattern (for consent checkbox)

**Reference:** `/docs/shadcn/examples/checkbox-with-text.tsx`

```tsx
import { Checkbox } from '@sabaipics/ui/components/checkbox';

<div className="items-top flex gap-2">
  <Checkbox id="pdpa-consent" checked={agreed} onCheckedChange={setAgreed} />
  <div className="grid gap-1.5 leading-none">
    <label htmlFor="pdpa-consent" className="text-sm leading-none font-medium">
      I accept the PDPA consent terms
    </label>
    <p className="text-muted-foreground text-sm">You agree to our data processing terms.</p>
  </div>
</div>;
```

**How to copy:**

- Checkbox + label in flex container
- Use `onCheckedChange` (not `onChange`) for checkbox state

---

## 4. API Response Shape (from consent endpoint)

**File:** `/apps/api/src/routes/consent.ts`

**Success (201):**

```json
{
  "data": {
    "id": "uuid",
    "consentType": "pdpa",
    "createdAt": "2026-01-10T00:00:00Z"
  }
}
```

**Error - Already consented (409):**

```json
{
  "error": {
    "code": "ALREADY_CONSENTED",
    "message": "PDPA consent already recorded"
  }
}
```

**Error - Not authenticated (401):**

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "..."
  }
}
```

**How to handle in UI:**

- Check `response.ok` before parsing
- 409 is not an error (idempotent) - treat as success
- Show error Alert for 401/403

---

## 5. Test Patterns

### 5.1 API Test Pattern (for reference)

**File:** `/apps/api/src/routes/consent.test.ts`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testClient } from 'hono/testing';

// Mock setup pattern
function createTestApp(options) {
  const { mockDb, photographer, hasAuth } = options;

  const app = new Hono()
    .use('/*', (c, next) => {
      if (hasAuth) c.set('auth', { userId: MOCK_CLERK_ID });
      return next();
    })
    .route('/consent', consentRouter);

  return { app, mockDb };
}

// Test pattern
describe('POST /consent - Happy Path', () => {
  it('creates consent record and returns 201', async () => {
    const { app } = createTestApp({});
    const client = testClient(app);
    const res = await client.consent.$post();

    expect(res.status).toBe(201);
    const body = await res.json();
    if ('data' in body) {
      expect(body.data.consentType).toBe('pdpa');
    }
  });
});
```

### 5.2 UI Testing Notes

**Current state:** No UI tests exist in the dashboard yet (no `*.test.tsx` files found).

**Recommended pattern for T-6:**

- Use Vitest + React Testing Library
- Mock `useAuth` and `useApiClient` hooks
- Test modal state transitions
- Test form validation (checkbox must be checked)

---

## 6. App Entry Pattern

**File:** `/apps/dashboard/src/main.tsx`

```tsx
import { AuthProvider } from '@sabaipics/auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider publishableKey={clerkPubKey}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  </StrictMode>,
);
```

**Why it matters for T-6:**

- Consent state can be tracked via React Query cache
- Or use React context if needed across app

---

## 7. File Locations Summary

| What             | Where                                                   |
| ---------------- | ------------------------------------------------------- |
| Auth pages       | `apps/dashboard/src/routes/sign-*.tsx`                  |
| Route protection | `apps/dashboard/src/components/auth/ProtectedRoute.tsx` |
| API client       | `apps/dashboard/src/lib/api.ts`                         |
| App routing      | `apps/dashboard/src/App.tsx`                            |
| UI components    | `packages/ui/src/components/*.tsx`                      |
| Auth wrappers    | `packages/auth/src/react.ts`                            |
| Consent API      | `apps/api/src/routes/consent.ts`                        |

---

## 8. Required shadcn Components

Install before implementation:

```bash
pnpm --filter=@sabaipics/ui ui:add dialog checkbox
```

These are not yet in the codebase.
