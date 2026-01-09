---
title: "API Playbook"
topic: "api"
tech: "http"
techVersion: "unknown"
status: draft
sources:
  - "https://hono.dev/docs/"
  - "https://zod.dev/"
  - "https://httpwg.org/specs/"
---
## Goal

Define portable API patterns: validation, error shape, pagination contracts, and auth boundaries.

## Trigger conditions

- You are defining or changing an HTTP API boundary (server routes, RPC endpoints, webhooks).

## When not to use

- You are working on an internal library boundary only (no HTTP surface).

## Inputs / Outputs

- **Input:** request (body/query/path), auth context
- **Output:** typed response payload or typed error

## Invariants (must always be true)

- Validation happens before side effects.
- Errors are predictable and machine-parseable.
- Pagination is stable (no missing/duplicate items across pages).
- Auth boundaries are explicit (deny by default).

## Minimal snippet

```ts
import { z } from 'zod'

const input = z.object({ id: z.string().uuid() })
const parsed = input.safeParse(req)
if (!parsed.success) return { error: parsed.error.flatten() }
```

## Workflow

1) Define request contract (shape, size limits, required auth).
2) Validate at the boundary (before any side effects).
3) Apply authorization at the narrowest possible scope.
4) Return a consistent error envelope.
5) If listing: choose a pagination contract and document ordering rules.

## Checklist

- [ ] Request validation exists and is tested
- [ ] Error shape follows the chosen contract
- [ ] Auth checks are explicit
- [ ] Pagination contract documented (if list endpoint)

## Notes

- This playbook is repo-agnostic. Repo wiring lives in `.claude/rules/api.md`.
