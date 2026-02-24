# Tech Docs Scout

Task: T-20 — Rekognition cleanup cron job
Root: BS_0001_S-1
Date: 2026-01-13

## Stack conventions

**Runtime & Framework**

- Cloudflare Workers (compatibility_date: 2025-12-06)
- Web Framework: Hono ^4.10.7
- TypeScript 5.9.2
- Node.js >= 20.0.0

**Database**

- ORM: Drizzle ORM ^0.45.0
- Driver: @neondatabase/serverless ^1.0.2
- Database: Neon (Postgres serverless)
- Connection: `createDb(env.DATABASE_URL)` from `@sabaipics/db`

**AWS Integration**

- Face Recognition: @aws-sdk/client-rekognition ^3.946.0
- Region: us-west-2 (AWS)
- Rate limit: 50 TPS per operation (coordinated via Durable Object RPC)

**Error Handling**

- Base class: `MyError` from `src/lib/error/index.ts`
- Properties: `retryable: boolean`, `isThrottle?: boolean`, `cause?: unknown`, `name?: string`
- Pattern: Use `neverthrow` (`Result`, `ResultAsync`, `ok`, `err`) for functional error handling

**Logging**

- Use `console.log` for info (structured JSON context)
- Use `console.warn` for warnings
- Use `console.error` for errors
- Include context objects: `{ photoId, eventId, ... }`

**Testing**

- Test Framework: Vitest ^3.2.0
- Workers Testing: @cloudflare/vitest-pool-workers ^0.10.14
- Build Tool: Vite 6
- Config: `vitest.config.ts` for Workers runtime tests
- Pattern: `*.workers.test.ts` for tests requiring workerd runtime (DO, R2, Queue)
- Setup: `tests/setup.ts` (global setup)

## Cron/job patterns

### Cloudflare Configuration

**wrangler.jsonc structure:**

```jsonc
{
  "triggers": {
    "crons": ["0 0 * * *"], // Example: daily at midnight UTC
  },
}
```

**Per-environment configuration:**

- Development: No cron triggers configured (test via HTTP endpoint)
- Staging: Configure under `env.staging.triggers.crons`
- Production: Configure under `env.production.triggers.crons`

### Handler Structure

**Worker export pattern (from src/index.ts):**

```typescript
export default {
  fetch: app.fetch, // HTTP requests
  queue, // Queue consumer
  scheduled, // Cron handler (to be added)
};
```

**Cron handler signature:**

```typescript
async function scheduled(
  controller: ScheduledController,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  // controller.cron contains the cron expression that triggered execution
  // Use switch statement for multiple cron schedules
  switch (controller.cron) {
    case '0 0 * * *':
      await handleDailyCleanup(env, ctx);
      break;
  }
}
```

**Multiple cron triggers pattern:**

- Single `scheduled()` function handles all cron schedules
- Use `controller.cron` to route to appropriate handler
- Pattern: Switch statement for conditional execution

### Testing Cron Handlers

**Local testing:**

```bash
wrangler dev --test-scheduled
# Then call: http://localhost:8787/__scheduled?cron=0+0+*+*+*
```

**Integration testing:**

- Mock the `ScheduledController` in Vitest
- Test handler logic independently
- Use `defineWorkersConfig` for workerd runtime tests

## Database conventions

**Connection pattern:**

```typescript
const db = createDb(env.DATABASE_URL);
```

**Query patterns:**

```typescript
// Select with where clause
const rows = await db
  .select({ field: table.column })
  .from(table)
  .where(eq(table.id, value))
  .limit(1);

// Update
await db.update(table).set({ column: value }).where(eq(table.id, id));

// Delete
await db.delete(table).where(eq(table.id, id));

// Complex where conditions
import { and, eq, isNotNull, lt } from 'drizzle-orm';
await db
  .select()
  .from(table)
  .where(and(eq(table.status, 'pending'), isNotNull(table.field), lt(table.createdAt, cutoffDate)));
```

**Table imports:**

```typescript
import { photos, events, faces } from '@sabaipics/db';
```

**Transaction handling:**

- Queue consumer (`photo-consumer.ts`) does NOT use transactions (see line 174 comment)
- Prefer explicit step-by-step operations with error handling
- Use try-catch for database errors with fallback updates

**Error handling:**

```typescript
try {
  await db.update(table).set({ ... }).where(...);
} catch (dbError) {
  console.error('[Context] Database error:', dbError);
  // Handle or rethrow
}
```

## Error handling

**Base error class:**

```typescript
import { MyError, type MyErrorOptions } from './lib/error';

class CustomError extends MyError {
  constructor(message: string, options: MyErrorOptions) {
    super(message, options);
  }
}
```

**Error options:**

- `retryable: boolean` - Determines queue ack/retry behavior
- `isThrottle?: boolean` - If true, report to rate limiter
- `cause?: unknown` - Original error for debugging
- `name?: string` - Error type name (defaults to class name)

**Functional error handling (neverthrow):**

