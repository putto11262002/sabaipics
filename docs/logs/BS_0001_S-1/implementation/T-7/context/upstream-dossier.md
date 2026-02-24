# Upstream Dossier: T-7 (Dashboard API)

**Root:** BS_0001_S-1
**Task:** T-7
**Generated:** 2026-01-10

---

## Task Goal

Create `GET /dashboard` endpoint returning credit balance, events list, and stats.

**Type:** feature
**StoryRefs:** US-3
**PrimarySurface:** API
**Scope:** `apps/api/src/routes/dashboard.ts`

---

## Acceptance Criteria (verbatim from tasks.md)

- Returns `{ credits: { balance, nearestExpiry }, events: [...], stats: {...} }`
- Balance uses FIFO unexpired sum query
- Events sorted by createdAt desc
- Stats include totalPhotos, totalFaces

**Tests:**

- Unit test balance calculation with expiry
- Test empty state (new user)

**Rollout/Risk:** Low risk

---

## Dependencies

| Task | Description                                | Done |
| ---- | ------------------------------------------ | ---- |
| T-1  | Create database schema (all domain tables) | Yes  |
| T-2  | Implement requirePhotographer middleware   | Yes  |

Both dependencies are complete. T-7 can proceed.

---

## Load-Bearing References

| Path                                              | Purpose                                        |
| ------------------------------------------------- | ---------------------------------------------- |
| `docs/logs/BS_0001_S-1/plan/final.md`             | Execution plan with API contract and DB schema |
| `packages/db/src/schema/credit-ledger.ts`         | Credit ledger table definition                 |
| `packages/db/src/schema/events.ts`                | Events table definition                        |
| `packages/db/src/schema/photos.ts`                | Photos table definition                        |
| `packages/db/src/schema/faces.ts`                 | Faces table definition                         |
| `apps/api/src/routes/consent.ts`                  | Reference implementation for API patterns      |
| `apps/api/src/middleware/require-photographer.ts` | Auth middleware providing photographer context |

---

## API Contract (from plan/final.md)

```
GET /dashboard
Response: {
  credits: { balance, nearestExpiry? },
  events: [{ id, name, photoCount, faceCount, createdAt }],
  stats: { totalPhotos, totalFaces }
}
```

### Balance Calculation Query (from plan)

```sql
SELECT SUM(amount)
FROM credit_ledger
WHERE photographer_id = ?
  AND expires_at > NOW()
```

### Nearest Expiry Logic

Return the earliest `expires_at` among credit rows where `amount > 0 AND expires_at > NOW()`.

---

## Database Tables Involved

### credit_ledger

| Column            | Type        | Notes                                         |
| ----------------- | ----------- | --------------------------------------------- |
| id                | uuid        | PK                                            |
| photographer_id   | uuid        | FK to photographers                           |
| amount            | integer     | Positive for purchase, negative for deduction |
| type              | text        | Enum: 'purchase', 'upload'                    |
| stripe_session_id | text        | Nullable                                      |
| expires_at        | timestamptz | Required                                      |
| created_at        | timestamptz | Default now                                   |

**Index:** `credit_ledger_photographer_expires_idx` on (photographer_id, expires_at)

### events

| Column                    | Type        | Notes               |
| ------------------------- | ----------- | ------------------- |
| id                        | uuid        | PK                  |
| photographer_id           | uuid        | FK to photographers |
| name                      | text        | Required            |
| start_date                | timestamptz | Nullable            |
| end_date                  | timestamptz | Nullable            |
| access_code               | text        | Unique 6-char code  |
| qr_code_r2_key            | text        | Nullable            |
| rekognition_collection_id | text        | Nullable            |
| expires_at                | timestamptz | Required            |
| created_at                | timestamptz | Default now         |

**Index:** `events_photographer_id_idx` on (photographer_id)

### photos

| Column      | Type        | Notes                                   |
| ----------- | ----------- | --------------------------------------- |
| id          | uuid        | PK                                      |
| event_id    | uuid        | FK to events                            |
| r2_key      | text        | R2 path to normalized JPEG              |
| status      | text        | Enum: 'processing', 'indexed', 'failed' |
| face_count  | integer     | Default 0                               |
| uploaded_at | timestamptz | Default now                             |

