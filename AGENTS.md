This is the rule for for the FastFrame project.

## Quick Context

- `docs/README.md` - Technical docs index (use cases, flows, API design, data schema)

## Monorepo Structure

| Path             | Description                           |
| ---------------- | ------------------------------------- |
| `apps/api`       | Hono API on Cloudflare Workers        |
| `apps/dashboard` | Photographer dashboard (Vite + React) |
| `packages/ui`    | Shared shadcn/ui components           |

## Commands

```bash
pnpm dev                    # All apps
pnpm build                  # Build all
pnpm --filter=@sabaipics/dashboard pages:deploy  # Deploy dashboard
```

## Rules

- Use official docs only - spawn subagents to research

## UI & Styling

- Use tailwindcss v4, and shadcn defined variables for styling
- Lean as much as possible on shadcn components
- Use shadcn CLI for components: `pnpm --filter=@sabaipics/ui ui:add <component>`

## Cloudflare Workers

- NEVER modify the `worker-configuration.d.ts` file directly. Set appropriate env and config in `wrangler.jsonc` and run `cf-typegen` to regenerate the types.

## API Error Handling

**1. neverthrow with Boundary Conversion**

- Use `ResultAsync.fromPromise()` and `Result.fromThrowable()` to convert throwing code to Results at boundaries. Prefer `fromThrowable()` if the inner code cannot be gurantee not to thorw.
- Chain operations with `.andThen()`, `.orElse()`, `.match()` for type-safe error flow

**2. Discriminated Union Errors with Layer Mapping**

- Define typed errors as discriminated unions: `{ type: 'database' | 'storage_failed' | 'not_found' | ... }`
- Map between layers via helper functions: raw errors → `databaseError()` → typed `ServiceError<Context>`
- Each layer adds context and propagates up the stack
