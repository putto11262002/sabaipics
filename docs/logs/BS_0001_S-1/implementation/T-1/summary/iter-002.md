# Implementation Summary: T-1 Database Schema (Iteration 2)

**Task:** T-1 — Create database schema (all domain tables)
**Root:** `BS_0001_S-1`
**Date:** 2026-01-10
**Iteration:** 2 (PR review feedback)

---

## Changes from Iteration 1

Addressed PR review feedback from @putto11262002:

### 1. Changed ID type from `text` to `uuid`

**Before:**
```typescript
id: text("id").primaryKey().default(sql`gen_random_uuid()`)
```

**After:**
```typescript
id: uuid("id").primaryKey().default(sql`gen_random_uuid()`)
```

**Rationale:** Native Postgres `uuid` type is more efficient (16 bytes vs 36 chars), has better indexing, and provides type safety at DB level.

### 2. Created `common.ts` with reusable field builders

**File:** `packages/db/src/schema/common.ts`

```typescript
// Timestamp builder with proper config (DBSCHEMA-004)
export const timestamptz = (name: string) =>
  timestamp(name, { mode: "string", withTimezone: true });

// Standard createdAt column
export const createdAtCol = () =>
  timestamp("created_at", { mode: "string", withTimezone: true })
    .defaultNow()
    .notNull();
```

**Usage:**
```typescript
// Before
createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).defaultNow().notNull()
expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }).notNull()

// After
createdAt: createdAtCol()
expiresAt: timestamptz("expires_at").notNull()
```

### 3. Moved Rekognition types from `types.ts` to `faces.ts`

**Rationale:** Types should be co-located with the schema that uses them. Since `BoundingBox` and `RekognitionFaceRecord` are only used by `faces.ts`, they belong there.

**Deleted:** `packages/db/src/schema/types.ts`

### 4. Kept R2 key instead of URL (counter-proposal accepted)

**Decision:** Store `r2_key` (not URL) for:
- URLs can change (domain, CDN config)
- Keys are immutable identifiers
- Same key → multiple URL variants (thumbnail, preview, download)
- Shorter storage footprint

---

## Files Changed

| Action | Path |
|--------|------|
| CREATED | `packages/db/src/schema/common.ts` |
| MODIFIED | `packages/db/src/schema/photographers.ts` |
| MODIFIED | `packages/db/src/schema/credit-packages.ts` |
| MODIFIED | `packages/db/src/schema/credit-ledger.ts` |
| MODIFIED | `packages/db/src/schema/events.ts` |
| MODIFIED | `packages/db/src/schema/photos.ts` |
| MODIFIED | `packages/db/src/schema/faces.ts` (+ moved types here) |
| MODIFIED | `packages/db/src/schema/consent-records.ts` |
| MODIFIED | `packages/db/src/schema/index.ts` |
| DELETED | `packages/db/src/schema/types.ts` |
| REGENERATED | `packages/db/drizzle/0001_deep_cobalt_man.sql` |

---

## Reusable Helpers Added

### `common.ts` exports:

| Export | Description | Usage |
|--------|-------------|-------|
| `timestamptz(name)` | Creates timestamp with timezone in string mode | `expiresAt: timestamptz("expires_at").notNull()` |
| `createdAtCol()` | Standard `created_at` with defaultNow | `createdAt: createdAtCol()` |

---

## Validation

- ✅ TypeScript type checking passed
- ✅ Migration generated with correct column names
- ✅ All IDs now use native `uuid` type
- ✅ All timestamps use proper snake_case column names

---

## Migration Diff (key changes)

```diff
- "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
+ "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

- "photographer_id" text NOT NULL,
+ "photographer_id" uuid NOT NULL,
```

All foreign key columns also changed from `text` to `uuid`.
