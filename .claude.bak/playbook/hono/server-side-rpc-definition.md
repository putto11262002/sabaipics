---
title: "Hono: Server-Side RPC Definition"
topic: "hono"
tech: "hono"
techVersion: "unknown"
status: draft
sources:
  - "https://hono.dev/docs/"
  - "https://zod.dev/"
---
## Goal

Define RPC-style endpoints with a clear input contract and predictable outputs, while keeping validation at the boundary.

## Trigger conditions

- You want “function-like” endpoints (command/query) but still deliver over HTTP.
- You need strict request validation and consistent error shaping.

## When not to use

- The system already has a different blessed API style (follow Tech Image + Project Bindings).
- You need streaming/websocket primitives that are not already supported.

## Minimal snippet

```ts
import { Hono } from 'hono'
import { z } from 'zod'

const input = z.object({ name: z.string().min(1) })

const app = new Hono().post('/rpc/hello', async (c) => {
  const parsed = input.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  return c.json({ message: `Hello, ${parsed.data.name}` })
})
```

## Workflow

1) Choose endpoint shape (`/rpc/<verb>` or similar) and name it as an action/query.
2) Define the input schema and validate before side effects.
3) Keep handler logic pure and push IO behind internal helpers.
4) Return typed success payloads and a consistent error envelope.
5) Add auth/permission checks as close to the operation as possible.

## Checklist

- [ ] Input schema exists and is enforced before side effects
- [ ] Handler returns predictable error envelope
- [ ] Auth boundary is explicit (deny by default)
- [ ] Contract is documented (inputs/outputs, status codes)

## Notes

- Repo-specific conventions (routing location, error envelope, auth context) belong in `.claude/rules/api.md`.
