# Tech Docs Context: T-15 Events UI

**Task**: BS_0001_S-1 T-15 - Events UI (List + Create Event form)  
**Root**: BS_0001_S-1  
**Generated**: 2026-01-11

---

## Must-Follow Conventions

### 1. Project Structure

**Monorepo layout**:

```
apps/
  api/               # Hono API on Cloudflare Workers
  dashboard/         # Photographer dashboard (Vite + React)
packages/
  ui/                # Shared shadcn/ui components
  db/                # Drizzle ORM + schema
  auth/              # Clerk authentication
```

**Dashboard structure**:

- Routes: `apps/dashboard/src/routes/<feature>/index.tsx`
- Components: `apps/dashboard/src/components/<category>/<Component>.tsx`
- Hooks: `apps/dashboard/src/hooks/<feature>/use<Feature>.ts`
- Layout: `apps/dashboard/src/components/Layout.tsx` (sidebar wrapper)

**Routing convention** (React Router v7):

- Use `<Layout>` wrapper for sidebar pages
- Protected routes wrapped in `<ProtectedRoute>` + `<ConsentGate>`
- Example from App.tsx:
  ```tsx
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
    <Route path="/events" element={<EventsPage />} /> // T-15 adds this
  </Route>
  ```

---

### 2. API Patterns

**Framework**: Hono v4.10.7 (Cloudflare Workers)

**Request validation**: Zod schemas

- Define schemas in `apps/api/src/routes/<resource>/schema.ts`
- Use `@hono/zod-validator` middleware
- Example:

  ```ts
  import { zValidator } from "@hono/zod-validator";
  import { createEventSchema } from "./schema";

  .post("/", zValidator("json", createEventSchema), async (c) => {
    const body = c.req.valid("json");
    // ...
  })
  ```

**Error response format** (standard envelope):

```ts
{
  error: {
    code: "VALIDATION_ERROR" | "NOT_FOUND" | "FORBIDDEN" | ...,
    message: "Human-readable description"
  }
}
```

**Success response format**:

```ts
{
  data: { ... }  // Single resource
}

{
  data: [...],   // Collection
  pagination: {
    page: number,
    limit: number,
    totalCount: number,
    totalPages: number,
    hasNextPage: boolean,
    hasPrevPage: boolean
  }
}
```

**Pagination convention**:

- Query params: `page` (0-indexed), `limit` (default: 20, max: 100)
- Schema: `z.coerce.number().int().min(0).default(0)` for page
- Order: Most recent first (`desc(events.createdAt)`)

**Authentication middleware**:

```ts
import { requirePhotographer, requireConsent } from "../../middleware";

.get("/", requirePhotographer(), requireConsent(), async (c) => {
  const photographer = c.var.photographer;  // { id, pdpaConsentAt }
  // ...
})
```

**Authorization pattern**:

- Return 404 (not 403) when photographer doesn't own resource (prevents enumeration)
- Example from events API:
  ```ts
  if (event.photographerId !== photographer.id) {
    return c.json(notFoundError(), 404); // NOT 403
  }
  ```

---

### 3. Database (Drizzle ORM)

**Schema location**: `packages/db/src/schema/<table>.ts`

**Events table** (already exists):

```ts
// packages/db/src/schema/events.ts
export const events = pgTable('events', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  photographerId: uuid('photographer_id')
    .notNull()
    .references(() => photographers.id),
  name: text('name').notNull(),
  startDate: timestamptz('start_date'),
  endDate: timestamptz('end_date'),
  accessCode: text('access_code').notNull().unique(),
  qrCodeR2Key: text('qr_code_r2_key'),
  rekognitionCollectionId: text('rekognition_collection_id'),
  expiresAt: timestamptz('expires_at').notNull(),
  createdAt: createdAtCol(),
});
```

**Query patterns**:

```ts
// List with pagination
const eventsList = await db
  .select({ id: events.id, name: events.name, ... })
  .from(events)
  .where(eq(events.photographerId, photographer.id))
  .orderBy(desc(events.createdAt))
  .limit(limit)
  .offset(offset);

// Get single
const [event] = await db
  .select()
  .from(events)
  .where(eq(events.id, id))
  .limit(1);

// Count for pagination
const [countResult] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(events)
  .where(eq(events.photographerId, photographer.id));
```

---

### 4. UI Development

**Styling**: Tailwind CSS v4.1.17

