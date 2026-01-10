# Implementation Plan

Task: `T-15 — Events UI (list + create modal + QR display)`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-11`
Owner: `Claude (implementv3)`

## Inputs
- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: T-15)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Context reports:
  - `docs/logs/BS_0001_S-1/implementation/T-15/context/upstream-dossier.md`
  - `docs/logs/BS_0001_S-1/implementation/T-15/context/logs-scout.md`
  - `docs/logs/BS_0001_S-1/implementation/T-15/context/tech-docs.md`
  - `docs/logs/BS_0001_S-1/implementation/T-15/context/codebase-exemplars.md`
  - `docs/logs/BS_0001_S-1/implementation/T-15/context/risk-scout.md`

## Goal / non-goals

**Goal:**
- Enable photographers to create events via responsive modal/drawer (Dialog on desktop, Drawer on mobile)
- Create dedicated event list page (`/events`) showing all events in card grid with QR thumbnails
- Create event detail page (`/events/:id`) with tabs (for future use), large QR display, download functionality, and copyable slideshow link
- Use React Hook Form + Zod + shadcn field primitives for form validation
- Support both search and slideshow URLs with copy-to-clipboard functionality

**Non-goals:**
- Event editing/deletion (not in acceptance criteria)
- Slideshow functionality implementation (out of scope, shows "Coming soon")
- Gallery/upload UI (T-19)
- Event sharing features (W-7)

**Updated requirements (from user):**
- Dedicated `/events` page (not just dashboard enhancement)
- Event detail page with tabs in header (future-proofing for Photos/Faces tabs)
- Copyable slideshow link with copy-to-clipboard hook
- React Hook Form + Zod validation (not native state)
- Shadcn-native patterns from `docs/shadcn/` exploration

## Approach (data-driven)

### Architecture

Following shadcn-native patterns from `docs/shadcn/` exploration:

**1. Event Creation Flow**
```
/events or Dashboard -> Click "Create Event" button
                     -> Open responsive CreateEventModal
                        - Desktop: Dialog (full modal)
                        - Mobile: Drawer (bottom sheet)
                     -> Fill form with React Hook Form + Zod validation
                        - Name (required, 1-200 chars)
                        - Start date (optional)
                        - End date (optional, must be >= start if both provided)
                     -> Submit -> POST /events (T-13 API)
                     -> Success -> Close modal + invalidate queries
                     -> Event list refetches -> New event appears
```

**2. Event List Page Flow**
```
Navigate to /events -> Fetch GET /events
                    -> Display grid of event cards (responsive columns)
                    -> Each card shows:
                       - Event name
                       - QR thumbnail (80px x 80px)
                       - Photo/face counts
                       - Created/expiry dates
                    -> Click card -> Navigate to /events/:id
                    -> "Create Event" button in page header
```

**3. Event Detail Flow**
```
/events/:id -> Fetch GET /events/:id (T-13 API)
            -> Display with Tabs component
               - Tab 1: Details (active)
                 - Event info (name, dates, expiry warning)
                 - QR code display (400px x 400px)
                 - Download QR button (fetch+blob)
                 - Search URL (copyable with icon feedback)
                 - Slideshow URL (copyable with icon feedback)
               - Tab 2: Photos (future - T-19)
               - Tab 3: Faces (future)
            -> Back button to /events list
```

**4. Dashboard Integration**
```
Dashboard page (/dashboard) -> Keep existing event list
                            -> "View All Events" link -> Navigate to /events
                            -> Keep "Create Event" button (opens same modal)
```

### File Structure

**New files:**
```
apps/dashboard/src/
  routes/events/
    index.tsx                             # Event list page (grid layout)
    [id]/
      index.tsx                           # Event detail page (with tabs)
  components/events/
    CreateEventModal.tsx                  # Responsive event creation modal/drawer
    EventCard.tsx                         # Reusable event card component
    EventQRDisplay.tsx                    # QR code display with download + copyable links
  hooks/events/
    useEvents.ts                          # Query hook for GET /events
    useEvent.ts                           # Query hook for GET /events/:id
    useCreateEvent.ts                     # Mutation hook for POST /events
  hooks/
    use-copy-to-clipboard.ts              # Copy-to-clipboard hook (if not in packages/ui)
  lib/
    event-form-schema.ts                  # Zod schema for event creation form
```

**Modified files:**
```
apps/dashboard/src/
  routes/dashboard/index.tsx              # Add "View All Events" link
  App.tsx                                 # Add /events and /events/:id routes
