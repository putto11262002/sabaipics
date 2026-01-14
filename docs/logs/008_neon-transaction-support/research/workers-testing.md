# Workers Runtime Testing with Environment Variables (.dev.vars)

**Research Question:** How to properly run tests in Cloudflare Workers runtime (Miniflare/workerd) using `@cloudflare/vitest-pool-workers` with environment variables from `.dev.vars` file?

**Date:** 2026-01-14

## Executive Summary

**Key Finding:** `@cloudflare/vitest-pool-workers` DOES automatically load `.dev.vars` via `wrangler.unstable_getMiniflareWorkerOptions()`, BUT these variables are NOT accessible as `process.env` in the workers runtime. They are only available via the `env` binding (from `cloudflare:test` module).

**Decision Needed:** Should we (A) use `env.DATABASE_URL` from `cloudflare:test` module, or (B) add `DATABASE_URL` to wrangler.jsonc `vars` section?

## Constraints

### Requirements
- Test Neon database transactions in workers runtime (workerd/Miniflare)
- Access `DATABASE_URL` and other secrets from `.dev.vars` file
- Run tests using `@cloudflare/vitest-pool-workers` v0.10.14
- Use wrangler.jsonc for configuration

### Current Architecture
- Hono API on Cloudflare Workers
- Vitest v3.2.4 with `@cloudflare/vitest-pool-workers`
- wrangler.jsonc for configuration
- `.dev.vars` file for local secrets (gitignored)
- Integration tests run in Node.js environment (`vitest.integration.config.ts`)
- Workers tests use `vitest.config.ts` with workers pool

### Environment/Runtime
- **Workers Pool Runtime:** Miniflare/workerd (NOT Node.js)
- **Node.js Compatibility Flags:** `nodejs_compat`, `nodejs_compat_populate_process_env`
- **Config Files:**
  - `apps/api/vitest.config.ts` - workers pool configuration
  - `apps/api/vitest.integration.config.ts` - Node.js integration tests
  - `apps/api/wrangler.jsonc` - wrangler configuration

## Repo Exemplars

### 1. Integration Test Config (Node.js) - Works with `.dev.vars`

**File:** `apps/api/vitest.integration.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import { readFileSync, existsSync } from "fs";

// Load .dev.vars for integration tests
function loadDevVars() {
  const devVarsPath = "./.dev.vars";
  if (existsSync(devVarsPath)) {
    const content = readFileSync(devVarsPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          process.env[key] = valueParts.join("=");
        }
      }
    }
  }
}

loadDevVars();

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./tests/setup.integration.ts"],
    include: ["tests/**/*.integration.ts"],
    exclude: ["tests/setup.integration.ts"],
    environment: "node", // ← Node.js environment
  },
});
```

**Pattern:** Manual `.dev.vars` loading works because tests run in Node.js where `process.env` is available.

### 2. Workers Pool Config - Uses wrangler integration

**File:** `apps/api/vitest.config.ts`

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.workers.test.ts"],
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "./wrangler.jsonc", // ← Uses wrangler config
        },
        main: "./src/durable-objects/rate-limiter.ts",
        isolatedStorage: true,
      },
    },
  },
});
```

**Pattern:** Relies on `wrangler.unstable_getMiniflareWorkerOptions()` to load config including `.dev.vars`.

### 3. Workers Test Accessing Bindings

**File:** `apps/api/tests/rate-limiter.workers.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test"; // ← Import env from cloudflare:test