- Use shadcn predefined variables for colors, borders, etc.
- No custom color values (use `bg-card`, `text-muted-foreground`, etc.)

**Component library**: shadcn/ui

- Reuse components from `packages/ui/src/components/*`
- Add new components: `pnpm --filter=@sabaipics/ui ui:add <component>`
- Available components: alert, button, card, empty, skeleton, spinner, tooltip, dialog, input, etc.

**Component imports**:

```tsx
import { Button } from '@sabaipics/ui/components/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@sabaipics/ui/components/card';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@sabaipics/ui/components/empty';
```

**Icons**: lucide-react v0.556.0

```tsx
import { Calendar, Plus, RefreshCw, AlertCircle } from 'lucide-react';
```

**Page structure pattern** (from existing pages):

```tsx
<>
  <PageHeader breadcrumbs={[{ label: "Events" }]}>
    <Button asChild size="sm">
      <Link to="/events/new">
        <Plus className="mr-2 size-4" />
        Create Event
      </Link>
    </Button>
  </PageHeader>

  <div className="flex flex-1 flex-col gap-4 p-4">
    {/* Loading state */}
    {isLoading && <Skeleton ... />}

    {/* Error state */}
    {error && <Alert variant="destructive">...</Alert>}

    {/* Success state */}
    {data && <div>...</div>}
  </div>
</>
```

**State management patterns**:

- Loading: Show `<Skeleton>` components
- Error: Show `<Alert variant="destructive">` with retry button
- Empty: Use `<Empty>` component with icon/title/description
- Refetching: Show spinner in button icon: `{isRefetching ? <Spinner /> : <RefreshCw />}`

**Layout conventions**:

- Cards grid: `grid auto-rows-min gap-4 md:grid-cols-3`
- Responsive typography: `@container/card` with breakpoints (`@[250px]/card:text-3xl`)
- Spacing: `flex flex-1 flex-col gap-4 p-4`

---

### 5. Data Fetching (TanStack Query)

**Hook location**: `apps/dashboard/src/hooks/<feature>/use<Feature>.ts`

**Pattern** (from existing hooks):

```tsx
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api';

export function useEvents() {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/events`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<EventsResponse>;
    },
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: true,
  });
}
```

**Mutations** (for create/update):

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useCreateEvent() {
  const { getToken } = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error?.message || 'Failed to create event');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
```

**Environment variables**:

- API URL: `import.meta.env.VITE_API_URL`

---

### 6. Testing (API)

**Framework**: Vitest v3.2.0 + Hono testClient

**Test file location**: `apps/api/src/routes/<resource>/index.test.ts`

**Pattern** (from events API tests):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { testClient } from 'hono/testing';
import { eventsRouter } from './index';

// Create test app with mocked dependencies
function createTestApp(options: {
  mockDb?: ReturnType<typeof createMockDb>;
  photographer?: { id: string; pdpaConsentAt: string | null } | null;
  hasAuth?: boolean;
}) {
  // Mock DB, auth, environment
  const app = new Hono<Env>()
    .use('/*', (c, next) => {
      c.set('db', () => mockDb);
      c.set('photographer', photographer);
      return next();
    })
    .route('/events', eventsRouter);

  return { app, mockDb };
}