```

**Shadcn components to use (from docs/shadcn exploration):**
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` - Event cards
- `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader` - Desktop modal
- `Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerHeader` - Mobile drawer
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` - Event detail tabs
- `Field`, `FieldGroup`, `FieldLabel`, `FieldError` - Form field primitives
- `Input` - Text input for event name
- `Button` - Form submission, download QR, copy links
- `Skeleton` - Loading states
- `Empty`, `EmptyHeader`, `EmptyTitle` - Empty states
- `Spinner` - Loading indicators
- Icons: `IconCopy`, `IconCheck`, `IconDownload`, `IconChevronRight`

### Component Breakdown

**CreateEventModal.tsx**
- **Responsive wrapper:** Dialog on desktop (>640px), Drawer on mobile
- **Form library:** React Hook Form with zodResolver
- **Validation schema:** Zod schema in `lib/event-form-schema.ts`
- **Form fields using shadcn Field primitives:**
  - Name: Text input (required, 1-200 chars)
  - Start date: Date picker (optional)
  - End date: Date picker (optional, validated >= start if both provided)
- **Field structure:**
  ```tsx
  <Controller
    name="name"
    control={form.control}
    render={({ field, fieldState }) => (
      <Field data-invalid={fieldState.invalid}>
        <FieldLabel>Event Name</FieldLabel>
        <Input {...field} />
        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
      </Field>
    )}
  />
  ```
- **Loading state:** Spinner on submit button when `form.formState.isSubmitting`
- **Error state:** Alert component with error message and retry
- **Success:** Close modal, invalidate `['events']` and `['dashboard']` query caches
- **Pattern reference:** `docs/shadcn/examples/form-rhf-complex.tsx`, `docs/shadcn/examples/drawer-dialog.tsx`

**Event List Page (`/events/index.tsx`)**
- **Layout:** PageHeader with "Create Event" button + responsive card grid
- **Grid pattern:** `grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4`
- **Data fetching:** useEvents() hook (GET /events)
- **States:**
  - Loading: Skeleton cards (3-4 placeholders)
  - Error: Alert with retry button
  - Empty: Empty component with "Create your first event" CTA
  - Success: Grid of EventCard components
- **Pattern reference:** `docs/shadcn/blocks/dashboard-01/components/section-cards.tsx`

**EventCard.tsx**
- **Component:** Card with clickable behavior (navigate to detail)
- **Structure:**
  - CardHeader: Event name, created date
  - CardContent: QR thumbnail (80px x 80px)
  - CardFooter: Photo count, face count, expiry date
- **Variants:** Supports both list and grid display
- **Pattern reference:** Existing dashboard event cards + Card component variants

**Event Detail Page (`/events/:id/index.tsx`)**
- **Layout:** PageHeader with back button + Tabs component
- **Tabs structure:**
  - Tab 1: "Details" (default active)
  - Tab 2: "Photos" (disabled, shows "Coming soon" or empty state)
  - Tab 3: "Faces" (disabled, shows "Coming soon" or empty state)
- **Details tab content:**
  - Event info card (name, dates, expiry warning if <7 days)
  - EventQRDisplay component (QR + download + copyable links)
- **Pattern reference:** `docs/shadcn/examples/tabs-demo.tsx`

**EventQRDisplay.tsx**
- **QR image:** `<img>` tag, 400px x 400px, responsive
- **Download button:**
  ```tsx
  <Button onClick={handleDownload} disabled={isDownloading}>
    {isDownloading ? <Spinner /> : <IconDownload />}
    Download QR Code
  </Button>
  ```
- **Copyable URLs:**
  - Search URL with copy button + success feedback (IconCopy → IconCheck)
  - Slideshow URL with copy button + success feedback
  - Pattern:
    ```tsx
    <InputGroup>
      <InputGroupInput value={slideshowUrl} readOnly />
      <InputGroupAddon align="inline-end">
        <InputGroupButton onClick={() => copyToClipboard(slideshowUrl)}>
          {isCopied ? <IconCheck /> : <IconCopy />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
    ```
- **Hook:** `useCopyToClipboard()` from `hooks/use-copy-to-clipboard.ts`
- **Pattern reference:** `docs/shadcn/examples/input-group-button.tsx`, `docs/shadcn/hooks/use-copy-to-clipboard.ts`

**Dashboard Enhancement (`/dashboard`)**
- Keep existing event list display (from T-11)
- Add "View All Events" link/button that navigates to `/events`
- Keep "Create Event" button, wire it to open CreateEventModal
- No major structural changes to dashboard (minimal touchpoints)

### Data Fetching Hooks

**useEvents.ts**
```typescript
// Fetches GET /events
// Returns: { events: Event[], isLoading, error }
// Pattern from: apps/dashboard/src/hooks/dashboard/useDashboardData.ts
```

**useEvent.ts**
```typescript
// Fetches GET /events/:id
// Returns: { event: Event | null, isLoading, error }
// Handles 404 (non-owned event) gracefully
```

**useCreateEvent.ts**
```typescript
// Mutation for POST /events
// Invalidates ['dashboard'] cache on success
// Returns: { mutate, isLoading, error }
// Pattern from: apps/dashboard/src/hooks/credits/usePurchaseCheckout.ts
```

### API Integration (T-13)

**POST /events**
```typescript
Request: {
  name: string;           // required, 1-200 chars
  start_date?: string;    // optional ISO datetime
  end_date?: string;      // optional ISO datetime
}
Response (201): {
  id: string;
  name: string;
  access_code: string;
  qr_code_url: string;    // R2 URL for QR PNG
  start_date?: string;
  end_date?: string;
  expires_at: string;
  created_at: string;
}
Errors:
  400 - Validation failed
  401 - Unauthenticated
  500 - Access code generation / QR upload failure
```

**GET /events**
```typescript
Response: {
  events: Array<{
    id, name, access_code, qr_code_url,
    photo_count, face_count,
    start_date?, end_date?,
    created_at, expires_at
  }>
}
```

**GET /events/:id**
```typescript
Response: { id, name, access_code, qr_code_url, ... }
Errors:
  404 - Event not found or not owned by photographer
```

Reference: `apps/api/src/routes/events/index.ts` (T-13)

### QR Code Handling

**Display:**
- Dashboard list: 80px x 80px thumbnail
- Detail page: 400px x 400px display
- Source: `qr_code_url` from API response

**Download implementation:**
```typescript
const handleDownload = async () => {
  setDownloading(true);
  try {
    const response = await fetch(event.qr_code_url);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(event.name)}-QR.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    // Show error alert
  } finally {
    setDownloading(false);
  }
};
```

Rationale: Fetch+blob approach provides better mobile browser compatibility (iOS Safari, LINE app) vs simple `<a download>` which has limited mobile support.

Reference: risk-scout.md lines 67-84

## Contracts (only if touched)

**UI -> API:**
- POST /events (new usage in CreateEventModal)
- GET /events (new hook, may duplicate data from GET /dashboard)
- GET /events/:id (new hook)

**Router:**
- Add protected route: `/events/:id` in `App.tsx`

**Cache invalidation:**
- After POST /events success: `queryClient.invalidateQueries(['dashboard'])`
- Reason: Dashboard already fetches events via GET /dashboard (T-7), invalidating ensures consistency

## Success path

1. Photographer clicks "Create Event" button on dashboard
2. Modal opens with form (name, start date, end date)
3. Enters "Wedding 2026-01-15", selects dates
4. Clicks "Create" -> POST /events
5. API returns 201 with event data including `qr_code_url`
6. Modal closes, dashboard cache invalidates
7. Dashboard refetches, new event appears in list with QR thumbnail
8. Photographer clicks event card -> navigates to `/events/{id}`
9. Event detail page loads, displays:
   - Event name, dates, expiry (30 days from creation)
   - Access code: `ABC123`
   - QR code image (400px x 400px)
   - Search URL: `https://sabaipics.com/search/ABC123`
   - Slideshow URL: `https://sabaipics.com/event/ABC123/slideshow`
