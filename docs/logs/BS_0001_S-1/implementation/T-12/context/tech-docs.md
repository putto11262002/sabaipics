# Tech Docs Scout

Task: T-12 — Credit packages page UI
Root: BS_0001_S-1
Date: 2026-01-10

## Tech Image / high-level governance

The project uses a symlinked `.claude` directory pointing to `/Users/putsuthisrisinlpa/.tools/product/.claude`, which contains:

- Tech Image structure (index, conventions, primitives, data-ownership, ops-release)
- Project bindings in `.claude/rules/**` (api.md, ui.md, data.md, etc.)
- Playbooks and skills (project-independent patterns)

**Gate rubric**:

- GREEN: Fits existing primitives + conventions → proceed
- YELLOW: Unknown touchpoints but likely fits → discovery tasks needed
- RED: Requires new primitive/vendor/infra/security model → open ADR first

**For T-12**: This is a GREEN task - UI-only work using existing React/shadcn/TanStack Query stack, no new primitives needed.

## Project bindings / repo rules

Project bindings exist at `.claude/rules/**` but are mostly placeholders (not yet populated). The actual working conventions are documented in:

- `docs/tech/TECH_STACK.md` (authoritative tech choices)
- `docs/tech/ARCHITECTURE.md` (component roles and interactions)
- `docs/tech/ui/index.md` (UI development guidelines)

## UI conventions (from docs/tech/ui/index.md)

### Stack selection

- **UI framework**: React ^19.2.0
- **Component library**: shadcn/ui (CLI-based component system)
- **Styling**: Tailwind CSS ^4.1.17 with Tailwind utilities (clsx, tailwind-merge, class-variance-authority)
- **Icons**: Lucide React ^0.556.0
- **Animations**: tw-animate-css ^1.4.0
- **Forms**: Not yet specified (infer from existing patterns)
- **Data fetching**: @tanstack/react-query ^5.90.12

### Where to change things (repo mapping)

- **Screens/routes live at**: `apps/dashboard/src/routes/`
- **Shared components live at**: `packages/ui/src/components/`
- **Page layout components**: `apps/dashboard/src/components/shell/` (sidebar, nav, page-header)
- **Hooks live at**: `apps/dashboard/src/hooks/`
- **API utilities**: `apps/dashboard/src/lib/api.ts`

### Conventions (repo-specific)

From existing dashboard code (`apps/dashboard/src/routes/dashboard/index.tsx`):

**Page structure**:

1. Use `<PageHeader>` component with breadcrumbs and action buttons
2. Main content in `<div className="flex flex-1 flex-col gap-4 p-4">`
3. Responsive grid layouts with `md:grid-cols-3` patterns

**Loading states**:

- Use `<Skeleton>` components during initial load
- Show multiple skeletons to match expected content layout
- Example: `<Skeleton className="h-32 w-full rounded-xl" />`

**Error states**:

- Use `<Alert variant="destructive">` with AlertCircle icon
- Include retry button with RefreshCw icon
- Disable retry button during refetch with `isRefetching` state
- Show spinner during retry: `{isRefetching ? <Spinner /> : <RefreshCw />}`

**Empty states**:

- Use `<Empty>` component with EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription
- EmptyMedia variant="icon" with relevant icon (Calendar, CreditCard, etc.)

**Form error display pattern**: Not yet documented (infer from patterns if needed)

**Data fetching pattern**:

- Create custom hooks in `apps/dashboard/src/hooks/<feature>/use<Feature>Data.ts`
- Use TanStack Query's `useQuery` with:
  - `queryKey: ["feature-name"]`
  - `queryFn: async () => { ... }`
  - `staleTime: 1000 * 60` (1 minute)
  - `refetchOnWindowFocus: true` (for Stripe return flows)
- Get token via `useApiClient()` from `lib/api.ts`
- Fetch from `${import.meta.env.VITE_API_URL}/endpoint`
- Type response interfaces in the hook file

**Component patterns**:

