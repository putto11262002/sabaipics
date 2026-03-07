# Participant Session System

## Goal

Introduce persistent, session-based identity for event participants (photo searchers). Not full auth — a long-lived session that preserves selfies, search history, and LINE identity across visits. Sessions expire after 6 months and are cleaned up, but future LINE OAuth logins reconcile with prior records.

## Current State

- Event frontend is fully anonymous — each search is a one-off `searchId`
- LINE OAuth is transactional: used only to deliver photos, tokens discarded after
- CF KV (`LINE_PENDING_KV`) stores only pending delivery state (10-min TTL)
- `lineUserId` recorded in `line_deliveries` but never reused
- PDPA consent stored in `sessionStorage` (lost on tab close)
- Friendship status checked live every time (no caching)
- No persistent participant identity exists

## Design

### Data Model

```
participant_sessions
  id              uuid PK
  token           text UNIQUE (cookie value, cryptographically random)
  lineUserId      text NULLABLE (set after first OAuth)
  isFriend        boolean DEFAULT false (updated via webhook + OAuth check)
  consentAcceptedAt timestamptz NULLABLE
  expiresAt       timestamptz (created + 6 months)
  createdAt       timestamptz
  deletedAt       timestamptz NULLABLE (soft delete for PDPA)

selfies
  id              uuid PK
  sessionId       uuid FK -> participant_sessions
  r2Key           text (selfie image path in R2)
  createdAt       timestamptz
  deletedAt       timestamptz NULLABLE (soft delete for PDPA)

participant_searches (existing table, modified)
  id              uuid PK
  sessionId       uuid FK -> participant_sessions (NEW)
  selfieId        uuid FK -> selfies (REPLACES selfieR2Key)
  eventId         uuid FK -> events
  matchedPhotoIds uuid[]
  matchCount      integer
  searchedAt      timestamptz
  deletedAt       timestamptz NULLABLE (soft delete for PDPA)

downloads
  id              uuid PK
  sessionId       uuid FK -> participant_sessions
  searchId        uuid FK -> participant_searches
  eventId         uuid FK -> events
  photoIds        uuid[] (which photos were downloaded)
  method          enum ('zip' | 'share' | 'single')
  photoCount      integer
  createdAt       timestamptz

line_deliveries (existing table, modified)
  ...existing columns...
  sessionId       uuid FK -> participant_sessions (NEW — direct link)
```

### Key Relationships

- Session 1:many Selfies (participant can have multiple selfies)
- Session 1:many Searches (search history tied to session)
- Session 1:many Downloads (self-serve photo retrieval)
- Session 1:many LINE Deliveries (push via LINE)
- Search -> Selfie (which selfie was used for this search)
- Download -> Search (which search triggered the download)
- LINE Delivery -> Search (which search triggered the delivery)
- Session has optional `lineUserId` (identity anchor for reconciliation)

Downloads and LINE deliveries are both **delivery methods** — ways a participant gets their photos. Both link directly to the session for a complete participant view.

### Session Lifecycle

1. **Creation** — On first visit (or after expiry), create session + set HTTP-only cookie (6-month max-age)
2. **LINE OAuth** — After OAuth callback, set `lineUserId` on session. If a previous (expired/deleted) session had the same `lineUserId`, reconcile historical records
3. **Expiry** — After 6 months, soft-delete session row + cookie expires naturally
4. **PDPA deletion** — Participant can request deletion of selfies, search history, or entire session

### Reconciliation

When a LINE OAuth login occurs and we get a `lineUserId`:

1. **Current session already has that `lineUserId`** → no-op, extend expiration
2. **Another active session exists with same `lineUserId`** → reuse that session:
   - Migrate any data from the current (anonymous) session to the existing one
   - Swap the cookie to point to the existing session
   - Extend expiration to 6 months from now
   - Delete the now-empty anonymous session
3. **Only expired/deleted sessions have that `lineUserId`** → keep current session, set `lineUserId` on it, link historical data
4. **No prior session with that `lineUserId`** → just set `lineUserId` on current session

