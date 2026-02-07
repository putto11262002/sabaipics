## Slice 1: Desktop Auth Fix (Clerk Identity + SabaiPics Desktop Session)

Goal: stop the desktop uploader from forcing re-login every few minutes by introducing a SabaiPics-issued refreshable desktop session, while keeping Clerk as the identity provider.

Design constraints

- Clerk session JWTs are short-lived; do not store a Clerk JWT in the desktop keychain and expect it to remain valid.
- Never put long-lived secrets (refresh tokens) in redirect URLs.
- Desktop should hold a long-lived, revocable credential (refresh token) and mint short-lived access tokens.

Terms

- Clerk token: short-lived Clerk session token (JWT) obtained via Clerk `getToken()` in a browser context.
- Desktop access token: SabaiPics-issued JWT used for API requests.
- Desktop refresh token: SabaiPics-issued opaque token stored in keychain and used to mint new access tokens.

---

### Sub-slice 1 (ship): DB + Middleware + API

Scope: backend-only. Adds storage + endpoints + middleware so the platform can issue/refresh desktop tokens.

Out of scope (later slices)

- Dashboard `/auth/desktop` bridge page
- Desktop uploader TokenCore, guard UI, OAuth retry UX

#### 1) Database schema (packages/db)

Add tables:

1. `desktop_auth_codes` (one-time code to redeem after browser sign-in)

- `id` uuid PK
- `code_hash` text UNIQUE (hash of plaintext code)
- `clerk_user_id` text NOT NULL
- `device_name` text NULL
- `created_at` timestamp DEFAULT now
- `expires_at` timestamp NOT NULL (e.g. now + 2 minutes)
- `used_at` timestamp NULL

2. `desktop_sessions` (refresh session; supports rotation)

- `id` uuid PK
- `clerk_user_id` text NOT NULL
- `refresh_token_hash` text UNIQUE
- `refresh_token_hash_prev` text NULL
- `refresh_token_prev_expires_at` timestamp NULL (rotation grace window, e.g. now + 60s)
- `device_name` text NULL
- `created_at` timestamp DEFAULT now
- `last_used_at` timestamp NULL
- `expires_at` timestamp NOT NULL (e.g. now + 30 days)
- `revoked_at` timestamp NULL

Indexes:

- `desktop_auth_codes(code_hash)` unique
- `desktop_sessions(refresh_token_hash)` unique
- `desktop_sessions(clerk_user_id)`

Notes:

- Store only hashes of codes/tokens; never store raw refresh tokens.
- Hashing should use a server-side pepper/secret.

#### 2) Worker env/secrets (apps/api)

Add new env vars:

- `DESKTOP_ACCESS_JWT_SECRET` (HS256 signing secret for desktop access JWT)
- `DESKTOP_REFRESH_TOKEN_PEPPER` (pepper used in refresh token hashing)

Optional (recommended):

- `DESKTOP_REFRESH_ROTATION_GRACE_SECONDS` (default 60)
- `DESKTOP_AUTH_CODE_TTL_SECONDS` (default 120)
- `DESKTOP_ACCESS_TOKEN_TTL_SECONDS` (default 900)
- `DESKTOP_REFRESH_TOKEN_TTL_SECONDS` (default 30 days)

#### 3) Token formats

Desktop access token (JWT, HS256 via `jose`, Workers-compatible)

- `aud`: `"desktop-api"`
- `sub`: `<clerkUserId>`
- `sid`: `<desktopSessionId>`
- `iat`, `exp`

Desktop refresh token (opaque)

- Random bytes encoded (e.g. base64url)
- Stored as `hash(refreshToken + pepper)`

#### 4) API endpoints (apps/api)

Create a new router, e.g. `apps/api/src/routes/desktop-auth.ts`, mounted under `/desktop/auth`.

1. `POST /desktop/auth/exchange` (Clerk-authenticated)

- Auth: requires Clerk (use existing `createClerkAuth()` + `requireAuth()`)
- Input: `{ deviceName?: string }`
- Output: `{ code: string, expiresAt: number }`
- Behavior:
  - Create a short-lived one-time `code` (plaintext returned once)
  - Store only `code_hash` + `clerk_user_id` + expiry

2. `POST /desktop/auth/redeem` (public)

- Auth: none
- Input: `{ code: string, deviceName?: string }`
- Output: `{ accessToken: string, accessTokenExpiresAt: number, refreshToken: string, refreshTokenExpiresAt: number }`
- Behavior:
  - Hash code, lookup unused + unexpired code
  - Mark `used_at`
  - Create `desktop_sessions` row
  - Return plaintext refresh token (once) and access token

3. `POST /desktop/auth/refresh` (public; refresh-token authenticated)

- Auth: refresh token in JSON body
- Input: `{ refreshToken: string }`
- Output: same as redeem (new access + rotated refresh)
- Behavior:
  - Hash refresh token and find session by current hash OR previous hash (within grace)
  - Reject if revoked/expired
  - Rotate refresh token:
    - Move current hash -> prev hash with `refresh_token_prev_expires_at = now + grace`
    - Set new current hash
  - Mint new access token

Rotation grace note:

- If the request matches the previous (grace) refresh token, do not rotate again. Return a new access token and indicate the refresh token is unchanged (client should keep its current refresh token).

4. `POST /desktop/auth/revoke` (public; refresh-token authenticated)

- Input: `{ refreshToken: string }`
- Output: 204
- Behavior: revoke session (`revoked_at = now`)

Errors:

- Use existing API error conventions (`apiError`, typed codes) with:
  - `UNAUTHENTICATED` for invalid/expired code or refresh token
  - `FORBIDDEN` if user is blocked (if introduced later)

#### 5) Middleware: accept Desktop access tokens OR Clerk tokens

Problem: Current global auth uses Clerk `authenticateRequest()` only. Desktop access tokens must also populate the same `c.set("auth", { userId, sessionId })` shape so existing `requirePhotographer()` continues to work.

Add a new middleware (recommended placement: `packages/auth/src/middleware.ts` or a sibling) that:

1. Checks `Authorization: Bearer <token>`
2. Tries to verify as a SabaiPics desktop access JWT:
   - HS256 verify with `DESKTOP_ACCESS_JWT_SECRET`
   - Enforce `aud = "desktop-api"`
   - Extract `sub` (Clerk user id) + `sid` (desktop session id)
   - If valid, set `auth = { userId: sub, sessionId: sid }` and skip Clerk verification
3. If not a desktop token, fall back to Clerk `authenticateRequest()` (current behavior)

Mounting:

- Update `apps/api/src/index.ts` to use the new middleware in place of `createClerkAuth()` for `/*`.
- Do not change FTP routes ordering (they must remain before the global auth middleware, as today).

#### 6) Backwards compatibility

No existing web/dashboard flows should break:

- Clerk JWTs should still authenticate exactly as today.
- Only new `/desktop/auth/*` routes and desktop access JWT verification are additive.
