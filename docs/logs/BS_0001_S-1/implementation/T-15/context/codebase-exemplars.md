# Codebase Exemplars

Task: T-15 — Events UI (list + create modal + QR display)
Root: BS_0001_S-1
Surface: UI (Dashboard - React + Vite)
Date: 2026-01-11

## Primary Surface: UI

Inferred from upstream context: T-15 requires implementing Events UI in the dashboard with:
- Event list display on dashboard/events page
- Create event modal with form validation
- Event detail view with QR code display and download

---

## Exemplar 1: Dashboard Page (Complete Page Pattern)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/routes/dashboard/index.tsx`

**Why relevant:** Shows the complete pattern for a dashboard page with API data fetching, loading/error states, and UI composition including event list rendering.

### Key patterns to copy

1. **Page Structure:**
```tsx
<>
  <PageHeader breadcrumbs={[{ label: "Dashboard" }]}>
    <Button asChild size="sm">
      <Link to="/credits/packages">Buy Credits</Link>
    </Button>
  </PageHeader>
  <div className="flex flex-1 flex-col gap-4 p-4">
    {/* Content */}
  </div>
</>
```

2. **Three-state rendering (Loading/Error/Success):**
```tsx
// Loading State
{isLoading && (
  <>
    <Skeleton className="h-32 w-full rounded-xl" />
    <Skeleton className="h-64 w-full rounded-xl" />
  </>
)}

// Error State
{error && (
  <Alert variant="destructive">
    <AlertCircle className="size-4" />
    <AlertTitle>Error loading dashboard</AlertTitle>
    <AlertDescription className="flex items-center justify-between">
      <span>{error.message}</span>
      <Button onClick={() => refetch()} disabled={isRefetching}>
        {isRefetching ? <Spinner className="mr-2 size-3" /> : <RefreshCw className="mr-2 size-3" />}
        Retry
      </Button>
    </AlertDescription>
  </Alert>
)}

// Success State
{dashboardData && (
  <div className="grid auto-rows-min gap-4 md:grid-cols-3">
    {/* Cards */}
  </div>
)}
```

3. **Event List Pattern (already in dashboard):**
```tsx
{dashboardData.events.length === 0 ? (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Calendar className="size-12 text-muted-foreground" />
      </EmptyMedia>
      <EmptyTitle>No events yet</EmptyTitle>
      <EmptyDescription>
        Create your first event to start organizing and sharing photos
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
) : (
  <div className="space-y-2">
    {dashboardData.events.map((event) => (
      <div
        key={event.id}
        className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
      >
        <div className="flex-1 space-y-1">
          <div className="font-semibold">{event.name}</div>
          <div className="text-sm text-muted-foreground">
            Created {formatDistanceToNow(parseISO(event.createdAt))} ago •
            Expires {formatDistanceToNow(parseISO(event.expiresAt))} from now
          </div>
        </div>
        <div className="flex gap-6 text-center">
          <div>
            <div className="text-2xl font-bold tabular-nums">{event.photoCount}</div>
            <div className="text-xs text-muted-foreground">Photos</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">{event.faceCount}</div>
            <div className="text-xs text-muted-foreground">Faces</div>
          </div>
        </div>
      </div>
    ))}
  </div>
)}
```

4. **Date formatting helpers:**
```tsx
import { formatDistanceToNow, parseISO, differenceInDays } from "date-fns";

// Usage
formatDistanceToNow(parseISO(event.createdAt))  // "5 days"
new Date(event.expiresAt).toLocaleDateString()   // "1/15/2026"
```

---

## Exemplar 2: PDPA Consent Modal (Form + Mutation Pattern)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/routes/onboarding/_components/PDPAConsentModal.tsx`

**Why relevant:** Shows complete modal pattern with form validation, React Query mutation, loading states, and error handling. This is the exact pattern to use for the Create Event modal.

