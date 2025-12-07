# SabaiPics

Event photo distribution platform with face recognition for the Thai market.

## Quick Context

- `docs/README.md` - Technical docs index (use cases, flows, API design, data schema)
- `.session/log/<date>.md` - Daily changelog (e.g. `2025-12-06.md`), you must append to change log every time you make change to the codebase. you MUST append only and include doc URLs or any reference files used during the implementation.

## Monorepo Structure

| Path | Description |
|------|-------------|
| `apps/api` | Hono API on Cloudflare Workers |
| `apps/dashboard` | Photographer dashboard (Vite + React) |
| `packages/ui` | Shared shadcn/ui components |

## Commands

```bash
pnpm dev                    # All apps
pnpm build                  # Build all
pnpm --filter=@sabaipics/dashboard pages:deploy  # Deploy dashboard
```

## Rules

- Use official docs only - spawn subagents to research
- Append changes to `.session/log/<date>.md` (create new file per day, append within day)
- Use shadcn CLI for components: `pnpm --filter=@sabaipics/ui ui:add <component>`
