# Tech Docs Scout

Task: `T-19 — Upload dropzone + Gallery UI`
Root: `BS_0001_S-1`
Date: `2026-01-11`

## Stack (UI surface)

- Framework: React ^19.2.0
- Component library: shadcn/ui (new-york style)
- Forms: react-hook-form ^7.70.0 with @hookform/resolvers/zod
- Data fetching: @tanstack/react-query ^5.90.12
- Router: react-router ^7.10.1
- Build tool: Vite ^7.2.4
- Styling: Tailwind CSS ^4.1.17
- Icons: Lucide React ^0.556.0

## Must-follow conventions

### 1. File Organization

- **Routes/pages:** `apps/dashboard/src/routes/<route-path>/index.tsx`
- **Shared components:** `apps/dashboard/src/components/<domain>/<ComponentName>.tsx`
- **Custom hooks:** `apps/dashboard/src/hooks/<domain>/<hookName>.ts`
- **Shared UI primitives:** `packages/ui/src/components/<component-name>.tsx`
- **Schema/validation:** `apps/dashboard/src/lib/<domain>-schema.ts`

### 2. Styling Conventions

- **Required:** Use Tailwind CSS for all styling
- **Required:** Use shadcn predefined CSS variables (e.g., `bg-card`, `text-muted-foreground`, `border-destructive`)
- **Required:** Use `cn()` utility from `@sabaipics/ui/lib/utils` for conditional classes
- **Pattern:** Responsive classes (`sm:`, `md:`, `lg:`) for mobile-first design
- **Reference:** `docs/shadcn/components`, `docs/shadcn/blocks`, `docs/shadcn/examples`

### 3. Component Import Patterns

```tsx
// shadcn/ui components (from packages/ui)
import { Button } from '@sabaipics/ui/components/button';
import { Card, CardHeader, CardTitle, CardContent } from '@sabaipics/ui/components/card';
import { Dialog, DialogContent, DialogHeader } from '@sabaipics/ui/components/dialog';
import { Alert } from '@sabaipics/ui/components/alert';
import { Skeleton } from '@sabaipics/ui/components/skeleton';
import { Badge } from '@sabaipics/ui/components/badge';
import { Spinner } from '@sabaipics/ui/components/spinner';

// Utils
import { cn } from '@sabaipics/ui/lib/utils';

// Icons
import { Upload, Download, X } from 'lucide-react';
```

### 4. Adding New shadcn Components

```bash
# From project root
pnpm --filter=@sabaipics/ui ui:add <component>
# Example: pnpm --filter=@sabaipics/ui ui:add progress
```

### 5. API Client Pattern

**Hook-based with TanStack Query:**

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api';

