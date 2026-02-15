# Data Fetching

## 1. Hook / Component Boundary

**Hook** (data mapping only):
- Map client → wire format (`apiFn`)
- Map wire → client format (`parseResponse`)
- Auth header injection
- `onSuccess`: cache invalidation only

**Component** (UI feedback):
- `onSuccess`: navigate, close modal, toast
- `onError`: show Alert or `toast.error`
- Loading UI: Spinner in button, disabled state
- Empty/error states: declarative from hook return

## 2. Wrappers

- Most hooks go through `useApiQuery` / `useApiMutation` (`src/shared/hooks/rq/`)
- These handle auth injection, error normalization, and response parsing
- Hooks with special constraints (e.g. streaming, non-standard auth, third-party APIs) can use React Query directly
- Errors normalized to `RequestError` discriminated union — see `src/shared/lib/api-error.ts`
- Response types inferred via `InferResponseType<typeof api.endpoint.$method, SuccessStatusCode>`

## 3. File Structure

- Path: `src/shared/hooks/rq/<feature>/<kebab-case>.ts`
- Example: `src/shared/hooks/rq/events/use-create-event.ts`

## 4. Hook Types

Every hook must define and export:
- **Input type** — what the mutation/query accepts
- **Response type** — entry (single item) and/or collection (list) extracted from the API response
- Components import types from the hook, never reach into the API layer

## 5. Query Keys

Hierarchical: `[feature, scope, id?, sub-resource?]`

- `['events', 'list']` — event list
- `['events', 'detail', eventId]` — single event
- `['events', 'detail', eventId, 'photos']` — photos for that event

Invalidation targets the right level:
- Create/delete event → `['events', 'list']`
- Update event → `['events', 'detail', id]`
- Upload photos → `['events', 'detail', id, 'photos']`
- Nuke everything for a feature → `['events']`

## 6. Retry Strategy

- 429, 500, 502, 503 → retryable (max 2)
- All other 4xx → not retryable (client error, won't fix itself)
- Network/unknown errors → retryable
- Global config in `src/dashboard/src/main.tsx` and `src/event/src/main.tsx`

## 7. Example

```ts
// src/shared/hooks/rq/events/use-create-event.ts

import { api } from '@/dashboard/src/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { useApiMutation } from './use-api-mutation';

type CreateEventResponse = InferResponseType<typeof api.events.$post, SuccessStatusCode>;

export type CreateEventInput = { name: string };
export type Event = CreateEventResponse['data'];

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useApiMutation<CreateEventResponse, CreateEventInput>({
    apiFn: (input, opts) => api.events.$post({ json: input }, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
```