```typescript
import { Result, ResultAsync, ok, err } from 'neverthrow';

// Wrap async operations
const result = ResultAsync.fromPromise(
  asyncOperation(),
  (error): CustomError => new CustomError('Failed', { retryable: true, cause: error }),
);

// Chain operations
return result
  .andThen((value) => processValue(value))
  .map((value) => transformValue(value))
  .mapErr((error) => {
    console.error('Operation failed', { error });
    return error;
  });

// Pattern matching
if (result.isOk()) {
  const value = result.value;
} else {
  const error = result.error;
}
```

**Error classification:**

- Retryable errors: Network failures, throttling, temporary AWS errors
- Non-retryable errors: Not found, invalid data, permanent AWS errors
- Throttle errors: Set `isThrottle: true` to trigger rate limiter backoff

**Logging pattern:**

```typescript
console.error('[Context] Operation failed', {
  id: resourceId,
  errorName: error.name,
  errorMessage: error.message,
  retryable: error.retryable,
});
```

## Testing conventions

**Test file naming:**

- Workers runtime tests: `*.workers.test.ts` (uses workerd, DO, R2, Queue)
- Unit tests: `*.test.ts` (uses Node.js runtime)
- Integration tests: `*.integration.ts` (requires external services)

**Test structure (Vitest):**

```typescript
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test'; // For Workers tests

describe('Feature name', () => {
  it('should do something', async () => {
    // Arrange
    const input = {...};

    // Act
    const result = await functionUnderTest(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

**Workers runtime testing:**

```typescript
// Access bindings from env
const id = env.AWS_REKOGNITION_RATE_LIMITER.idFromName('test-id');
const stub = env.AWS_REKOGNITION_RATE_LIMITER.get(id);
const result = await stub.method();
```

**Mocking:**

- AWS SDK: Use `aws-sdk-client-mock ^4.1.0`
- Database: Mock `createDb` return value
- Bindings: Use `cloudflare:test` env in Workers tests

**Test coverage expectations:**

- Test happy path
- Test error cases (retryable, non-retryable)
- Test edge cases (empty results, null values)
- Test rate limiting behavior (if applicable)

## Must-follow rules

**From CLAUDE.md:**

- Use official docs only - spawn subagents to research
- Append changes to `./log/NNN-topic-name.md` (append-only, create new numbered file for new topics)
- Use conventional commits for commit messages
- NEVER include Claude Code authorship message in commit messages, PRs, or issues

**From Tech Image:**

- Keep high-level repo context in Tech Image; keep low-level code conventions in `.claude/rules/**`
- If a change requires a new primitive/vendor/infra/security model, raise an ADR before implementation planning

**Code organization:**

- Location: Cron handlers should follow pattern in `src/` directory
- Export pattern: Must export cron handler from main index.ts
- Type safety: Use `Bindings` type for env, `ExecutionContext` for ctx

**Infrastructure:**

- R2 Buckets: Access via `env.PHOTOS_BUCKET` binding
- Durable Objects: Access via named bindings (e.g., `env.AWS_REKOGNITION_RATE_LIMITER`)
- Queues: Producer via `env.PHOTO_QUEUE`, consumer registered separately
- Database: Single connection per handler invocation

**Deployment:**

- Development: `pnpm dev` (no cron triggers, test via HTTP)
- Staging: Auto-deploy from master branch
- Production: Manual approval required
- Observability: Enabled in staging and production

## External references

- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
  - Use five-field cron expressions (minute hour day month weekday)
  - All times execute in UTC
  - Quartz scheduler-like extensions supported (L, W, #)
  - Changes take up to 15 minutes to propagate
  - Test locally: `curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"`

- Multiple Cron Triggers: https://developers.cloudflare.com/workers/examples/multiple-cron-triggers/
  - Single `scheduled()` handler with switch on `controller.cron`
  - Can combine with other handlers (fetch, queue) in default export
  - Use `wrangler dev --test-scheduled` for local testing

## Implementation notes

**Current worker structure (src/index.ts):**

- Exports: `{ fetch: app.fetch, queue }` (no scheduled handler yet)
- Durable Objects: `RekognitionRateLimiter` (exported for wrangler)
- Queue consumer: Implemented in `src/queue/photo-consumer.ts`
- Event handlers: Registered at module load time (`registerStripeHandlers()`)

**Expected cron structure:**

1. Create cron handler function(s) in dedicated file (e.g., `src/crons/cleanup.ts`)
2. Create index file `src/crons/index.ts` that exports unified `scheduled()` handler
3. Import and export from `src/index.ts`: `export { scheduled } from './crons';`
4. Update `wrangler.jsonc` with cron schedules in appropriate environments

**Data to query for cleanup:**

- Table: `photos` from `@sabaipics/db`
- Columns: `id`, `rekognitionFaceId`, `eventId`, `status`, `indexedAt`
- Related: `faces` table (stores indexed face records)
- AWS: Rekognition collections (per event, named by `getCollectionId(eventId)`)

**Cleanup logic considerations:**

- Query photos older than retention period
- Check if faces exist in Rekognition collection
- Delete face from collection via AWS SDK
- Update or delete database records
- Handle errors (retryable/non-retryable)
- Log all operations with context
- Consider rate limiting (50 TPS Rekognition limit)
