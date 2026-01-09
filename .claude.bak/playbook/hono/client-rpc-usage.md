---
title: "Hono: Client RPC Usage"
topic: "hono"
tech: "hono"
techVersion: "unknown"
status: draft
sources:
  - "https://hono.dev/docs/"
---
## Goal

Call RPC-style endpoints predictably from a client while preserving contracts and error handling.

## Trigger conditions

- You have a stable server contract (route + request schema + response envelope).

## When not to use

- The API style is not RPC (use the appropriate playbook/topic).

## Minimal snippet

```ts
const res = await fetch('/rpc/hello', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Ada' }),
})
if (!res.ok) throw new Error(`RPC failed: ${res.status}`)
const data = await res.json()
```

## Workflow

1) Centralize the call pattern (headers, auth token, error mapping).
2) Validate/cast the response at the boundary if you need strong guarantees.
3) Surface errors in a consistent UX (retry path, user message).

## Checklist

- [ ] Uses the shared error envelope (maps to user-visible errors)
- [ ] Central call helper exists for headers/auth (if applicable)
- [ ] Response handling is predictable and tested for failures

## Notes

- Repo-specific client wiring belongs in `.claude/rules/ui.md` and `.claude/rules/api.md`.
