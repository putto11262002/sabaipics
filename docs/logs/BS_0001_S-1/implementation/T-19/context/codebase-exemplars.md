# Codebase Exemplars

Task: `T-19 — Upload dropzone + Gallery UI`
Root: `BS_0001_S-1`
Date: `2026-01-11`

## Exemplar 1: Modal Form with React Hook Form + Zod

**File:** `/apps/dashboard/src/components/events/CreateEventModal.tsx`
**Lines:** 1-176

**Pattern:**

- Dialog wrapper with controlled open/close state
- React Hook Form with Zod resolver for validation
- Controller pattern for form fields with inline error display
- API error handling separate from validation errors
- Loading state with disabled inputs and spinner
- Form reset on modal close
- Success callback closes modal and resets form

**Key takeaways:**

- Use `Dialog` + `DialogContent` + `DialogHeader` + `DialogFooter` from `@sabaipics/ui`
- Validation schema lives in separate file (`lib/event-form-schema.ts`)
- Form errors displayed inline below each field: `{fieldState.error && <p className="text-sm text-destructive">{fieldState.error.message}</p>}`
- API errors displayed in `Alert` component with `variant="destructive"`
- Submit button uses `form="form-id"` pattern to submit from footer
- Loading indicator: `{form.formState.isSubmitting && <Spinner className="mr-2 size-4" />}`

## Exemplar 2: API Integration with React Query (Mutation)

**File:** `/apps/dashboard/src/hooks/events/useCreateEvent.ts`
**Lines:** 1-63

**Pattern:**

- `useMutation` from `@tanstack/react-query` for POST requests
- `useApiClient` hook provides `getToken()` for auth
- Error envelope extraction from API response
- Query invalidation on success to refresh related data
- Typed request/response interfaces
- Structured error handling with fallback messages

**Key takeaways:**

- Auth token from `getToken()` passed in `Authorization: Bearer ${token}` header
- API URL from `import.meta.env.VITE_API_URL`
- Error shape: `{ error: { code: string, message: string } }`
- Success callback invalidates related queries: `queryClient.invalidateQueries({ queryKey: ["events"] })`
- Mutation provides `mutateAsync()` for promise-based usage in components

## Exemplar 3: Data Fetching with Loading/Error/Empty States

**File:** `/apps/dashboard/src/routes/events/index.tsx`
**Lines:** 116-166, 220-258

**Pattern:**

- Three-state rendering: loading → error → data
- Skeleton loaders match layout structure
- Error state with retry button
- Empty state with call-to-action
- "No results" state separate from "no data" state

**Key takeaways:**

- **Loading state:** Render `Skeleton` components matching final layout
  ```tsx
  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }
  ```
- **Error state:** Use `Alert variant="destructive"` + retry button
  ```tsx
  if (error) {
    return (
      <Alert variant="destructive">
        <p className="mb-3">{error.message}</p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </Alert>
    );
  }
  ```
- **Empty state:** Use `Empty` + `EmptyHeader` + `EmptyMedia` + `EmptyTitle` + `EmptyDescription`
- **No results state:** Separate from empty (when filters applied but no matches)

## Exemplar 4: Grid Layout for Cards

**File:** `/apps/dashboard/src/routes/credits/packages/index.tsx`
**Lines:** 127-211

**Pattern:**

- Grid container: `grid w-full max-w-5xl gap-6 md:grid-cols-3`
- Responsive card grid with consistent spacing
- Card highlight pattern (border-primary for featured item)
- Skeleton grid during loading matches final grid layout

**Key takeaways:**

- Grid wrapper: `<div className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-3">`
- Loading skeletons mirror grid: `<Skeleton className="h-96 w-full rounded-xl" />` repeated 3 times
- Card structure: `Card` + `CardHeader` + `CardContent` + `CardFooter`
- Feature highlight: `className={isPopular ? "relative border-primary shadow-lg" : ""}`

## Exemplar 5: Pagination (Cursor-Based from API)

