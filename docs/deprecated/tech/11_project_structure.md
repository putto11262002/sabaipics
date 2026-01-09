# Project Structure

**Status:** Draft
**Last Updated:** 2025-12-04

---

## Critical Decision 1: Monorepo

**Decision:** Yes, monorepo with pnpm workspaces + Turborepo

**Why monorepo:**
- Shared TypeScript types between API and frontends
- Shared UI components between Dashboard, Participant Web, Desktop
- Atomic changes across packages
- Single CI/CD pipeline
- Easier dependency management

**Why pnpm:**
- Fastest package manager
- Strict dependency resolution (no phantom deps)
- Efficient disk space (hardlinks)
- Native workspace support

**Why Turborepo:**
- Smart caching (skip unchanged builds)
- Parallel execution
- Works with any package manager
- Simple config

---

## Critical Decision 2: Package Structure

```
facelink/
├── apps/                          # Deployable applications
│   ├── api/                       # Hono on Cloudflare Workers
│   ├── web/                       # Public website (Next.js static)
│   ├── dashboard/                 # Photographer dashboard (React SPA)
│   ├── participant/               # Participant web app (React SPA)
│   └── desktop/                   # Wails desktop app
│
├── packages/                      # Shared libraries
│   ├── db/                        # Database schema + client (Drizzle)
│   ├── types/                     # Shared TypeScript types
│   ├── ui/                        # Shared UI components (shadcn)
│   ├── utils/                     # Shared utilities
│   └── config/                    # Shared configs (ESLint, TypeScript, Tailwind)
│
├── services/                      # External service integrations
│   ├── ftp-server/                # FTP proxy (Go, runs on VPS)
│   └── lightroom-plugin/          # Lightroom plugin (Lua)
│
├── docs/                          # Business documentation (existing)
├── dev/                           # Technical documentation (existing)
│
├── turbo.json                     # Turborepo config
├── pnpm-workspace.yaml            # Workspace definition
├── package.json                   # Root package.json
└── .github/                       # CI/CD workflows
```

---

## Critical Decision 3: App Details

### `apps/api` - Hono API on Cloudflare Workers

```
apps/api/
├── src/
│   ├── index.ts                   # Hono app entry
│   ├── routes/
│   │   ├── auth.ts                # /api/auth/*
│   │   ├── credits.ts             # /api/credits/*
│   │   ├── events.ts              # /api/events/*
│   │   ├── photos.ts              # /api/photos/*
│   │   ├── search.ts              # /api/search
│   │   ├── line.ts                # /api/line/*
│   │   └── webhooks/
│   │       ├── clerk.ts
│   │       ├── stripe.ts
│   │       └── line.ts
│   ├── middleware/
│   │   ├── auth.ts                # Clerk JWT verification
│   │   ├── rate-limit.ts          # Rate limiting
│   │   └── cors.ts
│   ├── services/
│   │   ├── rekognition.ts         # AWS Rekognition client
│   │   ├── r2.ts                  # R2 operations
│   │   ├── stripe.ts              # Stripe operations
│   │   └── line.ts                # LINE Messaging API
│   ├── queue/
│   │   └── photo-processor.ts     # Queue consumer
│   └── lib/
│       ├── errors.ts              # Error codes
│       └── validators.ts          # Zod schemas
├── wrangler.toml                  # Cloudflare Workers config
├── package.json
└── tsconfig.json
```

**Cloudflare bindings:**
- `DB` - D1 or Hyperdrive to Neon
- `R2` - Photo storage bucket
- `QUEUE` - Photo processing queue
- `KV` - Search cache
- `DURABLE_OBJECTS` - Real-time WebSocket

### `apps/web` - Public Website (Next.js Static)

```
apps/web/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Landing page
│   │   ├── pricing/
│   │   ├── features/
│   │   └── contact/
│   └── components/
├── next.config.js                 # Static export config
├── package.json
└── tsconfig.json
```

**Deploy:** Cloudflare Pages (static export)

### `apps/dashboard` - Photographer Dashboard (React SPA)

