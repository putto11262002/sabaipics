## 1) Define errors as discriminated unions (plain objects)

In big codebases, teams typically standardize on one field that’s the stable tag (often type) + structured fields.

type AppError =
| { type: "validation"; issues: Array<{ path: string; message: string }> }
| { type: "not_found"; resource: "user"; id: string }
| { type: "unauthorized" }
| { type: "db"; operation: "insert_user" | "find_user"; cause: unknown }
| { type: "unexpected"; message: string; cause: unknown };

Why this scales:

- You can switch (err.type) and it stays readable.
- You can add fields safely without breaking every consumer (vs relying on message parsing).
- You can keep “technical details” in cause: unknown without leaking vendor error types across your app.

A common refinement is: each layer has its own union, not one global union.

type RepoError =
| { type: "db"; operation: "find_user"; cause: unknown }
| { type: "db"; operation: "insert_user"; cause: unknown };

type ServiceError =
| { type: "validation"; issues: string[] }
| { type: "not_found"; id: string }
| { type: "repo"; cause: RepoError }; // or map into more specific domain errors

———

## 2) Wrap exceptions/rejections immediately (localize “throwy” code)

Neverthrow’s wiki calls out that most JS libs throw, so you should wrap third-party code with try/catch (sync) or wrap promises (async) so exceptions don’t leak everywhere. (github.com (https://
github.com/supermacro/neverthrow/wiki/Error-Handling-Best-Practices?utm_source=openai))

### Sync example (JSON parse)

import { ok, err, type Result } from "neverthrow";

type ParseError = { type: "parse"; cause: unknown };

const safeJsonParse = (s: string): Result<unknown, ParseError> => {
try {
return ok(JSON.parse(s));
} catch (cause) {
return err({ type: "parse", cause });
}
};

### Async example (HTTP / DB / SDK calls)

import { ResultAsync } from "neverthrow";

type HttpError = { type: "http"; service: "billing"; cause: unknown };

const getInvoice = (id: string) =>
ResultAsync.fromPromise(fetch(`https://.../invoice/${id}`), (cause): HttpError => ({
type: "http",
service: "billing",
cause,
}));