**File:** `/apps/api/src/routes/photos.ts`
**Lines:** 59-100

**Pattern:**

- Cursor-based pagination using timestamp/ID
- Fetch `limit + 1` to determine if more data exists
- Return `nextCursor` and `hasMore` in response
- Client passes `cursor` query param for next page

**Key takeaways:**

- **API contract:**
  ```typescript
  {
    data: Photo[],
    pagination: {
      nextCursor: string | null,
      hasMore: boolean
    }
  }
  ```
- Query: `cursor ? lt(photos.uploadedAt, cursor) : undefined`
- Order: `orderBy(desc(photos.uploadedAt))`
- Trim extra row: `const items = hasMore ? photoRows.slice(0, parsedLimit) : photoRows`
- Next cursor: `items[parsedLimit - 1].uploadedAt`

## Exemplar 6: React Query GET Hook

**File:** `/apps/dashboard/src/hooks/events/useEvent.ts`
**Lines:** 1-42

**Pattern:**

- `useQuery` with typed response
- Conditional execution with `enabled` flag
- Error handling for specific HTTP status codes
- Stale time configuration

**Key takeaways:**

- Query key includes params: `queryKey: ["event", id]`
- Only run when data available: `enabled: !!id`
- Status-specific errors: `if (response.status === 404) throw new Error("Event not found")`
- Cache config: `staleTime: 1000 * 60` (1 minute)

## Exemplar 7: Search + Filter UI Pattern

**File:** `/apps/dashboard/src/routes/events/index.tsx`
**Lines:** 82-114, 189-219

**Pattern:**

- Client-side filtering with `useMemo`
- Search input with icon
- Toggle group for status filters
- Filter combinations (search + status)

**Key takeaways:**

- Search input wrapper: `<div className="relative flex-1 max-w-md">`
- Icon positioning: `<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />`
- Input with icon: `<Input className="pl-10" />`
- Filter logic in `useMemo` with dependencies: `[data?.data, searchQuery, statusFilter]`
- ToggleGroup: `type="single"` for exclusive selection

## Gaps (no exemplar found)

### File Upload / Dropzone

- `[NEED_VALIDATION]` No existing file upload implementation in the dashboard
- Need to implement:
  - Drag-and-drop zone
  - File input handling (`<input type="file" multiple accept="image/*">`)
  - File preview before upload
  - Progress indication
  - Multi-file upload queue
  - FormData construction for multipart upload

### Gallery Grid with Images

- `[NEED_VALIDATION]` No photo grid/gallery component exists yet
- The credits packages page has a card grid (Exemplar 4) but not an image grid
- Need to implement:
  - Responsive image grid (masonry or fixed-ratio)
  - Lazy loading for images
  - Image error handling (broken image fallback)
  - Thumbnail vs. full-size URL handling
  - Selection state (if needed)

### Photo Upload API Call Pattern

- `[NEED_PATTERN]` No existing photo upload hook
- The photo GET endpoint exists (`/apps/api/src/routes/photos.ts`) but upload is separate
- Need to create:
  - `useUploadPhotos` mutation hook
  - FormData with multiple files
  - Upload progress tracking (if supported)
  - Batch upload handling
  - Error handling for individual file failures

## Additional Notes

**API Response Shape (from photos.ts):**

```typescript
{
  data: Array<{
    id: string;
    thumbnailUrl: string;
    previewUrl: string;
    downloadUrl: string;
    faceCount: number | null;
    status: string;
    uploadedAt: string;
  }>,
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  }
}
```

**Available UI Components (from packages/ui):**

- `Empty` + variations (for empty states)
- `Skeleton` (for loading)
- `Alert` (for errors)
- `Dialog` (for modals)
- `Card` + variations (for grid items)
- `Pagination` + variations (for page-based pagination, if needed)
- `Button`, `Input`, `Spinner` (primitives)

**State Management Pattern:**

- React Query for server state
- Local `useState` for UI state (modals, filters, pagination)
- No global state library used