10. Clicks "Download QR" -> QR PNG downloads with filename `Wedding-2026-01-15-QR.png`
11. Prints QR code for distribution at event venue

## Failure modes / edge cases (major only)

**1. Event creation failures**
- **Empty name:** Client-side validation prevents submission, shows "Name is required"
- **Name too long (>200 chars):** Client-side validation shows "Name must be 200 characters or less"
- **Invalid date range (end < start):** Client-side validation shows "End date must be after start date"
- **API errors (500):** Show user-friendly message "Failed to create event. Please try again." with retry button
- **Network timeout:** React Query retry logic (3 attempts), then show error

**2. QR code download failures**
- **QR image 404 (R2 upload failed):** Show placeholder on detail page "QR code unavailable. Please contact support."
- **Network failure during download:** Alert "Download failed. Please try again."
- **Mobile browser blocks download:** iOS Safari may open image in new tab instead of downloading (acceptable fallback)

**3. Event detail page failures**
- **Event not found (404):** Show "Event not found" message with back to dashboard button
- **Non-owned event (404):** Same as above (API returns 404 to prevent enumeration)
- **Network timeout:** Show error alert with retry button

**4. Dashboard integration**
- **Cache desync after creation:** Using `invalidateQueries` ensures refetch, prevents stale data
- **QR thumbnail load failure:** Show fallback icon (image `onError` handler)

