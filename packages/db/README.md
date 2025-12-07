# @sabaipics/db

Database package for SabaiPics using Drizzle ORM with Neon Postgres (serverless).

## Setup

### 1. Install dependencies

This package is already installed as a workspace dependency. If needed:

```bash
pnpm install
```

### 2. Set up Neon database

1. Create a Neon project at https://neon.tech
2. Copy your connection string from the Neon console
3. Add to `apps/api/.dev.vars`:

```env
DATABASE_URL=postgres://user:password@host/database?sslmode=require
```

### 3. Generate and push schema

```bash
# Generate migration files
pnpm --filter=@sabaipics/db db:generate

# Push schema to database (development)
pnpm --filter=@sabaipics/db db:push

# Or run migrations (production)
pnpm --filter=@sabaipics/db db:migrate
```

### 4. Browse database

```bash
pnpm --filter=@sabaipics/db db:studio
```

## Usage

### In Cloudflare Workers (API)

```typescript
import { createDb } from "@sabaipics/db/client";
import { dbTest } from "@sabaipics/db/schema";

// In your route handler
export const myRouter = new Hono().get("/", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const results = await db.select().from(dbTest);
  return c.json(results);
});
```

### Type exports

```typescript
import type { DbTest, NewDbTest } from "@sabaipics/db";

// DbTest - select type (full row)
// NewDbTest - insert type (without auto-generated fields)
```

## Scripts

- `db:generate` - Generate migration files from schema
- `db:push` - Push schema directly to database (dev only)
- `db:migrate` - Run migrations
- `db:studio` - Open Drizzle Studio

## Current Schema

### Test Table

The `_db_test` table is included for testing database connectivity:

```typescript
{
  id: number;          // auto-increment primary key
  name: string;        // varchar(255)
  createdAt: Date;     // timestamp, default now()
}
```

## Production Deployment

For Cloudflare Workers production:

1. Add `DATABASE_URL` as a secret:

```bash
wrangler secret put DATABASE_URL --env production
```

2. Or set in `wrangler.jsonc` vars (not recommended for security):

```jsonc
{
  "env": {
    "production": {
      "vars": {
        "DATABASE_URL": "postgres://..."
      }
    }
  }
}
```

## Notes

- Uses `drizzle-orm/neon-http` adapter for Cloudflare Workers compatibility
- Connection pooling handled automatically by Neon serverless driver
- All timestamps are in UTC