One subtle-but-important pattern in large codebases: prefer ResultAsync.fromThrowable(fn, mapError) when the called function might throw synchronously before it returns a promise (neverthrow
explicitly warns about this). (github.com (https://github.com/supermacro/neverthrow?utm_source=openai))

———

## 3) Propagate by composition (andThen / mapErr) and translate at boundaries

Think of each function as “returns a Result<T, E> where E is only what the caller can actually handle”.

Example: repo returns repo errors, service returns service errors (it maps repo errors into something meaningful).

import { err, ok, ResultAsync } from "neverthrow";

type RepoError = { type: "db"; op: "find_user"; cause: unknown };
type ServiceError =
| { type: "not_found"; id: string }
| { type: "repo"; cause: RepoError };

type User = { id: string; email: string };

const findUserByIdRepo = (id: string): ResultAsync<User | null, RepoError> =>
ResultAsync.fromPromise(db.user.findUnique({ where: { id } }), (cause) => ({
type: "db",
op: "find_user",
cause,
}));

const getUser = (id: string): ResultAsync<User, ServiceError> =>
findUserByIdRepo(id)
.mapErr((e) => ({ type: "repo", cause: e } as const)) // translate technical layer -> service layer
.andThen((userOrNull) =>
userOrNull ? ok(userOrNull) : err({ type: "not_found", id } as const)
);

The key scaling idea:

- Low-level modules never return unknown or Error directly (they return your typed error).
- Higher layers decide what’s “not found” vs “unexpected” vs “unauthorized”, etc.

———

## 4) Side effects (logging/metrics) without polluting error types: andTee / orTee

Big projects usually want to log/metric without forcing every function to now also return LogError.

That’s exactly what andTee / orTee are for: do a side-effect, but let the original Result pass through unchanged. (github.com (https://github.com/supermacro/neverthrow?utm_source=openai))

const res = doThing()
.andTee((value) => auditLog("didThing", value))
.orTee((error) => auditLog("didThingFailed", error));

Use this for “best effort” logging/metrics/tracing where failure shouldn’t change business behavior. (github.com (https://github.com/supermacro/neverthrow?utm_source=openai))

If the side-effect should affect control flow (e.g., “must enqueue job or request fails”), then you’d use andThen and include the queue error in your union.

———

## 5) Handle/unpack only at the boundary (match), then map error types to outcomes

You usually don’t call .match() deep inside domain code; you call it at the edges.

### Hono route boundary example

app.get("/users/:id", async (c) => {
const id = c.req.param("id");
const result = await getUser(id);

    return result.match(
      (user) => c.json(user, 200),
      (err) => {
        switch (err.type) {
          case "not_found":
            return c.json({ error: "User not found" }, 404);
          case "repo":
            return c.json({ error: "Internal error" }, 500);
        }
      }
    );

});

This keeps HTTP concerns (status codes, response shape) out of your service layer.

Also, many teams install eslint-plugin-neverthrow so results must be consumed via .match(), .unwrapOr(), or .\_unsafeUnwrap() (tests). (github.com (https://github.com/supermacro/neverthrow))

———

## 6) Ergonomics for longer flows: safeTry + yield\* (Rust ?-style)

For “do 7 steps, any can fail” flows, safeTry is commonly used to avoid nested andThen chains while still returning a Result (or Promise<Result>). The README documents the yield\* <RESULT> early-
return behavior. (github.com (https://github.com/supermacro/neverthrow?utm_source=openai))

import { ok, safeTry } from "neverthrow";

const createUser = (input: unknown) =>
safeTry(async function* () {
const parsed = yield* validateInput(input); // Result<Parsed, ValidationError>
const existing = yield\* (await findUserByEmail(parsed.email)); // Promise<Result<User|null, RepoError>>
if (existing) return err({ type: "validation", issues: ["email_taken"] } as const);

      const saved = yield* insertUser(parsed);       // ResultAsync<User, RepoError> (or Result)
      return ok(saved);
    });

This is especially popular when you want “normal” local variables (const x = ...) but still keep typed propagation. (github.com (https://github.com/supermacro/neverthrow?utm_source=openai))

———

If you tell me your actual layers (e.g. routes -> services -> repos -> db + “shared types for React client”), I can propose a concrete error taxonomy and show exactly where to use Result vs
ResultAsync, and what each layer’s union should look like.

╭────────────────────────────────────────────╮
│ >\_ OpenAI Codex (v0.79.0) │
│ │
│ model: gpt-5.2 high /model to change │
│ directory: ~/Development/sabai/react-hono │
╰────────────────────────────────────────────╯

Tip: Paste an image with Ctrl+V to attach it to your next message.

› ok here is teh question i would like you to do soe resaech on wat is the best way or mostly used way for modern large ts proect to handler errors using neverthrow. What i m interested is how
error are define handle propate and things like that

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• The most common “large TS codebase” pattern with neverthrow is:

- Define errors as data (usually a discriminated union): each error has a stable type (string literal) + structured fields (message, cause, meta, retryable, etc.), so callers can switch
  (err.type) exhaustively. (solberg.is (https://www.solberg.is/neverthrow?utm_source=openai))
- Keep errors local, translate at boundaries: low-level modules return narrow errors (e.g. DbError | NotFoundError), then higher layers use mapErr to convert them into a larger “service/domain”
  error union (don’t leak ORM/HTTP-client error shapes everywhere). (deepwiki.com (https://deepwiki.com/supermacro/neverthrow/4.4-working-with-promises?utm_source=openai))
- Propagate via composition (don’t unwrap early): chain steps with andThen (short-circuits on first Err), use map for success transforms, mapErr/orElse for error transforms or recovery. The
  error type naturally becomes a union across the pipeline (E | F). (deepwiki.com (https://deepwiki.com/supermacro/neverthrow/4.2-composition-patterns?utm_source=openai))
- Convert exceptions/rejections at the edges: wrap “throwy” 3rd-party code immediately using Result.fromThrowable (sync) and ResultAsync.fromPromise / ResultAsync.fromThrowable (async), mapping
  unknown into your typed error. (github.com (https://github.com/supermacro/neverthrow/wiki/Error-Handling-Best-Practices))
- Handle (unwrap) in one place: only match() at app boundaries (HTTP handler/controller, job runner, CLI entry, React query boundary), where you can map error types to HTTP status/UI state/
  logging. (github.com (https://github.com/supermacro/neverthrow/wiki/Working-with-ResultAsync?utm_source=openai))
- Log/metrics as side-effects without polluting types: use orTee (or similar) so logging failures don’t widen your error unions. (github.com (https://github.com/supermacro/neverthrow?
  utm_source=openai))
- Ergonomics for long flows: many teams use safeTry + yield\* to get “Rust ?-style” early-return while still returning a Result/ResultAsync. (github.com (https://github.com/supermacro/neverthrow?
  utm_source=openai))

A typical error definition style:

export type UserError =
| { type: "not_found"; userId: string }
| { type: "db"; cause: unknown }
| { type: "validation"; issues: string[] };

If you want, tell me your layers (API-only? React client + API? workers?) and I’ll sketch a concrete error taxonomy + mapping strategy for your setup (including where to allow throw, if
anywhere).

› Alll our points here are great but pleaes iterate through them with more dearipn and real exmaples

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Here’s how the “large modern TS project” neverthrow style usually looks in practice: errors are plain data, kept narrow per layer, translated at boundaries, and only “unwrapped” at the edges
(HTTP/UI/CLI). The library’s own docs + wiki lean heavily toward “wrap throwy code locally” and “compose with Result/ResultAsync methods”. (github.com (https://github.com/supermacro/neverthrow/
wiki/Error-Handling-Best-Practices?utm_source=openai))

———

## 1) Define errors as discriminated unions (plain objects)

In big codebases, teams typically standardize on one field that’s the stable tag (often type) + structured fields.

type AppError =
| { type: "validation"; issues: Array<{ path: string; message: string }> }
| { type: "not_found"; resource: "user"; id: string }
| { type: "unauthorized" }
| { type: "db"; operation: "insert_user" | "find_user"; cause: unknown }
| { type: "unexpected"; message: string; cause: unknown };

Why this scales:

- You can switch (err.type) and it stays readable.
- You can add fields safely without breaking every consumer (vs relying on message parsing).
- You can keep “technical details” in cause: unknown without leaking vendor error types across your app.

A common refinement is: each layer has its own union, not one global union.

type RepoError =
| { type: "db"; operation: "find_user"; cause: unknown }
| { type: "db"; operation: "insert_user"; cause: unknown };

type ServiceError =
| { type: "validation"; issues: string[] }
| { type: "not_found"; id: string }
| { type: "repo"; cause: RepoError }; // or map into more specific domain errors

———

## 2) Wrap exceptions/rejections immediately (localize “throwy” code)

Neverthrow’s wiki calls out that most JS libs throw, so you should wrap third-party code with try/catch (sync) or wrap promises (async) so exceptions don’t leak everywhere. (github.com (https://
github.com/supermacro/neverthrow/wiki/Error-Handling-Best-Practices?utm_source=openai))

### Sync example (JSON parse)

import { ok, err, type Result } from "neverthrow";

type ParseError = { type: "parse"; cause: unknown };

const safeJsonParse = (s: string): Result<unknown, ParseError> => {
try {
return ok(JSON.parse(s));
} catch (cause) {
return err({ type: "parse", cause });
}
};

### Async example (HTTP / DB / SDK calls)

import { ResultAsync } from "neverthrow";

type HttpError = { type: "http"; service: "billing"; cause: unknown };

const getInvoice = (id: string) =>
ResultAsync.fromPromise(fetch(`https://.../invoice/${id}`), (cause): HttpError => ({
type: "http",
service: "billing",
cause,
}));

One subtle-but-important pattern in large codebases: prefer ResultAsync.fromThrowable(fn, mapError) when the called function might throw synchronously before it returns a promise (neverthrow
explicitly warns about this). (github.com (https://github.com/supermacro/neverthrow?utm_source=openai))

———

## 3) Propagate by composition (andThen / mapErr) and translate at boundaries

Think of each function as “returns a Result<T, E> where E is only what the caller can actually handle”.

Example: repo returns repo errors, service returns service errors (it maps repo errors into something meaningful).

import { err, ok, ResultAsync } from "neverthrow";

type RepoError = { type: "db"; op: "find_user"; cause: unknown };
type ServiceError =
| { type: "not_found"; id: string }
| { type: "repo"; cause: RepoError };

type User = { id: string; email: string };

const findUserByIdRepo = (id: string): ResultAsync<User | null, RepoError> =>
ResultAsync.fromPromise(db.user.findUnique({ where: { id } }), (cause) => ({
type: "db",
op: "find_user",
cause,
}));

const getUser = (id: string): ResultAsync<User, ServiceError> =>
findUserByIdRepo(id)
.mapErr((e) => ({ type: "repo", cause: e } as const)) // translate technical layer -> service layer
.andThen((userOrNull) =>
userOrNull ? ok(userOrNull) : err({ type: "not_found", id } as const)
);

The key scaling idea:

- Low-level modules never return unknown or Error directly (they return your typed error).
- Higher layers decide what’s “not found” vs “unexpected” vs “unauthorized”, etc.

———

## 4) Side effects (logging/metrics) without polluting error types: andTee / orTee

Big projects usually want to log/metric without forcing every function to now also return LogError.

That’s exactly what andTee / orTee are for: do a side-effect, but let the original Result pass through unchanged. (github.com (https://github.com/supermacro/neverthrow?utm_source=openai))

const res = doThing()
.andTee((value) => auditLog("didThing", value))
.orTee((error) => auditLog("didThingFailed", error));

Use this for “best effort” logging/metrics/tracing where failure shouldn’t change business behavior. (github.com (https://github.com/supermacro/neverthrow?utm_source=openai))

If the side-effect should affect control flow (e.g., “must enqueue job or request fails”), then you’d use andThen and include the queue error in your union.

———

## 5) Handle/unpack only at the boundary (match), then map error types to outcomes

You usually don’t call .match() deep inside domain code; you call it at the edges.

### Hono route boundary example

app.get("/users/:id", async (c) => {
const id = c.req.param("id");
const result = await getUser(id);

    return result.match(
      (user) => c.json(user, 200),
      (err) => {
        switch (err.type) {
          case "not_found":
            return c.json({ error: "User not found" }, 404);
          case "repo":
            return c.json({ error: "Internal error" }, 500);
        }
      }
    );

});

This keeps HTTP concerns (status codes, response shape) out of your service layer.

Also, many teams install eslint-plugin-neverthrow so results must be consumed via .match(), .unwrapOr(), or .\_unsafeUnwrap() (tests). (github.com (https://github.com/supermacro/neverthrow))

———

## 6) Ergonomics for longer flows: safeTry + yield\* (Rust ?-style)

For “do 7 steps, any can fail” flows, safeTry is commonly used to avoid nested andThen chains while still returning a Result (or Promise<Result>). The README documents the yield\* <RESULT> early-
return behavior. (github.com (https://github.com/supermacro/neverthrow?utm_source=openai))

import { ok, safeTry } from "neverthrow";

const createUser = (input: unknown) =>
safeTry(async function* () {
const parsed = yield* validateInput(input); // Result<Parsed, ValidationError>
const existing = yield\* (await findUserByEmail(parsed.email)); // Promise<Result<User|null, RepoError>>
if (existing) return err({ type: "validation", issues: ["email_taken"] } as const);

      const saved = yield* insertUser(parsed);       // ResultAsync<User, RepoError> (or Result)
      return ok(saved);
    });

This is especially popular when you want “normal” local variables (const x = ...) but still keep typed propagation. (github.com (https://github.com/supermacro/neverthrow?utm_source=openai))
