This is a rule/conventional file for FrameFast - an Event photo distribution platform with face recognition for the Thai market.

## Tech

- `pnpm` for package management
- Flat repo with `tsconfig` paths + Vite aliases (`@/` → `src/`)

## Quick Context

- `docs/README.md` - Technical docs index (use cases, flows, API design, data schema)

## Rules

- Always run build and type check after code changes
- Use official docs only - spawn subagents to research
- Use shadcn CLI for components: `pnpm dlx shadcn@latest add <component> --path src/ui/components/ui`
- `.claude/rules/vc-workflow.md` — Read before any branch, commit, push, or PR operation. Use Graphite (`gt`) stacked PRs, not raw git/gh.

## API Error Handling

**1. neverthrow with Boundary Conversion**

- Use `ResultAsync.fromPromise()` and `Result.fromThrowable()` to convert throwing code to Results at boundaries
- Chain operations with `.andThen()`, `.orElse()`, `.match()` for type-safe error flow

**2. Discriminated Union Errors with Layer Mapping**

- Define typed errors as discriminated unions: `{ type: 'database' | 'storage_failed' | 'not_found' | ... }`
- Map between layers via helper functions: raw errors → `databaseError()` → typed `ServiceError<Context>`
- Each layer adds context and propagates up the stack