- Import shadcn components from `@sabaipics/ui/components/<component-name>`
- Use Lucide icons for UI elements
- Apply container queries with `@container/card` pattern
- Use `tabular-nums` for numeric displays
- Use `formatDistanceToNow` from date-fns for relative timestamps
- Button + Link pattern: `<Button asChild><Link to="...">...</Link></Button>`

## Must-follow patterns

1. **Use shadcn CLI for new components**: `pnpm --filter=@sabaipics/ui ui:add <component>`
2. **Use Tailwind for all styling**: No custom CSS files, use predefined shadcn variables
3. **Reuse shadcn components/blocks/examples**: Check `docs/shadcn/` first
4. **Type-safe API calls**: Use Hono RPC client pattern from `lib/api.ts`
5. **Consistent state handling**: Loading → Error → Success pattern in all pages
6. **Authentication**: All API calls must use token from `useApiClient().getToken()`
7. **Responsive design**: Mobile-first with `md:` breakpoints for desktop
8. **Accessibility**: Use semantic HTML and ARIA patterns from shadcn components
9. **Error handling**: Always provide retry mechanism, never silent failures
10. **Monorepo commands**: Use `pnpm --filter=@sabaipics/dashboard <command>` for dashboard-specific tasks

## Component library usage

**Adding new shadcn components**:

```bash
pnpm --filter=@sabaipics/ui ui:add <component>
```

**Available shadcn components** (already in `packages/ui/src/components/`):

- alert, avatar, breadcrumb, button, card, checkbox, collapsible
- dialog, dropdown-menu, empty, input, scroll-area, separator
- sheet, sidebar, skeleton, spinner, tooltip

**Component import pattern**:

```tsx
import { ComponentName } from '@sabaipics/ui/components/component-name';
```

**Shadcn documentation locations**:

- Components: `docs/shadcn/components/`
- Blocks: `docs/shadcn/blocks/`
- Examples: `docs/shadcn/examples/`

## Data fetching

**Pattern** (from `useDashboardData.ts`):

1. Create hook file: `apps/dashboard/src/hooks/<feature>/use<Feature>Data.ts`

2. Import dependencies:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api';
```

3. Define TypeScript interfaces for response data

4. Implement hook:

```tsx
export function useFeatureData() {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['feature-name'],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/endpoint`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<ResponseType>;
    },
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: true,
  });
}
```

5. Use in component:

```tsx
const { data, isLoading, error, refetch, isRefetching } = useFeatureData();
```

**API client utilities** (from `lib/api.ts`):

- `api`: Base Hono client for unauthenticated requests
- `useApiClient()`: Hook for authenticated API calls
- `createAuthClient(token)`: For non-hook contexts

## Architecture context

**Monorepo structure**:

- `apps/api`: Hono API on Cloudflare Workers
- `apps/dashboard`: Photographer dashboard (Vite + React)
- `packages/ui`: Shared shadcn/ui components

**Dashboard deployment**: Cloudflare Pages via `pnpm --filter=@sabaipics/dashboard pages:deploy`

**API endpoint pattern**: All dashboard requests go through Hono API at `VITE_API_URL`

**Authentication flow**:

- Clerk provides session management
- Dashboard uses `@sabaipics/auth/react` for `useAuth()` hook
- API validates tokens via `@sabaipics/auth` middleware

## Notes

- The `.claude/rules/ui.md` file exists but is a template with placeholders (`…`)
- Real working conventions are in `docs/tech/` (TECH_STACK.md, ARCHITECTURE.md, ui/index.md)
- Existing dashboard code in `apps/dashboard/src/routes/dashboard/index.tsx` is the best reference for UI patterns
- For T-12 (credit packages page), follow the exact same patterns as the dashboard page:
  - PageHeader with breadcrumbs and action buttons
  - Custom hook for data fetching with TanStack Query
  - Loading/Error/Success state handling
  - Responsive card grids with shadcn components
  - Tailwind utilities for styling
- No new tech decisions needed - everything fits existing GREEN patterns
