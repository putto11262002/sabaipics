# Codebase Exemplars

Task: T-12 — Credit packages page UI
Root: BS_0001_S-1
Date: 2026-01-10

## Exemplar 1: Dashboard Page (Complete Page Pattern)

- **File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/routes/dashboard/index.tsx`
- **Purpose:** Shows the complete pattern for a dashboard page with API data fetching, loading/error states, and UI composition
- **Key patterns:**
  - Uses `PageHeader` component with breadcrumbs and action buttons
  - Custom hook (`useDashboardData`) for API integration via React Query
  - Three-state rendering: loading (Skeleton), error (Alert with retry), success (data display)
  - Card-based layout using shadcn/ui components
  - Link to `/credits/packages` route already exists in "Buy Credits" button (line 56)
  - Empty state handling using `Empty` component
  - Inline helper functions for data transformation (e.g., `isExpiringSoon`)
- **Relevant code snippet:**

```tsx
// Pattern: Loading, Error, Success states
{
  isLoading && (
    <>
      <Skeleton className="h-32 w-full rounded-xl" />
    </>
  );
}

{
  error && (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertTitle>Error loading dashboard</AlertTitle>
      <AlertDescription>
        <Button onClick={() => refetch()}>Retry</Button>
      </AlertDescription>
    </Alert>
  );
}

{
  dashboardData && (
    <div className="grid auto-rows-min gap-4 md:grid-cols-3">
      <Card>...</Card>
    </div>
  );
}
```

## Exemplar 2: API Data Fetching Hook

- **File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/hooks/dashboard/useDashboardData.ts`
- **Purpose:** Shows the pattern for creating custom React Query hooks for API integration
- **Key patterns:**
  - Uses `useQuery` from `@tanstack/react-query`
  - Gets authentication token via `useApiClient().getToken()`
  - Constructs API URL using `import.meta.env.VITE_API_URL`
  - Adds `Authorization: Bearer ${token}` header
  - Error handling: throws on non-OK response
  - TypeScript interfaces for request/response shapes
  - Query configuration: `staleTime`, `refetchOnWindowFocus` (useful for Stripe redirect flow)
  - Returns typed response with `{ data: T }` envelope
- **Relevant code snippet:**

```ts
export function useDashboardData() {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<DashboardData>;
    },
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true, // Auto-refresh after Stripe redirect
  });
}
```

## Exemplar 3: Mutation Hook with Error Handling