**5. Form state bugs**
- **Modal not clearing on close:** Reset form state in `onOpenChange` when closing
- **Loading state stuck:** Ensure `finally` block resets loading state
- **Error persists after retry:** Clear error state when form changes

## Validation plan

**Tests to add:**

Following established pattern from T-6, T-11, T-12 (manual testing, no unit tests):

**Manual testing checklist:**

_Event Creation_
- [ ] Click "Create Event" button opens modal
- [ ] Submit with empty name shows validation error
- [ ] Submit with name >200 chars shows validation error
- [ ] Submit with end date < start date shows validation error
- [ ] Submit with valid data creates event (check dashboard list updates)
- [ ] Submit with only name (no dates) creates event
- [ ] API error (simulate 500) shows error alert with retry
- [ ] Cancel/close modal resets form state
- [ ] Create another event after first succeeds

_Event List Page (`/events`)_
- [ ] Navigate to `/events` from dashboard "View All Events" link
- [ ] Event list displays in responsive grid (1 col mobile, 2 col tablet, 4 col desktop)
- [ ] Each event card shows: name, QR thumbnail, photo/face counts, dates
- [ ] Empty state shows when no events exist
- [ ] Loading state shows skeletons while fetching
- [ ] Click event card navigates to `/events/:id`
- [ ] "Create Event" button in page header works

_Event Detail Page (`/events/:id`)_
- [ ] Navigate from event list card to `/events/:id`
- [ ] Page header shows back button to `/events`
- [ ] Tabs component displays (Details, Photos, Faces)
- [ ] "Details" tab is active by default
- [ ] "Photos" and "Faces" tabs show disabled/coming soon state
- [ ] Event detail page loads and displays all fields
- [ ] QR code image displays (400px x 400px)
- [ ] Copy button for search URL works (icon changes to check mark)
- [ ] Copy button for slideshow URL works (icon changes to check mark)
- [ ] Download QR button downloads PNG with correct filename
- [ ] Back button navigates to `/events` list
- [ ] Direct URL access to `/events/{id}` works
- [ ] Access to non-owned event shows 404 error
- [ ] Invalid event ID shows 404 error

_Dashboard Integration_
- [ ] "View All Events" link/button navigates to `/events`
- [ ] "Create Event" button opens modal
- [ ] Dashboard event list still works (no regressions)

_Mobile Testing (Critical for Thai market)_
- [ ] QR download on iOS Safari (may open in new tab, acceptable)
- [ ] QR download on Android Chrome
- [ ] QR download on LINE in-app browser
- [ ] Scan downloaded QR with iPhone camera -> opens search URL
- [ ] Scan downloaded QR with LINE app QR scanner -> opens search URL
- [ ] Modal form input on iOS (date picker, keyboard behavior)
- [ ] Modal form input on Android
- [ ] QR thumbnail loads on mobile dashboard
- [ ] Event detail page responsive on mobile

_Edge Cases_
- [ ] Create event with very long name (199 chars)
- [ ] Create event with same name as existing event (should succeed, no uniqueness constraint)
- [ ] Create event with start date = end date (should succeed)
- [ ] QR thumbnail fails to load (shows fallback icon)
- [ ] Download QR for event with missing QR image (404 from R2)

**Commands to run:**
```bash
# Build dashboard
pnpm --filter=@sabaipics/dashboard build

# Type check
pnpm --filter=@sabaipics/dashboard typecheck

# Dev mode for manual testing
pnpm dev
```

Note: No automated tests (Vitest not configured for dashboard, established pattern from T-6, T-11, T-12)

## Rollout / rollback

**Environment variables:**
- `VITE_API_URL` - Already configured (dashboard API client)
- `APP_BASE_URL` - Already configured in API (T-13, used for QR URL generation)