describe("RekognitionRateLimiter DO", () => {
  it("returns zero delay for first batch", async () => {
    const id = env.AWS_REKOGNITION_RATE_LIMITER.idFromName("test-cold");
    const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(id);
    // ...
  });
});
```

**Pattern:** Uses `env` from `cloudflare:test` module to access bindings (Durable Objects, KV, etc.).

### 4. Current Broken Test - Trying to use process.env

**File:** `apps/api/tests/consent.workers.test.ts`

```typescript
describe("POST /consent - Workers Runtime (Miniflare)", () => {
  it("should test if transactions work", async () => {
    // ❌ This doesn't work in workers runtime!
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.log(`SKIP: DATABASE_URL not available in workers runtime`);
      return;
    }
    // ...
  });
});
```

**Problem:** `process.env` is NOT populated with `.dev.vars` in workers runtime.

## Gap List

### Must-Know
1. ✅ Does `@cloudflare/vitest-pool-workers` automatically load `.dev.vars`? **YES**
2. ✅ How to access `.dev.vars` variables in workers runtime tests? **Via `env` from `cloudflare:test`**
3. ✅ Are variables from `wrangler.jsonc` vars section available in tests? **YES, via `env`**
4. ❓ Can `process.env` be populated in workers runtime tests? **Need to verify**

### Nice-to-Know
1. ❓ How to add type definitions for test environment variables?
2. ❓ Can we use different `.dev.vars` files for different test environments?
3. ❓ What about environment-specific `.dev.vars.{env}` files?

## Tiered Evidence Gathering

### Tier A: Breadth Scan (Code Analysis)

**Source:** `@cloudflare/vitest-pool-workers` v0.10.14 source code

**Finding 1:** vitest-pool-workers uses wrangler's config loading

From `dist/pool/index.mjs`:
```javascript
const { workerOptions, externalWorkers, define, main } = wrangler.unstable_getMiniflareWorkerOptions(
  configPath,
  options.wrangler.environment,
  { /* options */ }
);
```

**Finding 2:** wrangler loads `.dev.vars` automatically

From `wrangler/wrangler-dist/cli.js`:
```javascript
function getVarsForDev(configPath, envFiles, vars, env6, silent = false) {
  const configDir = path.resolve(configPath ? path.dirname(configPath) : ".");
  if (!envFiles?.length) {
    const devVarsPath = path.resolve(configDir, ".dev.vars");
    const loaded = loadDotDevDotVars(devVarsPath, env6);
    if (loaded !== void 0) {
      return { ...vars, ...loaded.parsed };
    }
  }
  return vars;
}

function loadDotDevDotVars(envPath, env6) {
  // Tries .dev.vars.<env6> if env6 is defined, otherwise .dev.vars
  return env6 !== void 0 && tryLoadDotDevDotVars(`${envPath}.${env6}`) 
    || tryLoadDotDevDotVars(envPath);
}
```

**Finding 3:** vars are returned in bindings object

From `unstable_getMiniflareWorkerOptions`:
```javascript
return bindings: {
  vars: {
    ...getVarsForDev(configParam.userConfigPath, envFiles, configParam.vars, env6),
    ...args.vars
  },
  // ... other bindings
};
```

### Tier B: Authority Sources

**Source:** `cloudflare:test` module type definitions

From `types/cloudflare-test.d.ts`:
```typescript
declare module "cloudflare:test" {
  interface ProvidedEnv {}