This means `lineUserId` acts as a session merge key — same LINE account always converges to one active session, regardless of device or cookie state.

### Friendship Tracking

Three sources, layered:

1. **OAuth callback** — Initial `friendFlag` from LINE Login API, sets `isFriend` on session
2. **LINE webhook** — `follow`/`unfollow` events update `isFriend` in real-time (matched by `lineUserId`)
3. **Delivery-time check** — Still verify live via Messaging API `getProfile` before pushing (safety net)

Benefits:
- Can skip OAuth redirect entirely if session already has `lineUserId` + `isFriend=true`
- Can show "add friend" prompt proactively if `isFriend=false`
- Webhook eliminates the 3-second polling loop on the callback page

### Download UX (Mobile)

Current: Bulk download creates a `.zip` — works on desktop but on iOS it goes to Files app, not Photos gallery.

Strategy: Use Web Share API with `<a download>` fallback.

```
if (navigator.canShare?.({ files: [imageFile] })) → native share sheet (save to Photos)
else → traditional <a download>.zip (Files app on iOS, gallery on Android)
```

| Platform | Share API | Fallback |
|---|---|---|
| iOS Safari 15+ | Share sheet → Save to Photos | .zip → Files app |
| iOS Safari < 15 | Not supported | .zip → Files app |
| Android Chrome 76+ | Share sheet → gallery | .zip → gallery |
| LINE in-app browser | Often blocked (WebView) | .zip → depends on WebView |

### What the Session Replaces

| Before | After |
|---|---|
| `sessionStorage.pdpa_consent` (lost on tab close) | `session.consentAcceptedAt` (persisted) |
| `participant_searches.selfieR2Key` (per-search) | `selfies` table (reusable across searches) |
| Anonymous `searchId` (no continuity) | `sessionId` links all activity |
| `lineUserId` only in `line_deliveries` | `session.lineUserId` (first-class identity) |
| Friendship polled live every time | `session.isFriend` updated via webhook |
| No download tracking | `downloads` table with method + photo history |
| Zip-only download (bad on iOS) | Web Share API with zip fallback |

### LINE OAuth Flow Changes

With the session in place, the LINE delivery flow simplifies:

1. **Returning user with `lineUserId` + `isFriend=true`** → Skip OAuth entirely, go straight to delivery
2. **Returning user with `lineUserId` + `isFriend=false`** → Show "re-add friend" prompt before delivery, no OAuth needed
3. **New user (no `lineUserId`)** → Current OAuth flow, but store `lineUserId` on session after callback
4. **Expired session, re-login** → OAuth again, reconcile via `lineUserId` match

### Consolidating State (Replaces Scattered KV/SessionStorage)

Everything that was spread across `sessionStorage`, KV flags, and transient state now lives on the session:

- PDPA consent → `session.consentAcceptedAt`
- LINE identity → `session.lineUserId`
- Friendship status → `session.isFriend` (webhook-updated)
- Selfie data → `selfies` table (linked to session)
- Search history → `participant_searches` (linked to session)
- Download history → `downloads` table (linked to session)

### What Stays the Same

- CF KV for pending delivery state (10-min TTL — correct scope for transient OAuth flow)
- `line_deliveries` table (delivery records, credit tracking — now also linked to session)
- Live friendship check before delivery (safety net)
- Rate limiting (per-IP for search, per-user for friendship polling)

### Future Possibilities (Not In Scope Now)

- Proactive matching: "notify me when new photos match this selfie"
- Cross-event selfie reuse: same selfie searches multiple events
- Self-service PDPA portal: participant views/deletes their data
- Push notifications for new event photos

## Implementation Plan

### Conventions (from codebase exploration)

**DB Schema:**
- UUIDs: `uuid('col').primaryKey().default(sql\`gen_random_uuid()\`)`
- Timestamps: `timestamptz()` helper + `createdAtCol()` from `src/db/schema/common.ts`
- Soft deletes: nullable `deletedAt` + active view (`pgView` filtering `deleted_at IS NULL`)
- Enums: `const statuses = [...] as const` + `text('status', { enum: statuses })`
- Relations: separate `src/db/schema/relations.ts` file
- Indexes: `{table}_{columns}_{idx|uidx}` naming
- Types: export `$inferSelect` and `$inferInsert`
- JSONB for flexible data with `$type<Interface>()`

