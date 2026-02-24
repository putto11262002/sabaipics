# Tech Stack

## Monorepo & Build System

- Package Manager: pnpm ^9.0.0
- Build System: Turbo ^2.6.3
- TypeScript: 5.9.2
- Node.js: >= 20.0.0
- Code Formatting: Prettier ^3.6.2

## API (`apps/api`)

### Runtime & Framework

- Runtime: Cloudflare Workers (compatibility_date: 2025-12-06)
- Web Framework: Hono ^4.10.7
- CLI: Wrangler ^4.20.0

### Core Libraries

- Validation: Zod ^4.1.13
- Webhooks: Svix ^1.82.0
- Face Recognition: @aws-sdk/client-rekognition ^3.946.0

### Testing

- Test Framework: Vitest ^3.2.0
- Workers Testing: @cloudflare/vitest-pool-workers ^0.10.14
- Build Tool: Vite 6
- Mocking: aws-sdk-client-mock ^4.1.0

### Infrastructure (Cloudflare)

- Storage: R2 Buckets
- Async Processing: Queues
- Rate Limiting: Durable Objects
- Regions: us-west-2 (AWS)

## Dashboard (`apps/dashboard`)

### Frontend Framework

- UI Library: React ^19.2.0
- Router: React Router ^7.10.1
- Build Tool: Vite ^7.2.4
- Bundler Plugin: @vitejs/plugin-react ^5.1.1

### Styling

- CSS Framework: Tailwind CSS ^4.1.17
- Vite Plugin: @tailwindcss/vite ^4.1.17
- Utilities: clsx ^2.1.1, tailwind-merge ^3.4.0, class-variance-authority ^0.7.1
- Animations: tw-animate-css ^1.4.0
- Icons: Lucide React ^0.556.0

### State Management

- Data Fetching: @tanstack/react-query ^5.90.12
- DevTools: @tanstack/react-query-devtools ^5.90.12

### Deployment

- Platform: Cloudflare Pages (via Wrangler)

## Shared Packages

### UI Components (`packages/ui`)

- Component Primitives: @radix-ui/react-slot ^1.2.4
- Styling: Tailwind CSS ^4.1.17, class-variance-authority ^0.7.1
- Pattern: shadcn/ui (CLI-based component system)

### Authentication (`packages/auth`)

- Backend: @clerk/backend ^1.20.0
- Frontend: @clerk/clerk-react ^5.58.0
- Webhooks: Svix ^1.82.0
- Framework Integration: Hono ^4.10.7

### Database (`packages/db`)

- ORM: Drizzle ORM ^0.45.0
- Driver: @neondatabase/serverless ^1.0.2
- Migrations: Drizzle Kit ^0.31.8
- Database: Neon (Postgres serverless)