  export const env: ProvidedEnv; // ← Environment bindings
  export const SELF: Fetcher;
  // ...
}
```

**Implication:** Environment variables from wrangler config (including `.dev.vars`) are available via `env` object, NOT `process.env`.

**Source:** wrangler.jsonc configuration

From `apps/api/wrangler.jsonc`:
```jsonc
{
  "vars": {
    "CORS_ORIGIN": "http://localhost:5173",
    "AWS_REGION": "us-west-2",
    // ... other vars
  }
}
```

**Note:** These `vars` are merged with `.dev.vars` by wrangler's config loading.

### Tier C: Caveats & Gotchas

**Gotcha 1:** `process.env` vs `env` binding

In workers runtime:
- ❌ `process.env.DATABASE_URL` → NOT populated from `.dev.vars`
- ✅ `env.DATABASE_URL` → Available if typed in `ProvidedEnv` interface

**Gotcha 2:** Type definitions required

To use `env.DATABASE_URL`, you need to extend the `ProvidedEnv` interface:

```typescript
// In a test file or ambient module declaration
declare module "cloudflare:test" {
  interface ProvidedEnv {
    DATABASE_URL: string;
  }
}
```

**Gotcha 3:** Node.js compatibility flags

Even with `nodejs_compat` and `nodejs_compat_populate_process_env` in wrangler.jsonc, `.dev.vars` are NOT added to `process.env` in workers runtime. These flags only affect the actual Workers runtime, not the test environment.

**Gotcha 4:** Different environments support `.dev.vars.{env}`

wrangler supports environment-specific `.dev.vars` files:
- `.dev.vars` - default/development
- `.dev.vars.staging` - staging environment
- `.dev.vars.production` - production environment

**Gotcha 5:** Wrangler config vars vs .dev.vars

- `wrangler.jsonc` vars section: Committed to git, non-sensitive
- `.dev.vars` file: Gitignored, contains secrets
- Both are merged and available via `env` in tests

## Options

### Option A: Use `env` from `cloudflare:test` Module (RECOMMENDED)

**Approach:**
1. Add type definition for `DATABASE_URL` in `ProvidedEnv` interface
2. Access via `env.DATABASE_URL` instead of `process.env.DATABASE_URL`
3. Rely on automatic `.dev.vars` loading by wrangler

**Code Changes:**

```typescript
// In test file or ambient types file
declare module "cloudflare:test" {
  interface ProvidedEnv extends Bindings {
    DATABASE_URL: string;
  }
}

// In test
import { env } from "cloudflare:test";

it("should test transactions", async () => {
  const databaseUrl = env.DATABASE_URL; // ← Use env instead of process.env
  // ...
});
```

**Pros:**
- ✅ Uses built-in wrangler integration (automatic `.dev.vars` loading)
- ✅ Type-safe with proper interface extension
- ✅ Consistent with how production Workers access env vars
- ✅ No manual parsing or loading code needed
- ✅ Works with environment-specific `.dev.vars.{env}` files

**Cons:**
- ❌ Requires understanding difference between `process.env` and `env` binding
- ❌ Need to define types for all env vars used in tests
- ❌ Different pattern than integration tests (use `process.env`)

**Risks:**
- **Low:** Well-documented pattern from Cloudflare
- **Failure Mode:** Test fails if type not defined (compile error)

**Prerequisites:**
- None (uses existing infrastructure)

**Red Flags:**
- None

---

### Option B: Add `DATABASE_URL` to wrangler.jsonc vars

**Approach:**
1. Add `DATABASE_URL` to `vars` section in wrangler.jsonc
2. Use a placeholder value in committed config
3. Override via `.dev.vars` for local development

**Code Changes:**

```jsonc
{
  "vars": {
    "DATABASE_URL": "postgresql://user:password@localhost/db", // Placeholder
    // ... other vars
  }
}
```

**Then in .dev.vars:**
```
DATABASE_URL=postgresql://real-user:real-password@real-host/db
```

**Pros:**
- ✅ Documents that `DATABASE_URL` is a required environment variable
- ✅ Type-safe (already in Bindings interface if defined)
- ✅ Works with existing wrangler config infrastructure

**Cons:**
- ❌ Requires placeholder value in committed config
- ❌ `.dev.vars` values already override wrangler.jsonc vars anyway
- ❌ Doesn't solve the `process.env` vs `env` issue
- ❌ May confuse developers about which file to edit

**Risks:**
- **Medium:** Developers might edit wrangler.jsonc instead of `.dev.vars`
- **Failure Mode:** Accidental commit of real credentials if developer edits wrong file

**Prerequisites:**
- Update `src/types.ts` to include `DATABASE_URL` in `Bindings`

**Red Flags:**
- ⚠️ Placeholder values might be used in tests (need `.dev.vars` override)

---

### Option C: Manual .dev.vars Loading in vitest.config.ts

**Approach:**
1. Manually load `.dev.vars` in vitest.config.ts
2. Pass via miniflare options to workers runtime

**Code Changes:**

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { readFileSync, existsSync } from "fs";

function loadDevVars() {
  const devVarsPath = "./.dev.vars";
  const vars: Record<string, string> = {};
  if (existsSync(devVarsPath)) {
    const content = readFileSync(devVarsPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          vars[key] = valueParts.join("=");
        }
      }
    }
  }
  return vars;
}

export default defineWorkersConfig({
  test: {
    // ...
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "./wrangler.jsonc",
        },
        miniflare: {
          vars: loadDevVars(), // ← Pass vars manually
        },
      },
    },
  },
});
```

