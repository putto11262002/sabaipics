# 025 - Desktop Deep Link Auth Handoff

## Why

The desktop auth flow used a localhost loopback callback, which provides a poor browser UX. Users expect an “Open app” prompt/button after sign-in (Slack/Notion style).

## What

- Dashboard now redirects to a styled completion page after exchanging the Clerk session for a SabaiPics desktop auth code.
- The completion page provides:
  - A deep link to open the app: `framefast://auth?code=...`
  - A localhost fallback link: `http://127.0.0.1:<port>/callback?code=...`
- Desktop uploader adds the Tauri deep-link plugin and registers the `framefast` scheme (desktop).

## Follow-ups

- Desktop JS should listen for deep links and redeem the code (works best together with single-instance).

## Files

- `apps/dashboard/src/routes/auth/desktop.tsx`
- `apps/dashboard/src/routes/auth/desktop-complete.tsx`
- `apps/dashboard/src/router.tsx`
- `apps/desktop-uploader/src-tauri/tauri.conf.json`
- `apps/desktop-uploader/src-tauri/Cargo.toml`
- `apps/desktop-uploader/src-tauri/src/lib.rs`
- `apps/desktop-uploader/src-tauri/capabilities/default.json`
- `apps/desktop-uploader/package.json`
