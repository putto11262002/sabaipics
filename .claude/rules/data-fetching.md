# Data Fetching

## 1. Hook / Component Boundary

**Hook** (data mapping + cache ownership):
- Map client → wire format (`apiFn`)
- Map wire → client format (`parseResponse`)
- Auth header injection
- `onSuccess`: **ALL** cache invalidation and `removeQueries` — the hook is the single source of truth for "what becomes stale when this mutation succeeds"

**Component** (UI feedback only):
- `.mutate()` / `.mutateAsync()` callbacks: navigate, close modal, toast, reset form
- `onError`: show Alert or `toast.error`
- Loading UI: Spinner in button, disabled state
- Empty/error states: declarative from hook return
- **Never** call `invalidateQueries` or `removeQueries` — that's the hook's job

**Multi-step orchestration** (e.g. upload → poll status → complete):
- When a flow spans multiple hooks (mutation + polling query), the orchestrating hook or component invalidates when the *full flow* completes — this is the one exception where a component may invalidate, because the individual mutation hook doesn't know when the flow is done

## 2. Wrappers

- Most hooks go through `useApiQuery` / `useApiMutation` (`src/shared/hooks/rq/`)
- These handle auth injection, error normalization, and response parsing
- Hooks with special constraints (e.g. streaming, non-standard auth, third-party APIs) can use React Query directly
- Errors normalized to `RequestError` discriminated union — see `src/shared/lib/api-error.ts`
- `RequestError` has a top-level `message: string` — components use `error.message` directly, no helper needed
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
