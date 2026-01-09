---
title: "UI Playbook"
topic: "ui"
tech: "web-ui"
techVersion: "unknown"
status: draft
sources:
  - "https://react.dev/"
  - "https://www.w3.org/WAI/standards-guidelines/aria/"
---
## Goal

Define portable UI patterns: forms, data fetching/caching, state, and error UX.

## Trigger conditions

- You are building or changing user-facing UI flows.

## When not to use

- You are only changing server-side behavior with no UI surface.

## Invariants (must always be true)

- User input is validated (client-side where possible, server-side always).
- Loading, empty, and error states exist.
- UI actions are idempotent or clearly prevent double-submits.

## Minimal snippet

```tsx
if (isLoading) return <Spinner />
if (isError) return <ErrorState onRetry={refetch} />
if (!data) return <EmptyState />
```

## Workflow

1) Define UI states (loading/empty/error/success) upfront.
2) Make forms schema-driven and render errors consistently.
3) Keep data fetching cache-aware; define invalidation/refetch rules explicitly.
4) Ensure accessibility basics: keyboard, focus management, ARIA for custom components.

## Checklist

- [ ] Form validation + error display
- [ ] Loading/empty/error states
- [ ] Success feedback and retry path
- [ ] Accessibility basics covered

## Notes

- Repo wiring lives in `.claude/rules/ui.md`.
