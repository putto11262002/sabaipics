# Database Package Setup

## Architecture

- **Package**: `@sabaipics/db`
- **ORM**: Drizzle ORM (v0.45.0) with `drizzle-orm/neon-http` adapter
- **Database**: Neon Postgres (serverless) via `@neondatabase/serverless`
- **Runtime**: Optimized for Cloudflare Workers

---

## Package Structure

```
packages/db/
├── src/
│   ├── client.ts           # createDb(connectionString) factory
│   ├── index.ts            # Barrel export
│   └── schema/
│       ├── index.ts        # Schema barrel
│       └── test.ts         # _db_test table (test only)
├── drizzle/
│   ├── *.sql               # Migration files (tracked in git)
│   └── meta/               # Drizzle metadata (tracked in git)
├── drizzle.config.ts       # Drizzle Kit config
└── package.json
```

---

## Client Factory Pattern

```typescript
// packages/db/src/client.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

**Usage in Workers:**
```typescript
export const dbTestRouter = new Hono().get("/", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const results = await db.select().from(dbTest);
  return c.json({ success: true, data: results });
});
```

---

## Type Naming Convention

```typescript
// Schema file pattern (e.g., packages/db/src/schema/user.ts)
export const users = pgTable("users", { ... });

// Types co-located with schema using $inferSelect/$inferInsert
export type User = typeof users.$inferSelect;      // For SELECT results
export type NewUser = typeof users.$inferInsert;   // For INSERT data

// Convention:
// - <DomainType>     → SELECT type (what you get from DB)
// - New<DomainType>  → INSERT type (what you send to DB)
```

---

## Package Scripts

```bash
pnpm --filter=@sabaipics/db db:generate  # Generate migrations from schema changes
pnpm --filter=@sabaipics/db db:migrate   # Apply migrations to database
pnpm --filter=@sabaipics/db db:push      # Push schema directly (dev only)
pnpm --filter=@sabaipics/db db:studio    # Open Drizzle Studio GUI
```

---

## Migration Workflow

1. Change schema in `packages/db/src/schema/`
2. Generate migration: `pnpm --filter=@sabaipics/db db:generate`
3. Commit migration files in `packages/db/drizzle/`
4. Migrations run automatically in CI before deploy

**CI Integration:**
- Staging: Auto-runs `db:migrate` on master push
- Production: Auto-runs `db:migrate` on manual deploy trigger

**TODO (Future Improvement):**
Run migrations on Neon branch first, verify, then merge to main DB branch.
This provides a safety net for production migrations.

---

## Exports

```typescript
// Main export
import { createDb, Database } from "@sabaipics/db";

// Schema export
import { dbTest, DbTest, NewDbTest } from "@sabaipics/db/schema";

// Client only
import { createDb } from "@sabaipics/db/client";
```

---

## Docs

- Drizzle ORM: https://orm.drizzle.team/docs/get-started-postgresql
- Neon Serverless: https://neon.tech/docs/serverless/serverless-driver
- Drizzle Kit: https://orm.drizzle.team/kit-docs/overview
