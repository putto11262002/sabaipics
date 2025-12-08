# SabaiPics

Event photo distribution platform with face recognition for the Thai market.

## Quick Context

- `docs/README.md` - Technical docs index (use cases, flows, API design, data schema)
- `./log/NNN-topic-name.md` - Topic-based changelogs (e.g. `001-monorepo-setup.md`), append-only format grouped by feature/topic

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
- Append changes to `./log/NNN-topic-name.md` (append-only, create new numbered file for new topics)
- Use shadcn CLI for components: `pnpm --filter=@sabaipics/ui ui:add <component>`