**Pros:**
- ✅ Explicit control over which vars are loaded
- ✅ Same pattern as integration tests (familiarity)

**Cons:**
- ❌ Duplicates wrangler's built-in `.dev.vars` loading
- ❌ Maintenance burden (keep parsing logic in sync)
- ❌ Still doesn't make vars available as `process.env`
- ❌ Doesn't work with environment-specific `.dev.vars.{env}` files

**Risks:**
- **Medium:** Code duplication with wrangler functionality
- **Failure Mode:** Vars might not be merged correctly with wrangler config

**Prerequisites:**
- Manual `.dev.vars` parsing implementation

**Red Flags:**
- ⚠️ Defeats purpose of wrangler integration

---

### Option D: Use process.env with nodejs_compat (NOT RECOMMENDED)

**Approach:**
1. Rely on `nodejs_compat_populate_process_env` flag
2. Hope that `.dev.vars` are loaded into `process.env`

**Code Changes:**
None (just use existing `process.env.DATABASE_URL`)

**Pros:**
- ✅ No code changes needed
- ✅ Familiar pattern for Node.js developers

**Cons:**
- ❌ DOESN'T WORK (`.dev.vars` not loaded into `process.env` in tests)
- ❌ Misunderstands how `nodejs_compat` flags work
- ❌ Would give false sense of security

**Risks:**
- **High:** Tests will fail silently or skip indefinitely
- **Failure Mode:** `DATABASE_URL` is undefined, tests skip

**Prerequisites:**
- None (but doesn't work)

**Red Flags:**
- 🚩 Does not actually work in workers runtime tests

## Open Questions / Requires Human Input

1. **Type Definition Location:** Where should we define the `ProvidedEnv` interface extension?
   - Option 1: In each test file that needs it
   - Option 2: In a dedicated `tests/types.d.ts` file
   - Option 3: In `src/types.ts` alongside `Bindings`

2. **Secrets Documentation:** Should we document which environment variables are required for testing?
   - Add to `.dev.vars.example`?
   - Add to test setup documentation?

3. **Environment-Specific Testing:** Do we need to test against staging/production environments?
   - Use `wrangler.environment` in vitest config?
   - Use `.dev.vars.staging` files?

## Recommendation

**Decision-Ready:** YES → **Option A**

**Recommended Approach:** Use `env` from `cloudflare:test` module with type definitions

**Rationale:**
1. **Correct Architecture:** Uses Workers runtime as designed (bindings via `env`, not `process.env`)
2. **Built-in Support:** Wrangler automatically loads `.dev.vars` and makes them available
3. **Type-Safe:** Proper TypeScript types prevent runtime errors
4. **Future-Proof:** Aligns with Cloudflare's recommended testing patterns
5. **Low Risk:** Well-documented, standard approach

**Implementation Steps:**

1. Create `tests/types.d.ts` with environment variable types:

```typescript
import type { Bindings } from "../src/types";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Bindings {
    DATABASE_URL: string;
  }
}
```

2. Update `consent.workers.test.ts`:

```typescript
import { env } from "cloudflare:test";

it("should test if transactions work", async () => {
  const databaseUrl = env.DATABASE_URL; // ← Now available via env
  // ...
});
```

3. Verify `.dev.vars` file exists with `DATABASE_URL` value

4. Run tests: `pnpm test:workers -- consent`

**Expected Result:** Tests run successfully with `DATABASE_URL` accessible via `env` binding.

**Follow-up Actions:**
- Document in `.dev.vars.example` which vars are required for testing
- Update testing documentation to explain `process.env` vs `env` binding
- Consider adding test setup validation to warn if required vars are missing
