# Monorepo Setup

## Dashboard Setup

Set up photographer dashboard with Vite 7, React 19, Tailwind CSS v4, shadcn/ui, React Router v7, TanStack Query. Configured for Cloudflare Pages.

**Created:**

- `apps/dashboard/` - Vite React app
- `packages/ui/` - Shared shadcn components

**Docs:**

- https://vite.dev/guide/
- https://tailwindcss.com/docs/installation/vite
- https://ui.shadcn.com/docs/installation/vite
- https://reactrouter.com/
- https://tanstack.com/query/latest
- https://turborepo.com/docs/crafting-your-repository/configuring-tasks
- https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/

---

## API-Dashboard Integration

Connected dashboard to API with typed Hono RPC client.

**Changes:**

- `apps/api` - Renamed to `@sabaipics/api`, added `/health`, port 8081, exports `AppType`
- `apps/dashboard` - Added `hono` client, TanStack Query health fetch, env vars

**Key pattern:** Use method chaining for Hono type inference:

```typescript
const app = new Hono().get('/health', (c) => c.json({ status: 'ok' }));
export type AppType = typeof app;
```

**Docs:**

- https://hono.dev/docs/guides/rpc
- https://vite.dev/guide/env-and-mode
- https://developers.cloudflare.com/pages/functions/wrangler-configuration/

---

## Turbo Task Dependencies

Added `^build` dependency to `check-types` task so dashboard waits for API types.

**Changed:** `turbo.json` - `check-types.dependsOn: ["^build", "^check-types"]`

**Docs:**

- https://turborepo.com/docs/crafting-your-repository/configuring-tasks

---

## CORS Configuration

Added CORS middleware to API with env-injected origin.

**Changes:**

- `apps/api/wrangler.jsonc` - Added `CORS_ORIGIN` var
- `apps/api/src/index.ts` - Added `cors()` middleware with `Bindings` type for env vars

**Docs:**

- https://hono.dev/docs/middleware/builtin/cors
- https://developers.cloudflare.com/workers/configuration/environment-variables/

---

## Wrangler to Root

Moved wrangler from individual packages to root devDependencies.

**Changes:**

- `package.json` - Added `wrangler: ^4.20.0` (resolved to 4.53.0)
- Removed wrangler from individual packages

**Why:** Single version across monorepo, smaller node_modules, easier updates.

---

## Vite Watch for Workspace Packages

Configured Vite to watch `@sabaipics/ui` and `@sabaipics/api` for live reload during dev.

**Changed:** `apps/dashboard/vite.config.ts`

- `server.watch.ignored: ["!**/node_modules/@sabaipics/**"]`
- `optimizeDeps.exclude: ["@sabaipics/ui", "@sabaipics/api"]`

---

## shadcn Monorepo Setup

Rebuilt `packages/ui` following official shadcn monorepo guide.

**Structure:**

```
packages/ui/
├── src/
│   ├── components/    # shadcn components
│   ├── hooks/
│   ├── lib/utils.ts
│   └── styles/globals.css
├── components.json
└── package.json
```

**Adding components:**

```bash
pnpm --filter=@sabaipics/ui ui:add <component>
```

**Docs:**

- https://ui.shadcn.com/docs/monorepo

---

## Deploy Script

Added `pnpm run deploy:prod` at root to deploy all services.

**Order:**

1. Build all packages (turbo)
2. Deploy API (worker must be up before dashboard calls it)
3. Deploy Dashboard (pages)
