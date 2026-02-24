# UI Patterns

## 1. Loading

- **Page load** — Skeleton async parts only. Static chrome (header, nav, buttons) renders immediately.
- **Background refetch** — Invisible. Stale data shown, `staleTime` handles freshness.
- **Mutation pending** — Spinner inside button + disabled.

## 2. Feedback

Pick by: **does the user need to act?** → Alert. **Acknowledgment only?** → Toast.

**Alert (persistent, in-page)**

- `error` — Page/form failure. User must act or fix.
- `warning` — Approaching limits, degraded state.
- `success` — Rare. Onboarding, first-time milestones.
- `info` — System notice, maintenance.

Alert rules:

- Form error → inline below fields, cleared on next submit
- Page error → with retry button (`variant="destructive"`)

**Toast (ephemeral, floating)**

- `toast.error` — Background action failed. Include `description`.
- `toast.warning` — Non-critical caution. Include `description`.
- `toast.success` — Action completed. Title only is fine.
- `toast.info` — Background process update. Title only is fine.

Toast rules:

- Always `bottom-right`
- Error/warning → include `description` for context
- Success/info → title only is fine

## 3. Empty

- **No data (first time)** — `Empty` component + icon `size-8` + CTA button `size="sm"` with icon `mr-1`. Guide user to first action.
- **Filtered no results** — `Empty` component + "Clear filters" button. User caused it, show path back.

## 4. Buttons

- Icon-to-text spacing is always `mr-1`.
- Semantic action buttons use `size="sm"` in empty states and inline contexts.

## 5. Tables

- shadcn `Table` wraps `<table>` in a div with `overflow-x-auto` — native horizontal scroll.
- Set `min-w-[Xpx]` on the `<Table>` to guarantee columns don't crush on narrow screens.
- On mobile, users swipe horizontally. No custom scroll libraries.

## 6. Variants (Glass Style)

All semantic colors use OKLCH tokens: `--destructive`, `--success`, `--warning`, `--info`.

- **Alert** — `bg-<color>/10 border-<color>/30 text-<color>` + `backdrop-blur-md`. In-page, glass effect.
- **Badge** — `bg-<color>/10 text-<color>`. Status indicators.
- **Button** — `bg-<color>/10 hover:bg-<color>/20 text-<color>`. Semantic actions.
- **Toast (Sonner)** — Solid `richColors`. Floating, no glass.
