# 024 - Dashboard Desktop Auth Bridge (Code Exchange)

## Why

The desktop uploader should not receive a short-lived Clerk session JWT in the loopback redirect. Instead, the dashboard bridge should exchange Clerk identity for a SabaiPics-issued desktop auth code, and the desktop app redeems that code for its own refreshable session.

## What Changed

- Updated dashboard route `GET /auth/desktop` to:
  - Validate `redirect_url` to localhost/127.0.0.1 `/callback`
  - If signed out: show Clerk SignIn
  - If signed in: call `POST /desktop/auth/exchange` (Bearer Clerk token) and redirect to `redirect_url?code=...`
  - Provide a retry UI on failure

## Files

- `apps/dashboard/src/routes/auth/desktop.tsx`
