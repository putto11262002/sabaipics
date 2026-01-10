# Implementation Summary: T-1 Database Schema

**Task:** T-1 — Create database schema (all domain tables)
**Root:** `BS_0001_S-1`
**Date:** 2026-01-10
**Iteration:** 1

---

## What Was Implemented

Created Drizzle ORM schema for 7 domain tables with migrations, relations, and TypeScript types.

### Tables Created

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `photographers` | Auth anchor for Clerk users | `clerk_id` UNIQUE, `pdpa_consent_at` for compliance |
| `credit_packages` | Admin-editable pricing tiers | `active` flag, `sort_order` for display |
| `credit_ledger` | Append-only credit transactions | FIFO expiry via composite index |
| `events` | Photographer events | `access_code` UNIQUE for QR, nullable `rekognition_collection_id` |
| `photos` | Uploaded photos | `status` enum, `r2_key` for storage |
| `faces` | Detected faces per photo | JSONB for full Rekognition response |
| `consent_records` | PDPA compliance audit trail | IP address tracking |

### Files Created

```
packages/db/src/schema/
├── types.ts           # Rekognition JSONB types (BoundingBox, RekognitionFaceRecord)
├── photographers.ts   # Photographer table + types
├── credit-packages.ts # Credit package table + types
├── credit-ledger.ts   # Credit ledger table + types + enum
├── events.ts          # Event table + types
├── photos.ts          # Photo table + types + enum
├── faces.ts           # Face table + types
├── consent-records.ts # Consent record table + types + enum
├── relations.ts       # Drizzle relations for query API
└── index.ts           # Updated to export all

packages/db/drizzle/
└── 0001_mixed_viper.sql  # Generated migration
```

### Key Patterns Applied

1. **DBSCHEMA-001** - Text enums:
   - `creditLedgerTypes`: `['purchase', 'upload']`
   - `photoStatuses`: `['processing', 'indexed', 'failed']`
   - `consentTypes`: `['pdpa']`

2. **DBSCHEMA-002** - Typed JSONB:
   - `faces.bounding_box` → `BoundingBox`
   - `faces.rekognition_response` → `RekognitionFaceRecord`

3. **DBSCHEMA-004** - Timestamps:
   - All timestamps use `timestamp({ mode: "string", withTimezone: true })`

4. **DBSCHEMA-005** - Relations defined in `relations.ts`

5. **DBSCHEMA-006** - Indexes:
   - `credit_ledger_photographer_expires_idx` (composite for FIFO queries)
   - `credit_ledger_stripe_session_idx` (idempotency lookup)
   - `events_access_code_idx` (QR lookup)
   - Standard FK indexes on all foreign key columns

### Type Exports

Each table exports:
- `<TableName>` - Select type (e.g., `Photographer`, `Event`)
- `New<TableName>` - Insert type (e.g., `NewPhotographer`, `NewEvent`)

Plus enum types:
- `CreditLedgerType`
- `PhotoStatus`
- `ConsentType`

Plus Rekognition types (from `types.ts`):
- `BoundingBox`
- `RekognitionFaceRecord`
- `RekognitionFace`
- `FaceDetail`

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UUID generation | DB-side `gen_random_uuid()` | Simpler, no pre-insert ID needed |
| FK cascade | RESTRICT | Prevent accidental deletion; soft delete is future work |
| Rekognition types | Local in `types.ts` | Avoid adding `@aws-sdk/client-rekognition` to db package |
| Type naming | Prefix with `Rekognition` | Avoid collision with `Face` table type |

---

## Validation

- ✅ TypeScript type checking passed
- ✅ Migration generated successfully
- ⏳ Migration not yet applied (requires human to run on staging)

---

## Next Steps

1. **Human action required:** Run migration on staging
   ```bash
   pnpm --filter=@sabaipics/db db:migrate
   ```

2. Dependent tasks can now start:
   - T-2: `requirePhotographer` middleware
   - T-3: Admin credit packages API
   - T-4: Clerk webhook handler