```
apps/dashboard/
├── src/
│   ├── main.tsx                   # Entry point
│   ├── App.tsx
│   ├── routes/
│   │   ├── events/
│   │   │   ├── index.tsx          # Event list
│   │   │   ├── [id]/
│   │   │   │   ├── index.tsx      # Event detail
│   │   │   │   ├── photos.tsx     # Photo grid
│   │   │   │   ├── access.tsx     # Access codes
│   │   │   │   └── settings.tsx
│   │   │   └── new.tsx            # Create event
│   │   ├── credits/
│   │   ├── settings/
│   │   └── auth/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   │   └── api.ts                 # API client (Hono RPC)
│   └── stores/                    # State management (Zustand)
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

**Deploy:** Cloudflare Pages

### `apps/participant` - Participant Web App (React SPA)

```
apps/participant/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── [code]/                # Access via code
│   │   │   ├── index.tsx          # Gallery landing
│   │   │   ├── search.tsx         # Face search
│   │   │   └── results.tsx        # Search results
│   │   └── auth/
│   │       └── line-callback.tsx  # LINE OAuth callback
│   ├── components/
│   │   ├── Camera.tsx             # Selfie capture
│   │   ├── PhotoGrid.tsx
│   │   └── DownloadButton.tsx
│   ├── hooks/
│   └── lib/
│       └── api.ts
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

**Deploy:** Cloudflare Pages

### `apps/desktop` - Wails Desktop App

```
apps/desktop/
├── frontend/                      # React frontend (similar to dashboard)
│   ├── src/
│   └── ...
├── main.go                        # Wails entry
├── app.go                         # Go backend methods
├── pkg/
│   ├── upload/                    # Upload logic
│   ├── watcher/                   # Folder monitoring
│   └── auth/                      # Clerk auth
├── build/                         # Build outputs
├── wails.json
└── go.mod
```

**Shared code:** Frontend reuses `@facelink/ui` components

---

## Critical Decision 4: Package Details

### `packages/db` - Database Layer