### Key patterns for Create Event Modal

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@sabaipics/auth/react";
import { Button } from "@sabaipics/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sabaipics/ui/components/dialog";
import { Alert, AlertDescription, AlertTitle } from "@sabaipics/ui/components/alert";
import { AlertTriangle } from "lucide-react";
import { Spinner } from "@sabaipics/ui/components/spinner";

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (eventId: string) => void;
}

export function CreateEventModal({ open, onOpenChange, onSuccess }: CreateEventModalProps) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            startDate: startDate || null,
            endDate: endDate || null,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Failed to create event");
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh event lists
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      
      // Reset form
      setName("");
      setStartDate("");
      setEndDate("");
      
      // Close modal and notify parent
      onOpenChange(false);
      onSuccess(data.data.id);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
          <DialogDescription>
            Create a new event to organize and share photos
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {/* Form fields */}
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="text-sm font-medium">
                Event Name *
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={mutation.isPending}
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            </div>
            {/* Date fields... */}
          </div>

          {/* Error state */}
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {mutation.error?.message || "Failed to create event. Please try again."}
              </AlertDescription>
            </Alert>
          )}

          {/* Buttons */}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name || mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Spinner className="mr-2" />
                  Creating...
                </>
              ) : (
                "Create Event"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Exemplar 3: Credit Packages Page (Card Grid + Mutation)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/routes/credits/packages/index.tsx`

**Why relevant:** Shows pattern for displaying items in a grid with action buttons, handling mutations with loading states, and navigating after success.

### Key patterns

1. **Card Grid Layout:**
```tsx
<div className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-3">
  {displayPackages.map((pkg, index) => (
    <Card key={pkg.id} className={isPopular ? "relative border-primary shadow-lg" : ""}>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{pkg.name}</CardTitle>
        <CardDescription>Perfect for getting started</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Content */}
      </CardContent>
      <CardFooter>
        <Button onClick={() => handlePurchase(pkg.id)} disabled={isPending}>
          {isPending ? <><Spinner />Processing...</> : "Buy Now"}
        </Button>
      </CardFooter>
    </Card>
  ))}
</div>
```

2. **Per-item loading state:**
```tsx
const [purchasingPackageId, setPurchasingPackageId] = useState<string | null>(null);

const handlePurchase = async (packageId: string) => {
  setPurchasingPackageId(packageId);
  try {
    const result = await checkoutMutation.mutateAsync({ packageId });
    window.location.href = result.data.checkoutUrl;  // Redirect
  } catch (error) {
    setPurchasingPackageId(null);
  }
};

// In button
const isPurchasing = purchasingPackageId === pkg.id;
disabled={isPurchasing || checkoutMutation.isPending}
```

3. **Empty State Pattern:**
```tsx
{data && displayPackages.length === 0 && (
  <Empty className="mx-auto max-w-md">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <CreditCard className="size-12 text-muted-foreground" />
      </EmptyMedia>
      <EmptyTitle>No packages available</EmptyTitle>
      <EmptyDescription>
        Credit packages are not currently available. Please check back later.
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
)}
```

---

## Exemplar 4: Custom Data Fetching Hook

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/hooks/dashboard/useDashboardData.ts`

**Why relevant:** Shows the pattern for creating custom React Query hooks for API integration.

### Pattern for `useEvents()` hook

```tsx
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";

export interface Event {
  id: string;
  photographerId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  accessCode: string;
  qrCodeUrl: string | null;
  rekognitionCollectionId: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface EventsResponse {
  data: Event[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

interface EventsData {
  data: Event[];
  pagination: EventsResponse["pagination"];
}

export function useEvents(page = 0, limit = 20) {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ["events", page, limit],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/events?page=${page}&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<EventsData>;
    },
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: true,
  });
}
```

---

## Exemplar 5: Custom Mutation Hook

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/hooks/credits/usePurchaseCheckout.ts`

**Why relevant:** Shows the pattern for creating custom mutation hooks with proper error handling.

### Pattern for `useCreateEvent()` hook

```tsx
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "../../lib/api";

interface CreateEventRequest {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
}

