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

## API Error Handling

**1. neverthrow with Boundary Conversion**
- Use `ResultAsync.fromPromise()` and `Result.fromThrowable()` to convert throwing code to Results at boundaries
- Chain operations with `.andThen()`, `.orElse()`, `.match()` for type-safe error flow

**2. Discriminated Union Errors with Layer Mapping**
- Define typed errors as discriminated unions: `{ type: 'database' | 'storage_failed' | 'not_found' | ... }`
- Map between layers via helper functions: raw errors → `databaseError()` → typed `ServiceError<Context>`
- Each layer adds context and propagates up the stack
