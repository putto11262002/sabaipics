# 023 - Desktop Uploader Refreshable Auth Session

## Why

Desktop uploader auth UX was unacceptable: the app stored a short-lived Clerk session JWT in keychain, causing frequent 401s and forcing users to re-sign-in.

Clerk session tokens are intentionally short-lived; on web they are refreshed via Clerk SDK/session state. The desktop uploader doesn't have that environment, so we add a SabaiPics-issued refreshable desktop session while keeping Clerk as the identity provider.

## What Changed

Backend (Slice 1 auth sub-slice):

- Added database schema + migrations for:
  - `desktop_auth_codes` (short-lived, single-use, hashed)
  - `desktop_sessions` (refresh token sessions with rotation + grace)
- Added `/desktop/auth/*` API endpoints:
  - `POST /desktop/auth/exchange` (Clerk-authenticated) -> one-time code
  - `POST /desktop/auth/redeem` (public) -> access + refresh tokens
  - `POST /desktop/auth/refresh` (public) -> rotate refresh token + new access token
  - `POST /desktop/auth/revoke` (public) -> revoke desktop session
- Added global auth middleware that accepts either:
  - SabaiPics desktop access JWT (aud=`desktop-api`)
  - Clerk session token (existing behavior)

## Files

- DB schema: `packages/db/src/schema/desktop-auth.ts`
- DB exports: `packages/db/src/schema/index.ts`
- DB migration: `packages/db/drizzle/0007_desktop_auth_sessions.sql`
- Migration journal: `packages/db/drizzle/meta/_journal.json`
- API routes: `apps/api/src/routes/desktop-auth.ts`
- Desktop token crypto helpers: `apps/api/src/lib/desktop-auth/crypto.ts`, `apps/api/src/lib/desktop-auth/jwt.ts`
- Any-auth middleware: `apps/api/src/middleware/any-auth.ts`
- Worker mounting + middleware swap: `apps/api/src/index.ts`

## Ops Notes

- New secrets required on API worker:
  - `DESKTOP_ACCESS_JWT_SECRET`
  - `DESKTOP_REFRESH_TOKEN_PEPPER`
- Apply migration in staging before relying on these endpoints.
