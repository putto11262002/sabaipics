# Implementation Plan

Task: `T-5 — PDPA consent API`
Root: `docs/logs/BS_0001_S-1/`
Date: `2026-01-10`
Owner: AI-assisted

## Inputs

- Task: `docs/logs/BS_0001_S-1/tasks.md` (section: `T-5`)
- Upstream plan: `docs/logs/BS_0001_S-1/plan/final.md`
- Load-bearing refs: None (straightforward feature)

## Goal / non-goals

- Goal: Create `POST /consent` endpoint that records PDPA consent and updates photographer record
- Non-goals:
  - Consent revocation (out of scope)
  - Multiple consent types (only PDPA for now)
  - Consent version tracking

## Repo exemplars (evidence)

- `apps/api/src/routes/admin/credit-packages.ts` — Route structure, error helpers, zValidator pattern
- `apps/api/src/middleware/require-photographer.ts` — Photographer auth middleware, sets `c.var.photographer` with `{ id, pdpaConsentAt }`
- `packages/db/src/schema/consent-records.ts` — Schema with `consentType` enum (only "pdpa"), `ipAddress` field
- `packages/db/src/schema/photographers.ts` — Has `pdpaConsentAt` field
- `apps/api/src/routes/admin/credit-packages.test.ts` — Test patterns using testClient, mock DB

## Approach (data-driven)

### Route: `POST /consent`

1. Apply `requirePhotographer()` middleware (ensures auth + photographer exists)
2. Check if `c.var.photographer.pdpaConsentAt` is already set → return 409 Conflict
3. Get client IP from `CF-Connecting-IP` header (Cloudflare standard)
4. In a transaction:
   - Insert `consent_records` row with `{ photographerId, consentType: 'pdpa', ipAddress }`
   - Update `photographers.pdpaConsentAt = NOW()`
5. Return 201 with consent record

### Route registration

- Create `apps/api/src/routes/consent.ts` (new file)
- Register in `apps/api/src/index.ts` after Clerk middleware
- Chain with `requirePhotographer()` middleware

## Contracts (only if touched)

### API

```
POST /consent
Headers: Authorization (Clerk session)
Body: (none required)

201 Created
{
  "data": {
    "id": "uuid",
    "consentType": "pdpa",
    "createdAt": "ISO8601"
  }
}

409 Conflict (already consented)
{
  "error": {
    "code": "ALREADY_CONSENTED",
    "message": "PDPA consent already recorded"
  }
}

401 Unauthenticated (no valid session)
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication required"
  }
}

403 Forbidden (photographer not in DB)
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Photographer account not found"
  }
}
```

### DB

- `INSERT INTO consent_records (photographer_id, consent_type, ip_address)`
- `UPDATE photographers SET pdpa_consent_at = NOW() WHERE id = ?`

## Success path

1. Authenticated photographer (without prior consent) calls `POST /consent`
2. Consent record created, photographer updated
3. Returns 201 with consent data
4. Subsequent requests return 409 (idempotent behavior)

## Failure modes / edge cases (major only)

- **Already consented**: Return 409 (checked via `pdpaConsentAt` in photographer context)
- **No IP header**: Store `null` in `ip_address` (acceptable for audit)
- **DB transaction failure**: Return 500, no partial writes

## Validation plan

- Tests to add:
  - Unit test: happy path (consent recorded)
  - Unit test: 409 when already consented
  - Unit test: 401 without auth
  - Unit test: IP address capture
- Commands to run:
  - `pnpm --filter=@sabaipics/api test`
  - `pnpm typecheck`
  - `pnpm build`

## Rollout / rollback

- Low risk (new endpoint, no existing behavior changed)
- No migrations needed (schema exists)
- Rollback: remove route registration

## Open questions

None - all requirements are clear from task and upstream plan.
