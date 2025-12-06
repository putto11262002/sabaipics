# SabaiPics Dashboard

Photographer dashboard for managing events, uploading photos, and tracking credits.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Vite | 7.2.x | Build tool |
| React | 19.x | UI framework |
| React Router | 7.x | Routing |
| TanStack Query | 5.x | Data fetching |
| Tailwind CSS | 4.x | Styling |
| shadcn/ui | latest | Component library |
| Clerk | 5.x | Authentication |

## Development

### Prerequisites

- Node.js 22+ (required for Vite 7)
- pnpm 9+
- Clerk account with publishable key

### Setup

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

2. Add your Clerk publishable key to `.env`:
   ```
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx
   ```

3. Install dependencies (from monorepo root):
   ```bash
   pnpm install
   ```

4. Start development server:
   ```bash
   # From monorepo root (runs all apps)
   pnpm dev

   # Or just dashboard
   pnpm dev --filter=@sabaipics/dashboard
   ```

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Build for production |
| `pnpm preview` | Preview production build locally |
| `pnpm check-types` | TypeScript type checking |
| `pnpm lint` | ESLint |
| `pnpm pages:dev` | Preview with Wrangler Pages |
| `pnpm pages:deploy` | Deploy to Cloudflare Pages |

## Cloudflare Pages Deployment

### Local Preview

After building, preview with Cloudflare Pages locally:
```bash
pnpm build
pnpm pages:dev
```

This runs `wrangler pages dev dist` which serves your built app on `http://localhost:8788`.

### Deploy to Cloudflare Pages

#### Option 1: CLI Deploy (Direct Upload)

```bash
pnpm pages:deploy
```

This builds and deploys to Cloudflare Pages. First run will prompt to create project.

#### Option 2: Git Integration

1. Push to GitHub/GitLab
2. In Cloudflare Dashboard → Workers & Pages → Create application → Pages
3. Connect repository
4. Configure build settings:
   - **Build command**: `pnpm build`
   - **Build output directory**: `dist`
   - **Root directory**: `apps/dashboard`
5. Add environment variables:
   - `VITE_CLERK_PUBLISHABLE_KEY`

### Environment Variables

Set in Cloudflare Pages dashboard under Settings → Environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key |

## Project Structure

```
apps/dashboard/
├── src/
│   ├── components/
│   │   └── ui/          # shadcn/ui components
│   ├── lib/
│   │   └── utils.ts     # cn() helper
│   ├── App.tsx          # Main app component
│   ├── main.tsx         # Entry point with providers
│   └── index.css        # Tailwind + shadcn/ui theme
├── public/
├── components.json      # shadcn/ui config
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Adding shadcn/ui Components

```bash
cd apps/dashboard
pnpm dlx shadcn@latest add <component>

# Examples:
pnpm dlx shadcn@latest add card
pnpm dlx shadcn@latest add input
pnpm dlx shadcn@latest add dialog
```

## Official Documentation

- [Vite](https://vite.dev/guide/)
- [React Router v7](https://reactrouter.com/)
- [TanStack Query](https://tanstack.com/query/latest)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com/docs)
- [Clerk React](https://clerk.com/docs/react)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