```
packages/db/
├── src/
│   ├── index.ts                   # Export all
│   ├── schema/
│   │   ├── photographers.ts
│   │   ├── participants.ts
│   │   ├── events.ts
│   │   ├── photos.ts
│   │   ├── faces.ts
│   │   ├── credits.ts
│   │   └── index.ts
│   ├── client.ts                  # Drizzle client
│   └── migrations/                # SQL migrations
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

**ORM:** Drizzle (lightweight, edge-compatible)

### `packages/types` - Shared Types

```
packages/types/
├── src/
│   ├── index.ts
│   ├── api.ts                     # API request/response types
│   ├── events.ts                  # Event types
│   ├── photos.ts                  # Photo types
│   ├── credits.ts                 # Credit types
│   └── errors.ts                  # Error code enums
├── package.json
└── tsconfig.json
```

### `packages/ui` - Shared UI Components

```
packages/ui/
├── src/
│   ├── index.ts
│   ├── components/
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   └── ...                    # shadcn components
│   └── lib/
│       └── utils.ts               # cn() helper
├── tailwind.config.ts             # Shared Tailwind config
├── package.json
└── tsconfig.json
```

### `packages/config` - Shared Configs

```
packages/config/
├── eslint/
│   └── index.js                   # Shared ESLint config
├── typescript/
│   └── base.json                  # Base tsconfig
├── tailwind/
│   └── preset.js                  # Tailwind preset
└── package.json
```

---

## Critical Decision 5: Services (Non-Node)

### `services/ftp-server` - FTP Proxy (Go)

```
services/ftp-server/
├── main.go                        # FTP server entry
├── pkg/
│   ├── auth/                      # Validate with API
│   ├── proxy/                     # Stream to API
│   └── health/                    # Health check endpoint
├── Dockerfile
├── docker-compose.yml             # For local dev
└── go.mod
```

**Deploy:** DigitalOcean VPS ($4/month)

### `services/lightroom-plugin` - Lightroom Plugin (Lua)

```
services/lightroom-plugin/
├── FaceLink.lrplugin/
│   ├── Info.lua                   # Plugin manifest
│   ├── FaceLinkExportServiceProvider.lua
│   └── FaceLinkAuth.lua
└── README.md
```

**Distribute:** Manual install / Lightroom marketplace

---

## Critical Decision 6: Root Configuration

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'services/*'
```

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```

### Root `package.json`

```json
{
  "name": "facelink",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "db:generate": "turbo db:generate --filter=@facelink/db",
    "db:migrate": "turbo db:migrate --filter=@facelink/db"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

---

## Critical Decision 7: Package Naming

**Scope:** `@facelink/`

| Package | Name |
|---------|------|
| API | `@facelink/api` |
| Web | `@facelink/web` |
| Dashboard | `@facelink/dashboard` |
| Participant | `@facelink/participant` |
| Desktop | `@facelink/desktop` |
| DB | `@facelink/db` |
| Types | `@facelink/types` |
| UI | `@facelink/ui` |
| Utils | `@facelink/utils` |
| Config | `@facelink/config` |

---

## Critical Decision 8: Dependencies Between Packages

```
                    ┌─────────────────┐
                    │ @facelink/types │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       ┌──────────┐   ┌──────────┐   ┌──────────┐
       │   /db    │   │   /ui    │   │  /utils  │
       └────┬─────┘   └────┬─────┘   └────┬─────┘
            │              │              │
            │    ┌─────────┴─────────┐    │
            │    │                   │    │
            ▼    ▼                   ▼    ▼
       ┌─────────────┐         ┌─────────────┐
       │    /api     │         │  /dashboard │
       └─────────────┘         │ /participant│
                               │   /desktop  │
                               │    /web     │
                               └─────────────┘
```

**Key dependencies:**
- All packages depend on `@facelink/types`
- `@facelink/api` depends on `@facelink/db`
- All frontends depend on `@facelink/ui`
- `@facelink/ui` depends on `@facelink/config` (Tailwind preset)

---

## Critical Decision 9: Environment Variables

### Per-app `.env` files

```
apps/api/.env              # API secrets (Clerk, Stripe, AWS, etc.)
apps/dashboard/.env        # VITE_* public vars
apps/participant/.env      # VITE_* public vars
apps/web/.env.local        # NEXT_PUBLIC_* vars
```

### Shared via Turborepo

```json
// turbo.json
{
  "globalEnv": [
    "NODE_ENV",
    "CLERK_PUBLISHABLE_KEY"
  ]
}
```

### Required Variables

**API (`apps/api/.env`):**
```
# Cloudflare
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=

# Database
DATABASE_URL=

# Auth
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-southeast-1

# LINE
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
```

**Frontend (`apps/dashboard/.env`):**
```
VITE_API_URL=https://api.facelink.app
VITE_CLERK_PUBLISHABLE_KEY=pk_...
```

---

## Critical Decision 10: CI/CD Strategy

### GitHub Actions Workflows

```
.github/workflows/
├── ci.yml                 # Lint, typecheck, test on PR
├── deploy-api.yml         # Deploy API to Workers
├── deploy-web.yml         # Deploy web to Pages
├── deploy-dashboard.yml   # Deploy dashboard to Pages
├── deploy-participant.yml # Deploy participant to Pages
└── release.yml            # Version bump, changelog
```

### Deployment Triggers

| App | Trigger | Target |
|-----|---------|--------|
| API | Push to `main` + changes in `apps/api/` or `packages/` | Cloudflare Workers |
| Web | Push to `main` + changes in `apps/web/` | Cloudflare Pages |
| Dashboard | Push to `main` + changes in `apps/dashboard/` or `packages/ui/` | Cloudflare Pages |
| Participant | Push to `main` + changes in `apps/participant/` or `packages/ui/` | Cloudflare Pages |

### Turborepo Remote Cache

```bash
# Enable remote caching
npx turbo login
npx turbo link
```

---

## Development Workflow

### Initial Setup

```bash
# Clone repo
git clone https://github.com/sabai/facelink.git
cd facelink

# Install dependencies
pnpm install

# Setup environment
cp apps/api/.env.example apps/api/.env
# ... edit .env files

# Run database migrations
pnpm db:migrate

# Start development
pnpm dev
```

### Running Specific Apps

```bash
# All apps
pnpm dev

# Just API
pnpm dev --filter=@facelink/api

# Dashboard + its dependencies
pnpm dev --filter=@facelink/dashboard...

# API + Dashboard
pnpm dev --filter=@facelink/api --filter=@facelink/dashboard
```

### Building

```bash
# Build all
pnpm build

# Build specific app
pnpm build --filter=@facelink/api
```

---

## What's NOT in This Doc

- Detailed CI/CD workflow configs (goes in `.github/`)
- Component library design system (goes in `packages/ui/`)
- API route implementations (goes in `apps/api/`)
- Database migration scripts (goes in `packages/db/`)

---

## References

- `docs/tech/03_tech_decisions.md` - Technology choices
- `dev/tech/03_api_design.md` - API endpoint design
- `dev/tech/05_image_pipeline.md` - Processing pipeline
- `dev/tech/02_auth.md` - Auth patterns
