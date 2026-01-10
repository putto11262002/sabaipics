# Implementation Plan: T-1 Database Schema

**Task:** T-1 — Create database schema (all domain tables)
**Root:** `BS_0001_S-1`
**Status:** Approved
**Date:** 2026-01-10

---

## Context

### Upstream References
- Execution Plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Task Definition: `docs/logs/BS_0001_S-1/tasks.md#T-1`

### Evidence Gathered

1. **Existing pattern** (`packages/db/src/schema/test.ts`):
   - Uses `pgTable`, exports types via `$inferSelect/$inferInsert`

2. **Schema conventions** (`docs/tech/db/schema.md`):
   - DBSCHEMA-001: Use `text({enum: [...]})` for flexible enums
   - DBSCHEMA-002: Type JSONB with `.$type<T>()`
   - DBSCHEMA-003: Export select/insert types
   - DBSCHEMA-004: Use `timestamp({mode: "string", withTimezone: true})`
   - DBSCHEMA-005: Use `defineRelation` for relations
   - DBSCHEMA-006/007: Define indexes and constraints

3. **Rekognition types** from `apps/api/src/lib/rekognition/client.ts`:
   - `FaceRecord`, `BoundingBox` exported from `@aws-sdk/client-rekognition`

4. **Tech stack** (`docs/tech/TECH_STACK.md`):
   - Drizzle ORM ^0.45.0
   - `@neondatabase/serverless` driver
   - Neon Postgres serverless

---

## Decisions

| # | Decision | Resolution |
|---|----------|------------|
| 1 | UUID generation | DB-side via `gen_random_uuid()` |
| 2 | FK cascade behavior | RESTRICT (soft delete out of scope) |
| 3 | Keep `_db_test` table | Yes (used for connection testing) |

---

## Schema Design

### Tables Overview

| Table | PK | Key Columns | Notes |
|-------|-----|-------------|-------|
| `photographers` | UUID | clerk_id (UNIQUE), email, name, pdpa_consent_at | Auth anchor |
| `credit_packages` | UUID | name, credits, price_thb, active, sort_order | Admin-editable |
| `credit_ledger` | UUID | photographer_id (FK), amount, type, expires_at | INDEX on expires_at |
| `events` | UUID | photographer_id (FK), access_code (UNIQUE), rekognition_collection_id | 30-day expiry |
| `photos` | UUID | event_id (FK), r2_key, status, face_count | Single normalized JPEG |
| `faces` | UUID | photo_id (FK), rekognition_response (JSONB) | Full response stored |
| `consent_records` | UUID | photographer_id (FK), consent_type, ip_address | PDPA compliance |

### Enums (as const arrays per DBSCHEMA-001)

```typescript
// credit_ledger.type
export const creditLedgerTypes = ['purchase', 'upload'] as const;
export type CreditLedgerType = typeof creditLedgerTypes[number];

// photos.status
export const photoStatuses = ['processing', 'indexed', 'failed'] as const;
export type PhotoStatus = typeof photoStatuses[number];

// consent_records.consent_type
export const consentTypes = ['pdpa'] as const;
export type ConsentType = typeof consentTypes[number];
```

### JSONB Types (per DBSCHEMA-002)

```typescript
// faces.bounding_box - quick access to face location
import type { BoundingBox } from "@aws-sdk/client-rekognition";
boundingBox: jsonb().$type<BoundingBox>()

// faces.rekognition_response - full response for model training
import type { FaceRecord } from "@aws-sdk/client-rekognition";
rekognitionResponse: jsonb().$type<FaceRecord>()
```

### Indexes (per DBSCHEMA-006)

| Table | Index | Purpose |
|-------|-------|---------|
| `photographers` | `clerk_id` | Auth lookup (UNIQUE constraint) |
| `credit_ledger` | `photographer_id, expires_at` | FIFO balance queries |
| `events` | `photographer_id` | List photographer's events |
| `events` | `access_code` | QR code lookup (UNIQUE constraint) |
| `photos` | `event_id` | Gallery listing |
| `faces` | `photo_id` | Face lookup by photo |

### Foreign Keys (all RESTRICT)

| Table | Column | References |
|-------|--------|------------|
| `credit_ledger` | `photographer_id` | `photographers.id` |
| `events` | `photographer_id` | `photographers.id` |
| `photos` | `event_id` | `events.id` |
| `faces` | `photo_id` | `photos.id` |
| `consent_records` | `photographer_id` | `photographers.id` |

---

## Implementation Steps

### Step 1: Create Schema Files

Create separate files for each table in `packages/db/src/schema/`:

```
packages/db/src/schema/
├── index.ts           # Export all schemas
├── test.ts            # Existing (keep)
├── photographers.ts   # NEW
├── credit-packages.ts # NEW
├── credit-ledger.ts   # NEW
├── events.ts          # NEW
├── photos.ts          # NEW
├── faces.ts           # NEW
└── consent-records.ts # NEW
```

### Step 2: Define Each Table

For each table:
1. Define the `pgTable` with all columns
2. Apply timestamp convention: `timestamp({ mode: "string", withTimezone: true })`
3. Add indexes in the table config callback
4. Export `$inferSelect` and `$inferInsert` types

### Step 3: Define Relations

Create `packages/db/src/schema/relations.ts` using Drizzle v2 `relations()` API:
- photographers → credit_ledger (one-to-many)
- photographers → events (one-to-many)
- photographers → consent_records (one-to-many)
- events → photos (one-to-many)
- photos → faces (one-to-many)

### Step 4: Update Index Export

Update `packages/db/src/schema/index.ts` to export all schemas and relations.

### Step 5: Generate Migration

```bash
pnpm --filter=@sabaipics/db db:generate
```

### Step 6: Validate

```bash
pnpm --filter=@sabaipics/db check-types
```

---

## Validation Criteria

Per task acceptance criteria:
- [ ] All 7 tables created with correct columns and types
- [ ] `faces.rekognition_response` is JSONB with proper type
- [ ] `credit_ledger.expires_at` indexed for balance queries
- [ ] Foreign keys configured with RESTRICT
- [ ] TypeScript types exported for each table
- [ ] Migration generates successfully

---

## Files to Create/Modify

| Action | Path |
|--------|------|
| CREATE | `packages/db/src/schema/photographers.ts` |
| CREATE | `packages/db/src/schema/credit-packages.ts` |
| CREATE | `packages/db/src/schema/credit-ledger.ts` |
| CREATE | `packages/db/src/schema/events.ts` |
| CREATE | `packages/db/src/schema/photos.ts` |
| CREATE | `packages/db/src/schema/faces.ts` |
| CREATE | `packages/db/src/schema/consent-records.ts` |
| CREATE | `packages/db/src/schema/relations.ts` |
| MODIFY | `packages/db/src/schema/index.ts` |

---

## Out of Scope

- Soft delete columns (`deleted_at`) - future enhancement
- Seed data for credit packages - separate task
- Migration execution - human runs manually