interface CreateEventResponse {
  data: {
    id: string;
    photographerId: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    accessCode: string;
    qrCodeUrl: string;
    rekognitionCollectionId: string | null;
    expiresAt: string;
    createdAt: string;
  };
}

interface CreateEventError {
  error: {
    code: string;
    message: string;
  };
}

export function useCreateEvent() {
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async (request: CreateEventRequest) => {
      const token = await getToken();

      if (!token) {
        throw new Error("Not authenticated. Please sign in and try again.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        }
      );

      if (!response.ok) {
        const errorData = (await response.json()) as CreateEventError;
        throw new Error(
          errorData.error?.message ||
            `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return response.json() as Promise<CreateEventResponse>;
    },
  });
}
```

---

## API Response Shapes (from T-13 Events API)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/api/src/routes/events/index.ts`

### GET /events (List)
```typescript
{
  data: [
    {
      id: "uuid",
      name: "Event Name",
      startDate: "2026-01-15T00:00:00.000Z" | null,
      endDate: "2026-01-20T00:00:00.000Z" | null,
      accessCode: "ABC123",
      qrCodeR2Key: "qr/ABC123.png",
      qrCodeUrl: "https://app.com/r2/qr/ABC123.png",
      createdAt: "2026-01-10T12:00:00.000Z",
      expiresAt: "2026-02-09T12:00:00.000Z"
    }
  ],
  pagination: {
    page: 0,
    limit: 20,
    totalCount: 42,
    totalPages: 3,
    hasNextPage: true,
    hasPrevPage: false
  }
}
```

### POST /events (Create)
```typescript
// Request
{
  name: "Event Name",
  startDate: "2026-01-15T00:00:00.000Z" | null,  // optional
  endDate: "2026-01-20T00:00:00.000Z" | null      // optional
}

// Response (201)
{
  data: {
    id: "uuid",
    photographerId: "uuid",
    name: "Event Name",
    startDate: "2026-01-15T00:00:00.000Z" | null,
    endDate: "2026-01-20T00:00:00.000Z" | null,
    accessCode: "ABC123",
    qrCodeUrl: "https://app.com/r2/qr/ABC123.png",
    rekognitionCollectionId: null,
    expiresAt: "2026-02-09T12:00:00.000Z",
    createdAt: "2026-01-10T12:00:00.000Z"
  }
}
```

### GET /events/:id (Single Event)
```typescript
{
  data: {
    id: "uuid",
    photographerId: "uuid",
    name: "Event Name",
    startDate: "2026-01-15T00:00:00.000Z" | null,
    endDate: "2026-01-20T00:00:00.000Z" | null,
    accessCode: "ABC123",
    qrCodeUrl: "https://app.com/r2/qr/ABC123.png",
    rekognitionCollectionId: null,
    expiresAt: "2026-02-09T12:00:00.000Z",
    createdAt: "2026-01-10T12:00:00.000Z"
  }
}
```

### Error Response Shape
```typescript
{
  error: {
    code: "VALIDATION_ERROR" | "NOT_FOUND" | "INVALID_DATE_RANGE" | "ACCESS_CODE_GENERATION_FAILED" | "QR_GENERATION_FAILED",
    message: "Human-readable error message"
  }
}
```

---

## Validation Patterns (from T-13)

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/api/src/routes/events/schema.ts`

```typescript
import { z } from "zod";

export const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});
```

### Client-side validation pattern
```tsx
// In Create Event Modal
const [errors, setErrors] = useState<{ name?: string; dateRange?: string }>({});

const validateForm = () => {
  const newErrors: typeof errors = {};
  
  if (!name.trim()) {
    newErrors.name = "Event name is required";
  } else if (name.length > 200) {
    newErrors.name = "Event name must be less than 200 characters";
  }
  
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    newErrors.dateRange = "Start date must be before or equal to end date";
  }
  
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (validateForm()) {
    mutation.mutate();
  }
};
```

---

## QR Code Display Pattern

### Event Detail Page with QR Display

```tsx
import { QrCode, Download, ExternalLink } from "lucide-react";

function EventDetailPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useEvent(id);
  
  const event = data?.data;
  
  const handleDownloadQR = () => {
    if (!event?.qrCodeUrl) return;
    
    // Download QR image
    fetch(event.qrCodeUrl)
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${event.name}-QR.png`;
        a.click();
        window.URL.revokeObjectURL(url);
      });
  };
  
  return (
    <>
      <PageHeader breadcrumbs={[
        { label: "Events", href: "/events" },
        { label: event?.name || "..." }
      ]} />
      
      <div className="flex flex-1 flex-col gap-4 p-4">
        {event && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* QR Code Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="size-5" />
                  QR Code
                </CardTitle>
                <CardDescription>
                  Share this QR code with guests to let them find their photos
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                {event.qrCodeUrl && (
                  <>
                    <img
                      src={event.qrCodeUrl}
                      alt="Event QR Code"
                      className="w-full max-w-sm rounded-lg border"
                    />
                    <div className="flex gap-2 w-full">
                      <Button
                        onClick={handleDownloadQR}
                        variant="outline"
                        className="flex-1"
                      >
                        <Download className="mr-2 size-4" />
                        Download QR
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        className="flex-1"
                      >
                        <a href={`/search/${event.accessCode}`} target="_blank">
                          <ExternalLink className="mr-2 size-4" />
                          Open Search
                        </a>
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Event Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>Event Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Event Name</div>
                  <div className="font-medium">{event.name}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Access Code</div>
                  <div className="font-mono font-medium">{event.accessCode}</div>
                </div>
                {event.startDate && (
                  <div>
                    <div className="text-sm text-muted-foreground">Event Dates</div>
                    <div className="font-medium">
                      {new Date(event.startDate).toLocaleDateString()}
                      {event.endDate && ` - ${new Date(event.endDate).toLocaleDateString()}`}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-muted-foreground">Expires</div>
                  <div className="font-medium">
                    {formatDistanceToNow(parseISO(event.expiresAt), { addSuffix: true })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
```

---

## Component Library (shadcn/ui via @sabaipics/ui)

All available components:
- `Button` - `@sabaipics/ui/components/button`
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction` - `@sabaipics/ui/components/card`
- `Alert`, `AlertTitle`, `AlertDescription` - `@sabaipics/ui/components/alert`
- `Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyMedia`, `EmptyContent` - `@sabaipics/ui/components/empty`
- `Skeleton` - `@sabaipics/ui/components/skeleton`
- `Spinner` - `@sabaipics/ui/components/spinner`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` - `@sabaipics/ui/components/dialog`
- `PageHeader` - `apps/dashboard/src/components/shell/page-header.tsx`
- `Tooltip`, `TooltipProvider`, `TooltipTrigger`, `TooltipContent` - `@sabaipics/ui/components/tooltip`

Icons from `lucide-react`:
- `Calendar`, `QrCode`, `Download`, `ExternalLink`, `AlertCircle`, `RefreshCw`, `Spinner`, `ImageIcon`, `Smile`, `CreditCard`

---

## Test Patterns

**Current state:** No UI tests exist yet in dashboard (`*.test.tsx` not found).

**Recommended pattern for T-15 (if tests required):**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EventsPage } from "./index";

// Mock API client
vi.mock("../../lib/api", () => ({
  useApiClient: () => ({
    getToken: vi.fn().mockResolvedValue("mock-token"),
  }),
}));

describe("EventsPage", () => {
  it("renders loading state initially", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <EventsPage />
      </QueryClientProvider>
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders event list when data loads", async () => {
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "1", name: "Test Event", accessCode: "ABC123", createdAt: "2026-01-10T12:00:00Z" }
        ],
        pagination: { page: 0, limit: 20, totalCount: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      }),
    });

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <EventsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Test Event")).toBeInTheDocument();
    });
  });

  it("opens create modal when button clicked", async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <EventsPage />
      </QueryClientProvider>
    );

    const createButton = screen.getByText(/create event/i);
    fireEvent.click(createButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
```

---

## Routing Pattern

**File:** `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/App.tsx`

### Add events routes

```tsx
import { EventsPage } from "./routes/events";
import { EventDetailPage } from "./routes/events/[id]";

// Inside Layout route group
<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
  <Route path="/dashboard" element={<DashboardPage />} />
  <Route path="/credits/packages" element={<CreditPackagesPage />} />
  <Route path="/events" element={<EventsPage />} />
  <Route path="/events/:id" element={<EventDetailPage />} />
</Route>
```

---

## Summary: Implementation Checklist for T-15

### 1. Create Custom Hooks
- [ ] `apps/dashboard/src/hooks/events/useEvents.ts` - List events with pagination
- [ ] `apps/dashboard/src/hooks/events/useEvent.ts` - Get single event by ID
- [ ] `apps/dashboard/src/hooks/events/useCreateEvent.ts` - Create event mutation

### 2. Create Event Components
- [ ] `apps/dashboard/src/routes/events/index.tsx` - Events list page
- [ ] `apps/dashboard/src/routes/events/[id]/index.tsx` - Event detail page with QR
- [ ] `apps/dashboard/src/components/events/CreateEventModal.tsx` - Create modal

### 3. UI Features
- [ ] Events list with pagination
- [ ] Empty state for no events
- [ ] Create event modal with name + optional dates
- [ ] Form validation (name required, date range valid)
- [ ] Event detail page with QR display
- [ ] Download QR button
- [ ] Access code display
- [ ] Link to search page (opens in new tab)

### 4. Update Dashboard
- [ ] Update "Create Event" button to open modal (remove disabled state)
- [ ] Add navigation to event detail when clicking event card
- [ ] Invalidate dashboard query after event creation

### 5. Error Handling
- [ ] Loading states (Skeleton)
- [ ] Error states (Alert with retry)
- [ ] Mutation errors (Alert in modal)
- [ ] Form validation errors

### 6. Testing (if required)
- [ ] Component tests for events list
- [ ] Component tests for create modal
- [ ] Test form validation
- [ ] Test API integration

---

## File Paths Reference

| What | Where |
|------|-------|
| Dashboard page | `apps/dashboard/src/routes/dashboard/index.tsx` |
| Credit packages page | `apps/dashboard/src/routes/credits/packages/index.tsx` |
| PDPA modal | `apps/dashboard/src/routes/onboarding/_components/PDPAConsentModal.tsx` |
| Dashboard data hook | `apps/dashboard/src/hooks/dashboard/useDashboardData.ts` |
| Purchase checkout hook | `apps/dashboard/src/hooks/credits/usePurchaseCheckout.ts` |
| API client | `apps/dashboard/src/lib/api.ts` |
| PageHeader | `apps/dashboard/src/components/shell/page-header.tsx` |
| Layout | `apps/dashboard/src/components/Layout.tsx` |
| Events API | `apps/api/src/routes/events/index.ts` |
| Events schema | `apps/api/src/routes/events/schema.ts` |
| UI components | `packages/ui/src/components/*.tsx` |

---

## Common Patterns Summary

1. **Auth Pattern:** `useApiClient()` → `getToken()` → `fetch` with Bearer header
2. **Query Pattern:** `useQuery({ queryKey, queryFn })` with typed response
3. **Mutation Pattern:** `useMutation({ mutationFn, onSuccess })` + query invalidation
4. **Error Shape:** `{ error: { code, message } }` from API
5. **Success Shape:** `{ data: T }` from API
6. **Loading State:** Check `isLoading` before rendering, show `Skeleton`
7. **Error State:** Use `<Alert variant="destructive">` with retry button
8. **Empty State:** Use `<Empty>` component with icon + title + description
9. **Card Layout:** `<Card><CardHeader>...<CardContent>...</Card>`
10. **Page Structure:** `<PageHeader />` + `<div className="flex flex-1 flex-col gap-4 p-4">`
11. **Modal Pattern:** `<Dialog>` with form + mutation + loading states
12. **Date Formatting:** Use `date-fns` (`formatDistanceToNow`, `parseISO`)
