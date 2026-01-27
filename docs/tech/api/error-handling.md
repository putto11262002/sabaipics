# API Error Handling (neverthrow)

This doc defines the conventions for API route error handling in `apps/api`.

Goal: consistent, type-safe handler code using `neverthrow` + `safeTry`, with a single error response shape.

Reference implementation: `apps/api/src/routes/uploads.ts`.

## Standard error types

Source: `apps/api/src/lib/error/index.ts`

- `ApiErrorCode`: stable error codes (map to HTTP status)
- `HandlerError`: the only error type route handlers return from `safeTry`
- `apiError(c, e)`: maps `HandlerError` to `{ error: { code, message } }` JSON + HTTP status

Client-visible error shape:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Event not found"
  }
}
```

Important: `HandlerError.cause` is for logging only and must never be returned to clients.

## Handler pattern (gold standard)

Use this structure for every route handler:

```ts
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import { apiError, type HandlerError } from '../lib/error';

app.get('/path', async (c) => {
  // Parse/validate outside safeTry when it cannot throw (or is middleware-driven)

  return (
    safeTry(async function* () {
      // Wrap each async operation GRANULARLY
      const value = yield* ResultAsync.fromPromise(
        doAsyncThing(),
        (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Failed to do thing', cause }),
      );

      if (!value) {
        return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'Thing not found' });
      }

      return ok({ value });
    })
      // Best-effort logging; keep cause out of responses
      .orTee((e) => e.cause && console.error(`[API] ${e.code}:`, e.cause))
      // Convert Result -> HTTP response at the boundary
      .match(
        (data) => c.json({ data }, 200),
        (e) => apiError(c, e),
      )
  );
});
```

## Conventions

### 0) Use the shared `Env` type

Always import `Env` from `'../types'` (or `'../../types'` depending on depth). Do not define local `Env` or `CheckoutEnv` types in route files.

```ts
import type { Env } from '../types';

export const myRouter = new Hono<Env>();
```

### 1) No thrown errors inside handlers

Avoid `throw new Error(...)` in route handlers.

- If a function can throw/reject, wrap it with `ResultAsync.fromPromise` or `ResultAsync.fromThrowable`.
- If you must interpret a thrown error (e.g. a legacy sentinel `Error.message`), isolate the mapping in one place and convert it to a `HandlerError` immediately.

### 2) Granular wrapping (no big try/catch blocks)

Wrap each call that can fail, not a whole handler body.

Good:

```ts
const [row] = yield* ResultAsync.fromPromise(
  db.select().from(table).where(...).limit(1),
  (cause): HandlerError => ({ code: 'INTERNAL_ERROR', message: 'Database error', cause }),
);

const url = yield* ResultAsync.fromPromise(
  sdk.createUrl(...),
  (cause): HandlerError => ({ code: 'BAD_GATEWAY', message: 'Upstream service failed', cause }),
);
```

Avoid:

```ts
return safeTry(async function* () {
  // too much in one block; failures are ambiguous
  const a = await doA();
  const b = await doB(a);
  const c = await doC(b);
  return { c };
});
```

### 3) Prefer `fromThrowable` when sync-throw is possible

Use `ResultAsync.fromThrowable` when the called function might throw synchronously before returning a promise.

```ts
const parsed =
  yield *
  ResultAsync.fromThrowable(
    () => JSON.parse(raw),
    (cause): HandlerError => ({ code: 'UNPROCESSABLE', message: 'Invalid JSON', cause }),
  )();
```

### 4) Early returns use `err<never, HandlerError>(...)`

Use early returns for business validation / authorization / not-found.

```ts
if (!hasConsent) {
  return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'Consent not accepted' });
}
```

### 5) Choose the smallest correct `ApiErrorCode`

Use codes from `API_ERROR_STATUS` (see `apps/api/src/lib/error/index.ts`).

Common mappings:

- Input/format validation: `BAD_REQUEST`
- Semantic validation (valid shape, invalid meaning): `UNPROCESSABLE`
- Auth missing/invalid: `UNAUTHORIZED`
- Permission denied: `FORBIDDEN`
- Missing resource: `NOT_FOUND`
- Duplicate/state conflict: `CONFLICT`
- Expired resource: `GONE`
- Rate limiting: `RATE_LIMITED` (optionally set `headers: { 'Retry-After': '...' }`)
- Unexpected failures (db, code bugs): `INTERNAL_ERROR`
- Upstream dependency failures (Stripe, R2, external APIs): `BAD_GATEWAY`

### 6) Zod/Hono validation

We use `@hono/zod-validator` (`zValidator(...)`) for request validation.

- Prefer schema validation in middleware (params/query/json/form) so handlers can use `c.req.valid(...)`.
- Business validation still returns `HandlerError` (typically `BAD_REQUEST` or `UNPROCESSABLE`).

Note: the zValidator error response shape is middleware-defined; handler code should not try to catch those errors.

## Quick checklist for updating a route

- Use `safeTry(async function* () { ... })` in the handler.
- Wrap each throwy/async call with `ResultAsync.fromPromise` / `ResultAsync.fromThrowable`.
- Return `ok(...)` / `err<never, HandlerError>(...)` from inside `safeTry`.
- Add `.orTee((e) => e.cause && console.error(...))` before `.match(...)`.
- End with `.match(success, (e) => apiError(c, e))`.