describe('POST /events', () => {
  it('creates event with valid input', async () => {
    const { app } = createTestApp({});
    const client = testClient(app, MOCK_ENV);

    const res = await client.events.$post({
      json: { name: 'Test Event' },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    if ('data' in body) {
      expect(body.data.name).toBe('Test Event');
    }
  });
});
```

**Test coverage**:

- Auth tests (401, 403)
- Validation tests (400)
- Success tests (200, 201)
- Edge cases (404, ownership checks)

---

## API Endpoints (Already Implemented)

### Events API (`apps/api/src/routes/events/index.ts`)

**POST /events** - Create event

- Auth: requirePhotographer(), requireConsent()
- Input: `{ name: string, startDate?: string, endDate?: string }`
- Response 201: `{ data: { id, name, accessCode, qrCodeUrl, ... } }`
- Generates 6-char access code + QR PNG
- Uploads QR to R2 bucket
- Expiry: 30 days from creation

**GET /events** - List events (paginated)

- Auth: requirePhotographer(), requireConsent()
- Query: `page=0&limit=20`
- Response 200: `{ data: [...], pagination: {...} }`
- Ordered by createdAt desc

**GET /events/:id** - Get single event

- Auth: requirePhotographer(), requireConsent()
- Params: `id` (UUID)
- Response 200: `{ data: {...} }`
- Response 404: Not found or not owned by photographer

### Validation Schemas (`apps/api/src/routes/events/schema.ts`)

```ts
export const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const eventParamsSchema = z.object({
  id: z.string().uuid(),
});
```

---

## Dashboard Patterns (Reference Examples)

### Dashboard Page (`apps/dashboard/src/routes/dashboard/index.tsx`)

- Uses `<PageHeader>` with breadcrumbs + action button
- Shows loading state with `<Skeleton>`
- Shows error state with `<Alert variant="destructive">` + retry
- Displays stats cards in grid: `grid auto-rows-min gap-4 md:grid-cols-3`
- Lists recent events (read-only, no pagination UI)

### Credit Packages Page (`apps/dashboard/src/routes/credits/packages/index.tsx`)

- Full-page layout (no sidebar)
- Header with back button: `<Button variant="ghost" size="icon" asChild><Link to="/dashboard"><ArrowLeft /></Link></Button>`
- Cards grid: `grid gap-6 md:grid-cols-3`
- Purchase mutation with loading state: `isPurchasing ? <Spinner /> : <CreditCard />`

---

## Key Files for T-15

**To create**:

1. `apps/dashboard/src/routes/events/index.tsx` - Events list page
2. `apps/dashboard/src/hooks/events/useEvents.ts` - List events query
3. `apps/dashboard/src/hooks/events/useCreateEvent.ts` - Create event mutation
4. Update `apps/dashboard/src/App.tsx` - Add `/events` route

**To reference**:

- API: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/api/src/routes/events/index.ts`
- Schema: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/packages/db/src/schema/events.ts`
- Dashboard example: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/routes/dashboard/index.tsx`
- Packages example: `/Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent4/apps/dashboard/src/routes/credits/packages/index.tsx`

---

## Non-Negotiables

1. **Use existing API** - Do NOT modify events API (already tested and deployed)
2. **Follow routing convention** - Protected route with Layout wrapper
3. **Use shadcn components** - Do NOT write custom UI primitives
4. **Consistent error handling** - Alert + retry button pattern
5. **Loading states** - Skeleton for initial load, Spinner for mutations
6. **Empty states** - Use Empty component with icon/title/description
7. **TanStack Query** - All API calls through useQuery/useMutation
8. **TypeScript** - Proper types for all responses/inputs
9. **No emojis** - Keep UI professional (no decorative emojis)
10. **Tailwind only** - No custom CSS, use utility classes

---

## Design Notes

**List view**:

- Show event name, creation date, expiry date, photo/face counts
- Action buttons: View QR, View Photos (future)
- Empty state: "No events yet" + "Create your first event" CTA

**Create form** (dialog or inline):

- Fields: Event name (required), Start date (optional), End date (optional)
- Validation: Name 1-200 chars, dates must be valid ISO strings
- Success: Redirect to events list or show QR code
- Error: Display validation errors inline

**Date handling**:

- Use `date-fns` for formatting (already in package.json)
- Display: `formatDistanceToNow()` or `format()`
- Input: Consider HTML5 `<input type="datetime-local">` or date picker component

---

## Example Code Snippets

### Page Header with Create Button

```tsx
<PageHeader breadcrumbs={[{ label: 'Events' }]}>
  <Button asChild size="sm">
    <Link to="/events/new">
      <Calendar className="mr-2 size-4" />
      Create Event
    </Link>
  </Button>
</PageHeader>
```

### Event List Item

```tsx
<div className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors">
  <div className="flex-1 space-y-1">
    <div className="font-semibold">{event.name}</div>
    <div className="text-sm text-muted-foreground">
      Created {formatDistanceToNow(parseISO(event.createdAt))} ago • Expires{' '}
      {formatDistanceToNow(parseISO(event.expiresAt))} from now
    </div>
  </div>
  <div className="flex gap-6 text-center">
    <div>
      <div className="text-2xl font-bold tabular-nums">{event.photoCount}</div>
      <div className="text-xs text-muted-foreground">Photos</div>
    </div>
  </div>
</div>
```

### Empty State

```tsx
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
```

---

## Related Tasks

- T-13: Events API (CRUD + QR generation) - **DONE** (merged in PR #22)
- T-18: Gallery API (GET /events/:id/photos) - **DONE** (merged in PR #23)
- T-15: Events UI - **IN PROGRESS** (this task)

---