**API Routes:**
- Hono method chaining, `zValidator()` for request validation
- `safeTry` + `ResultAsync.fromPromise()` for error handling (neverthrow)
- `HandlerError` type: `{ code, message, cause? }`
- Responses: `{ data }` for success, `{ error: { code, message } }` for failure
- No cookies currently — this will be the first cookie-based auth for participants
- Participant routes are public (no auth middleware), mounted before `createAnyAuth()`

**Participant Flow:**
- `searchId` generated via `crypto.randomUUID()` server-side
- Selfie uploaded as FormData directly to search endpoint (no presign)
- Selfie stored at `selfies/{searchId}.jpg` in R2
- Consent tracked in `sessionStorage` (frontend) + `consentAcceptedAt` (DB per-search)
- DB uses both HTTP adapter (fast, no tx) and WebSocket adapter (transactions)

### Phase 1: Session Foundation

**New files:**
- `src/db/schema/participant-sessions.ts` — Session table schema
- `src/db/schema/selfies.ts` — Selfies table schema
- `src/db/schema/downloads.ts` — Downloads table schema
- `src/api/src/middleware/participant-session.ts` — Cookie middleware (read/create session)

**Modified files:**
- `src/db/schema/participant-searches.ts` — Add `sessionId`, `selfieId`; remove `selfieR2Key`
- `src/db/schema/line-deliveries.ts` — Add `sessionId`
- `src/db/schema/relations.ts` — Add new relations
- `src/db/schema/index.ts` — Export new tables
- `src/api/src/index.ts` — Add session middleware before participant routes
- `src/api/src/types.ts` — Add session to Hono context variables

**Schema details:**

```typescript
// src/db/schema/participant-sessions.ts
export const participantSessions = pgTable('participant_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  token: text('token').notNull().unique(),
  lineUserId: text('line_user_id'),
  isFriend: boolean('is_friend').notNull().default(false),
  consentAcceptedAt: timestamptz('consent_accepted_at'),
  expiresAt: timestamptz('expires_at').notNull(),
  createdAt: createdAtCol(),
  deletedAt: timestamptz('deleted_at'),
}, (table) => [
  index('participant_sessions_token_idx').on(table.token),
  index('participant_sessions_line_user_id_idx').on(table.lineUserId),
  index('participant_sessions_deleted_at_expires_at_idx').on(table.deletedAt, table.expiresAt),
]);

export const activeParticipantSessions = pgView('active_participant_sessions').as((qb) =>
  qb.select().from(participantSessions)
    .where(sql`${participantSessions.deletedAt} IS NULL
      AND ${participantSessions.expiresAt} > now()`),
);
```

```typescript
// src/db/schema/selfies.ts
export const selfies = pgTable('selfies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid('session_id').notNull().references(() => participantSessions.id),
  r2Key: text('r2_key').notNull(),
  createdAt: createdAtCol(),
  deletedAt: timestamptz('deleted_at'),
}, (table) => [
  index('selfies_session_id_idx').on(table.sessionId),
]);
```

```typescript
// src/db/schema/downloads.ts
export const downloadMethods = ['zip', 'share', 'single'] as const;
export type DownloadMethod = (typeof downloadMethods)[number];

export const downloads = pgTable('downloads', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid('session_id').notNull().references(() => participantSessions.id),
  searchId: uuid('search_id').notNull().references(() => participantSearches.id),
  eventId: uuid('event_id').notNull().references(() => events.id),
  photoIds: uuid('photo_ids').array().notNull(),
  method: text('method', { enum: downloadMethods }).notNull(),
  photoCount: integer('photo_count').notNull(),
  createdAt: createdAtCol(),
}, (table) => [
  index('downloads_session_id_idx').on(table.sessionId),
  index('downloads_search_id_idx').on(table.searchId),
]);
```

**Session middleware:**