**Index:** `photos_event_id_idx` on (event_id)

### faces

| Column               | Type        | Notes                      |
| -------------------- | ----------- | -------------------------- |
| id                   | uuid        | PK                         |
| photo_id             | uuid        | FK to photos               |
| rekognition_face_id  | text        | Nullable                   |
| bounding_box         | jsonb       | BoundingBox type           |
| rekognition_response | jsonb       | RekognitionFaceRecord type |
| indexed_at           | timestamptz | Default now                |

**Index:** `faces_photo_id_idx` on (photo_id)

---

## Implementation Patterns (from consent.ts reference)

1. **Env type definition:**

```typescript
type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
};
```

2. **Router setup:**

```typescript
export const dashboardRouter = new Hono<Env>().get('/', requirePhotographer(), async (c) => {
  const photographer = c.var.photographer;
  const db = c.var.db();
  // ...
});
```

3. **Response format:** Use `c.json({ data: ... })` for success responses.

---

## Implied Contracts and Queries

### Credit Balance Query

```typescript
// Sum unexpired credits
const balance = await db
  .select({ sum: sql<number>`COALESCE(SUM(amount), 0)` })
  .from(creditLedger)
  .where(
    and(eq(creditLedger.photographerId, photographer.id), gt(creditLedger.expiresAt, sql`NOW()`)),
  );
```

### Nearest Expiry Query

```typescript
// Get earliest expiry from positive (purchase) rows that haven't expired
const nearest = await db
  .select({ expiresAt: creditLedger.expiresAt })
  .from(creditLedger)
  .where(
    and(
      eq(creditLedger.photographerId, photographer.id),
      gt(creditLedger.amount, 0),
      gt(creditLedger.expiresAt, sql`NOW()`),
    ),
  )
  .orderBy(asc(creditLedger.expiresAt))
  .limit(1);
```

### Events with Photo/Face Counts Query

```typescript
// Events with aggregated stats from photos
// Need to join events -> photos and aggregate
```

`[NEED_VALIDATION]` The response structure shows `events: [{ id, name, photoCount, faceCount, createdAt }]`. The photos table already has `face_count` column, so we aggregate from photos.

### Total Stats Query

```typescript
// Total photos and faces across all events for this photographer
// Join events -> photos -> faces
```

`[NEED_VALIDATION]` Stats calculation requires joining events owned by photographer to photos.

---

## Gaps and Uncertainties

| Item                        | Status              | Notes                                                                     |
| --------------------------- | ------------------- | ------------------------------------------------------------------------- |
| `nearestExpiry` return type | `[NEED_VALIDATION]` | Is it ISO string or null? Plan shows `nearestExpiry?` suggesting optional |
| Events pagination           | `[GAP]`             | Plan shows events list but no pagination params for dashboard             |
| Stats scope                 | `[NEED_VALIDATION]` | Do stats include only indexed photos or all?                              |
| Response wrapper            | `[NEED_VALIDATION]` | Use `{ data: {...} }` wrapper like consent.ts or flat response?           |

---

## Decisions Affecting T-7

From `docs/logs/BS_0001_S-1/plan/final.md`:

| #   | Decision                                     | Impact on T-7                               |
| --- | -------------------------------------------- | ------------------------------------------- |
| 9   | Credit expiration = 6 months from purchase   | Balance query filters by expires_at > NOW() |
| 19  | Credit ledger = append-only with FIFO expiry | Balance = SUM(amount) where unexpired       |

---

## Testing Strategy

1. **Balance calculation test:**
   - Mock ledger with purchases and deductions
   - Verify SUM with expired rows excluded

2. **Empty state test:**
   - New user with no events, no credits
   - Returns `{ credits: { balance: 0, nearestExpiry: null }, events: [], stats: { totalPhotos: 0, totalFaces: 0 } }`

3. **Events ordering test:**
   - Multiple events created at different times
   - Verify descending order by createdAt