export function usePhotos(eventId: string | undefined) {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['event', eventId, 'photos'],
    queryFn: async () => {
      if (!eventId) throw new Error('Event ID is required');

      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/events/${eventId}/photos`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    },
    enabled: !!eventId,
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useUploadPhoto() {
  const { getToken } = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, file }: { eventId: string; file: File }) => {
      const token = await getToken();

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/events/${eventId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['event', variables.eventId, 'photos'] });
    },
  });
}
```

**Key patterns:**

- Use `useApiClient()` hook to get `getToken()` function
- Always include `Authorization: Bearer ${token}` header
- Use `import.meta.env.VITE_API_URL` for API base URL
- Handle errors with clear messages (extract from `error.message` if available)
- Invalidate related queries on mutation success
- Use `enabled` flag for conditional queries

### 6. Form Handling Pattern

**With react-hook-form + Zod:**

```tsx
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, 'Required'),
});

type FormData = z.infer<typeof schema>;

export function MyForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });

  const onSubmit = async (data: FormData) => {
    // Handle submission
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <div>
            <Input {...field} aria-invalid={fieldState.invalid} />
            {fieldState.error && (
              <p className="text-sm text-destructive">{fieldState.error.message}</p>
            )}
          </div>
        )}
      />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Spinner className="mr-2 size-4" />}
        Submit
      </Button>
    </form>
  );
}
```

### 7. Loading/Error/Empty States Pattern

```tsx
// Loading state
if (isLoading) {
  return (
    <div className="container mx-auto p-6">
      <Skeleton className="mb-6 h-10 w-32" />
      <Skeleton className="mb-6 h-64 w-full rounded-xl" />
    </div>
  );
}

// Error state
if (error) {
  return (
    <Alert variant="destructive">
      <p className="mb-3">{error.message}</p>
      <Button onClick={() => refetch()} variant="outline" size="sm">
        Try Again
      </Button>
    </Alert>
  );
}

// Empty state
if (!data || data.length === 0) {
  return (
    <div className="flex flex-col items-center gap-4 text-center py-12">
      <ImageIcon className="size-12 text-muted-foreground" />
      <div>
        <h3 className="text-lg font-semibold">No photos yet</h3>
        <p className="text-sm text-muted-foreground">Upload photos to get started</p>
      </div>
    </div>
  );
}
```

### 8. File Upload Conventions

**Client-side validation:**

```tsx
const ACCEPTED_FORMATS = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function validateFile(file: File): string | null {
  if (!ACCEPTED_FORMATS.includes(file.type)) {
    return 'Accepted formats: JPEG, PNG, HEIC, WebP';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Maximum file size is 20MB';
  }
  return null;
}
```

**Upload with FormData:**

```tsx
const formData = new FormData();
formData.append('file', file);

const response = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData, // No Content-Type header (browser sets it automatically)
});
```

**Progress tracking:**

- For T-19, use per-file mutation tracking (no XMLHttpRequest needed for MVP)
- Show "uploading", "processing", "indexed" states from API response

### 9. Routing Pattern

```tsx
// In App.tsx
import { Routes, Route } from 'react-router';

<Route path="/events/:id" element={<EventDetailPage />} />;

// In component
import { useParams } from 'react-router';

const { id } = useParams<{ id: string }>();
```

### 10. Environment Variables

- `VITE_API_URL` — API base URL
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk public key

## Relevant patterns

### From CreateEventModal (T-15)

**Modal with form pattern:**

- Use `Dialog` component from shadcn/ui
- Use `DialogFooter` for action buttons
- Separate form submission from modal control
- Reset form on close
- Show API errors with `Alert` component
- Disable actions during submission

### From EventDetailPage (T-15)

**Page layout pattern:**

- Use breadcrumbs for navigation context
- Use tabs for different views
- Use cards for grouped content sections
- Show loading states with `Skeleton`
- Show errors with retry actions
- Use dropdown menu for actions

### From useCreateEvent hook

**Mutation pattern:**

- Define request/response types
- Extract error messages from API response
- Invalidate related queries on success
- Return full mutation object for loading/error states

## API Integration (from T-16, T-18)

### Upload Endpoint

```
POST /events/:eventId/photos
Headers: Authorization: Bearer <token>
Body: multipart/form-data
  - file: File

Response (success):
{
  "data": {
    "id": "uuid",
    "status": "processing"
  }
}

Response (error):
{
  "error": {
    "code": "VALIDATION_ERROR" | "INSUFFICIENT_CREDITS" | "NOT_FOUND",
    "message": "Human-readable error"
  }
}

Status codes:
- 201: Success
- 400: Validation error (format, size)
- 402: Insufficient credits
- 404: Event not found
- 413: File too large
```

### Gallery Endpoint

```
GET /events/:eventId/photos?cursor=<timestamp>&limit=<number>
Headers: Authorization: Bearer <token>

Response:
{
  "data": [
    {
      "id": "uuid",
      "thumbnailUrl": "https://...",  // 400px via CF Images
      "previewUrl": "https://...",    // 1200px via CF Images
      "downloadUrl": "https://...",   // Presigned R2 URL
      "faceCount": 3,
      "status": "processing" | "indexed",
      "uploadedAt": "2026-01-11T..."
    }
  ],
  "pagination": {
    "nextCursor": "2026-01-11T..." | null,
    "hasMore": true | false
  }
}

Query params:
- cursor: ISO timestamp (optional, for pagination)
- limit: 1-50, default 20
```

## Open questions

- `[DECISION_NEEDED]` Should we use a drag-and-drop library (e.g., react-dropzone) or implement native HTML5 drag-and-drop?
- `[DECISION_NEEDED]` Should we use a lightbox library (e.g., yet-another-react-lightbox) or build custom with Dialog component?
- `[DECISION_NEEDED]` Should we show upload progress using XMLHttpRequest events, or is mutation status sufficient for MVP?
- `[GAP]` No existing example of file input component in the codebase
- `[GAP]` No existing example of image grid/gallery in the codebase
- `[GAP]` No existing example of pagination (cursor-based) in the UI