```typescript
// src/api/src/middleware/participant-session.ts
// Reads session token from cookie, resolves session from DB
// If no cookie or expired: creates new session, sets cookie (6-month max-age, HTTP-only, SameSite=Lax)
// Sets c.set('participantSession', session) on context
// Token: 32-byte crypto.getRandomValues() → base64url
```

**Migration:** Single Drizzle migration covering all new tables + column additions.

### Phase 2: Wire Up Search Flow

**Modified files:**
- `src/api/src/routes/participant/index.ts` — Search endpoint:
  - Read `sessionId` from context (middleware)
  - Create selfie record in `selfies` table (instead of inline R2 key)
  - Create search with `sessionId` + `selfieId` (instead of standalone `selfieR2Key`)
  - Track consent on session (first search sets `consentAcceptedAt`)
- `src/event/src/routes/events/search.tsx` — Remove `sessionStorage` consent; query session state instead
- `src/event/src/lib/api.ts` — Ensure cookies sent with requests (`credentials: 'include'`)

### Phase 3: Wire Up Downloads

**Modified files:**
- `src/api/src/routes/participant/index.ts` — Download endpoints:
  - Single + bulk download: create `downloads` record with session context
  - Accept `method` param from frontend (zip/share/single)
- `src/event/src/components/ResultsStep.tsx` — Web Share API with fallback:
  - Detect `navigator.canShare` → use share API for mobile
  - Fall back to zip download
  - Pass `method` to API

### Phase 4: Wire Up LINE Delivery + Friendship

**Modified files:**
- `src/api/src/routes/participant/line.ts`:
  - OAuth callback: set `lineUserId` + `isFriend` on session
  - Deliver endpoint: set `sessionId` on `line_deliveries` record
  - Skip OAuth if session already has `lineUserId` + `isFriend=true`
  - New endpoint: `GET /participant/session/line-status` (check session's LINE state)
- `src/event/src/components/LineDeliveryButton.tsx`:
  - Check session LINE state first
  - If `lineUserId` + `isFriend`: skip OAuth, go straight to deliver
  - If `lineUserId` + `!isFriend`: show re-add friend prompt
  - If no `lineUserId`: current OAuth flow

### Phase 5: LINE Webhook for Friendship

**New/modified files:**
- `src/api/src/routes/webhooks/line.ts` (new or extend existing):
  - Handle `follow` event: find session by `lineUserId`, set `isFriend=true`
  - Handle `unfollow` event: find session by `lineUserId`, set `isFriend=false`
  - Verify webhook signature (LINE channel secret HMAC)
- LINE Official Account console: configure webhook URL

### Phase 6: Session Reconciliation

**Modified files:**
- `src/api/src/routes/participant/line.ts` — OAuth callback:
  - After getting `lineUserId`, check for other sessions with same `lineUserId`
  - If found: migrate selfies, searches, downloads to current session (or just link via `lineUserId` for queries)
- Decision: migrate records vs. query across sessions by `lineUserId`

### Phase 7: Cleanup & PDPA

**New files:**
- `src/api/src/routes/participant/session.ts` — Session management endpoints:
  - `GET /participant/session` — Current session state (consent, LINE status, selfie count)
  - `DELETE /participant/session/selfies/:id` — Soft-delete a selfie
  - `DELETE /participant/session/searches/:id` — Soft-delete a search
  - `DELETE /participant/session` — Soft-delete entire session + all related data
- Scheduled worker or admin endpoint: hard-delete expired sessions (>6 months past expiry)

## Open Questions

- [ ] Cookie scope: per-event subdomain or global?
- [ ] Session creation timing: on first page load or on first action (consent/upload)?
- [ ] Hard delete schedule: how long after soft delete before purging from DB?
- [ ] Should selfie R2 objects be deleted on PDPA request, or just DB references?
- [ ] Webhook endpoint: new route or extend existing LINE webhook handler?
- [ ] Reconciliation strategy: migrate records to new session or query across sessions by `lineUserId`?
- [ ] CORS: `credentials: 'include'` requires explicit `Access-Control-Allow-Origin` (no wildcard) — need to set event frontend origin