- **File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/routes/onboarding/_components/PDPAConsentModal.tsx`
- **Purpose:** Shows the pattern for POST requests using React Query mutations
- **Key patterns:**
  - Uses `useMutation` from `@tanstack/react-query`
  - Gets authentication token via `useAuth().getToken()`
  - POST request with Authorization header
  - Error handling: shows error state in UI using `mutation.isError`
  - Success handling: invalidates query cache and calls callback
  - Loading state: disables UI with `mutation.isPending`
  - Button state: shows spinner during mutation
  - Uses `useQueryClient` to invalidate related queries after mutation
- **Relevant code snippet:**

```tsx
const mutation = useMutation({
  mutationFn: async () => {
    const token = await getToken();
    const response = await fetch(`${import.meta.env.VITE_API_URL}/consent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok && response.status !== 409) {
      throw new Error('Failed to submit consent');
    }

    return response.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['consent-status'] });
    onAcceptSuccess();
  },
});

// Usage in button
<Button onClick={() => mutation.mutate()} disabled={!isAgreed || mutation.isPending}>
  {mutation.isPending ? (
    <>
      <Spinner className="mr-2" />
      Accepting...
    </>
  ) : (
    'Accept'
  )}
</Button>;

{
  mutation.isError && (
    <Alert variant="destructive">
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>Failed to submit consent. Please try again.</AlertDescription>
    </Alert>
  );
}
```

## Exemplar 4: Onboarding Page (Complex State Management)

- **File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/routes/onboarding/index.tsx`
- **Purpose:** Shows complex state transitions, polling pattern, and conditional rendering
- **Key patterns:**
  - Multiple useState hooks for state management
  - useEffect for polling with cleanup
  - Multiple conditional UI states (loading, timeout, decline)
  - Navigation using `useNavigate` from react-router
  - Error recovery with retry button
  - Modal integration
  - `Empty` component for loading state with spinner
- **Relevant code snippet:**

```tsx
// Pattern: Conditional rendering based on state
if (hasTimeout) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Alert variant="destructive">...</Alert>
      <Button onClick={handleRetry}>Retry</Button>
    </div>
  );
}

// Loading state
return (
  <Empty className="min-h-screen">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Spinner className="size-5" />
      </EmptyMedia>
      <EmptyTitle>Setting up your account...</EmptyTitle>
    </EmptyHeader>
  </Empty>
);
```

## Exemplar 5: API Route - Credit Packages

- **File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/api/src/routes/credits.ts`
- **Purpose:** Shows the backend API pattern for credit packages and Stripe checkout
- **Key patterns:**
  - GET `/credit-packages` - public endpoint returning active packages
  - POST `/credit-packages/checkout` - authenticated endpoint creating Stripe sessions
  - Middleware: `requirePhotographer()`, `requireConsent()`
  - Request validation (packageId required)
  - Database queries using Drizzle ORM
  - Stripe customer lookup/creation pattern
  - Checkout session creation with metadata
  - Response format: `{ data: { checkoutUrl, sessionId } }`
  - Error responses: `{ error: { code, message } }` with proper HTTP status
- **Relevant code snippet:**

```ts
// GET endpoint (public)
.get("/", async (c) => {
  const db = c.var.db();
  const packages = await db
    .select({
      id: creditPackages.id,
      name: creditPackages.name,
      credits: creditPackages.credits,
      priceThb: creditPackages.priceThb,
    })
    .from(creditPackages)
    .where(eq(creditPackages.active, true))
    .orderBy(asc(creditPackages.sortOrder));

  return c.json({ data: packages });
})

// POST endpoint (authenticated)
.post("/checkout", requirePhotographer(), requireConsent(), async (c) => {
  const photographer = c.var.photographer;
  const body = await c.req.json();
  const packageId = body?.packageId;

  // Validate
  if (!packageId || typeof packageId !== "string") {
    return c.json(
      { error: { code: "INVALID_REQUEST", message: "packageId is required" } },
      400
    );
  }

  // Get package, create/get customer, create checkout session
  const result = await createCheckoutSession({...});

  return c.json({
    data: {
      checkoutUrl: result.url,
      sessionId: result.sessionId,
    },
  });
})
```

## Exemplar 6: Stripe Checkout Integration

- **File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/api/src/lib/stripe/checkout.ts`
- **Purpose:** Shows how to create Stripe checkout sessions with line items
- **Key patterns:**
  - Uses `price_data` for dynamic pricing (no need for pre-created Price objects)
  - Appends `session_id={CHECKOUT_SESSION_ID}` to success URL
  - Metadata attached at both session and line item level
  - `billing_address_collection: "auto"`
  - `allow_promotion_codes: true`
  - Currency in smallest unit (satang for THB)
  - Mode: "payment" for one-time purchases
- **Relevant code snippet:**

```ts
export async function createCheckoutSession({
  stripe,
  customerId,
  lineItems,
  successUrl,
  cancelUrl,
  metadata = {},
  mode = 'payment',
  currency = 'thb',
}: CreateCheckoutParams): Promise<CheckoutSessionResult> {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode,
    line_items: lineItems.map((item) => ({
      price_data: {
        currency,
        unit_amount: item.amount,
        product_data: {
          name: item.name,
          description: item.description,
          metadata: item.metadata,
        },
      },
      quantity: item.quantity,
    })),
    success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    metadata,
    billing_address_collection: 'auto',
    allow_promotion_codes: true,
  });

  return { sessionId: session.id, url: session.url };
}
```

## Shared components available

- **Layout & Navigation:**
  - `PageHeader` - Header with breadcrumbs and action buttons (`apps/dashboard/src/components/shell/page-header.tsx`)
  - `Layout` - Sidebar layout wrapper (`apps/dashboard/src/components/Layout.tsx`)
  - `AppSidebar` - Application sidebar (`apps/dashboard/src/components/shell/app-sidebar.tsx`)

- **UI Components (shadcn/ui via @sabaipics/ui):**
  - `Button` - Primary button component
  - `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardFooter`, `CardAction` - Card layouts
  - `Alert`, `AlertTitle`, `AlertDescription` - Alert messages (variants: default, destructive)
  - `Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyMedia` - Empty states
  - `Skeleton` - Loading placeholders
  - `Spinner` - Loading spinner
  - `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` - Modal dialogs
  - `Checkbox` - Form checkbox
  - `ScrollArea` - Scrollable container
  - All components imported from `@sabaipics/ui/components/*`

- **Icons:**
  - Using `lucide-react` (e.g., `CreditCard`, `AlertCircle`, `RefreshCw`, `ImageIcon`, `Smile`, `Calendar`)

## Test patterns

- **Location:** No test files found in `apps/dashboard/src/**/*.test.*`
- **Pattern:** Testing not yet implemented for dashboard
- **Note:** API tests exist in `apps/api/tests/` (e.g., `stripe.test.ts`, `stripe.integration.ts`) using fixtures

## API integration patterns

- **Authentication:**
  - Use `useApiClient()` hook to get `getToken()` function
  - Add `Authorization: Bearer ${token}` header to all authenticated requests
  - Base URL from `import.meta.env.VITE_API_URL`

- **React Query setup:**
  - QueryClient configured in `main.tsx` with:
    - `staleTime: 1000 * 60` (1 minute default)
    - `retry: 1`
  - Provider wraps entire app
  - React Query DevTools enabled

- **Error handling:**
  - Check `response.ok` and throw Error with status/statusText
  - React Query automatically sets `error` state
  - Display errors using `Alert` component with "destructive" variant
  - Provide retry button that calls `refetch()`

- **Loading states:**
  - Check `isLoading` from useQuery/useMutation
  - Show `Skeleton` components for page loading
  - Show `Spinner` in buttons during mutations
  - Disable interactive elements with `disabled={isPending}`

- **Success states:**
  - Access data via `data?.data` (response envelope pattern)
  - Invalidate queries after mutations using `queryClient.invalidateQueries()`
  - Redirect using `navigate()` from `react-router`

- **API Response Format:**
  - Success: `{ data: T }`
  - Error: `{ error: { code: string, message: string } }`
  - HTTP status codes: 200 (OK), 400 (validation), 403 (forbidden), 404 (not found)

## Routing patterns

- **Router:** Using `react-router` (v7) with `BrowserRouter`
- **Route definition:** Defined in `App.tsx` using `<Routes>` and `<Route>`
- **Protected routes:** Wrap in `<ProtectedRoute>` and `<ConsentGate>` components
- **Navigation:** Use `useNavigate()` hook for programmatic navigation
- **Links:** Use `<Link to="/path">` from `react-router`
- **Layout:** Nested routes render into `<Outlet />` component
- **Current structure:**
  - `/sign-in/*` - Public
  - `/sign-up/*` - Public
  - `/onboarding` - Auth required
  - `/dashboard` - Auth + consent required (inside Layout)
  - Future credit routes should be added inside the Layout route group

## Notes

- The dashboard already has a "Buy Credits" button that links to `/credits/packages` (line 56 of dashboard/index.tsx)
- The API `/credit-packages` endpoint is already implemented and working
- The API `/credit-packages/checkout` endpoint is already implemented with Stripe integration
- Stripe checkout flow returns user to `successUrl` with `session_id` query parameter appended
- The success and cancel URLs are configured as `${origin}/credits/success` and `${origin}/credits/packages` in the API
- No existing UI tests found - testing strategy needs to be established if required
- All pages use the same three-state pattern: loading (Skeleton), error (Alert + retry), success (data)
- TypeScript interfaces should be defined for all API responses
- The app uses Clerk for authentication (`@sabaipics/auth/react`)
- Environment variables are accessed via `import.meta.env.*` (Vite convention)