**R2 configuration:**
- QR images stored in `PHOTOS_BUCKET` at path `qr/{access_code}.png` (T-13)
- `[NEED_VALIDATION]` R2 public access pattern: T-13 uses `${APP_BASE_URL}/r2/${r2Key}` but R2 proxy endpoint doesn't exist yet
- **Recommendation:** Configure R2 bucket for public read access (QR codes are meant to be public, printed on posters)
- **Alternative:** Create API proxy endpoint `GET /r2/:key` to stream from R2 (adds latency, complexity)

**Deployment:**
1. Merge PR to master
2. Dashboard build runs automatically (GitHub Actions)
3. Deploy to Cloudflare Pages via `pnpm --filter=@sabaipics/dashboard pages:deploy`
4. No API changes (T-13 already deployed)
5. No database migrations (T-1 already deployed)

**Rollback:**
- If critical bug found: revert PR, redeploy dashboard
- API endpoints (T-13) remain functional, no breaking changes
- Event data persists in database, no data loss

**Monitoring:**
- Event creation success/failure rate (Cloudflare Workers analytics)
- QR download clicks (can add client-side analytics if needed)
- Page load performance for `/events/:id` (Cloudflare Pages analytics)

## Open questions

### [CRITICAL] T-13 Events Router Not Mounted

**Issue discovered:** The `eventsRouter` from T-13 is defined in `apps/api/src/routes/events/index.ts` but **never imported or mounted** in `apps/api/src/index.ts`. This means the Events API endpoints (POST /events, GET /events, GET /events/:id) are currently **not accessible**.

**Current state (apps/api/src/index.ts line 62):**
```typescript
.route('/events', photosRouter);  // Only has GET /events/:eventId/photos
```

**Required fix:**
```typescript
import { eventsRouter } from './routes/events';  // Add import

// Then mount both routers (events CRUD + photos gallery)
.route('/events', eventsRouter)    // POST /events, GET /events, GET /events/:id
.route('/events', photosRouter);   // GET /events/:eventId/photos
```

**Must fix this before implementing T-15** - otherwise the UI will have no working API to call.

---

### [RESOLVED] R2 QR URL Access Pattern

**Verified from T-13 implementation:**
- QR URL pattern: `${APP_BASE_URL}/r2/${r2Key}` where `r2Key = qr/${accessCode}.png`
- Example: `https://api.sabaipics.com/r2/qr/ABC123.png`
- TODO comment on line 175-176 indicates this is a placeholder

**Decision:** Use placeholder pattern as-is for now
- T-15 will consume the `qrCodeUrl` field from API responses
- If QR URLs return 404, that's a separate ops/infrastructure issue to fix
- T-15 implementation is not blocked by R2 configuration
- Can add error handling for missing QR images (show placeholder + "Contact support" message)

**No changes needed to plan** - proceed with implementation using the API response `qrCodeUrl` field directly.

### [GAP] Toast/Success Notification

**Issue:** After event creation success, how to provide feedback beyond modal close + list update?

**Options:**
- A) Add toast library (e.g., sonner, react-hot-toast) for success message
- B) Rely on implicit feedback (modal closes, new event appears in list)

**Recommendation:** Option B (implicit feedback)
- Consistent with existing patterns (T-6, T-12 have no toasts)
- Simpler, no new dependency
- Modal close + list update is clear success signal
- Can add toast library later if needed for error notifications

### [GAP] Event Deletion UI

**Issue:** Task acceptance doesn't mention event deletion, but photographers may need to remove test events.

**Recommendation:** Out of scope for T-15 (not in acceptance criteria)
- Can be added later as enhancement
- Would need DELETE /events/:id API endpoint (not implemented in T-13)

### [RESOLVED] Form Validation Library

**Decision:** React Hook Form + Zod + shadcn field primitives

**Rationale:**
- User requirement: Use React Hook Form + Zod + shadcn field primitives
- Shadcn exploration found comprehensive patterns in `docs/shadcn/examples/form-rhf-complex.tsx`
- Establishes pattern for future forms (Photos upload, Face search, etc.)
- Better TypeScript integration with Zod schema
- More robust validation and error handling

**Implementation pattern:**
```typescript
// lib/event-form-schema.ts
import { z } from "zod"

export const eventFormSchema = z.object({
  name: z.string().min(1, "Event name is required").max(200, "Event name must be 200 characters or less"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) >= new Date(data.startDate)
    }
    return true
  },
  {
    message: "End date must be after start date",
    path: ["endDate"],
  }
)

// CreateEventModal.tsx
const form = useForm<z.infer<typeof eventFormSchema>>({
  resolver: zodResolver(eventFormSchema),
  defaultValues: { name: "", startDate: "", endDate: "" },
})
```
