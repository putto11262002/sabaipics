# iOS Studio - Clerk Auth Plan

Date: 2026-01-21

## Goal

Add Clerk-based authentication to the iOS Studio app (`apps/studio`) so the app can make authenticated requests to SabaiPics API.

Non-goals (for this slice):
- Event selection
- Upload queue/sync
- Offline/background upload

## Decision Summary

- Auth SDK: Clerk iOS SDK
- UI: Clerk prebuilt `AuthView` (SwiftUI)
- Backend auth: send `Authorization: Bearer <jwt>` where `<jwt>` is the current Clerk session token retrieved via `session.getToken()`.
- Session persistence / refresh: rely on Clerk SDK (`clerk.load()` on launch; `getToken()` when making requests).

## Key Storage (Clerk Publishable Key)

Clerk publishable key is not a secret, but it is environment-specific (dev/staging/prod). Best practice is to avoid hardcoding it directly in Swift.

Recommended approach:

1) Store the key in Xcode build settings via `.xcconfig` files
- Create (or reuse) config files under `apps/studio/Config/`:
  - `apps/studio/Config/Studio.Debug.xcconfig`
  - `apps/studio/Config/Studio.Release.xcconfig`
- Add a build setting:
  - `CLERK_PUBLISHABLE_KEY = pk_...`

2) Inject the key into the app Info.plist at build time

This project uses `GENERATE_INFOPLIST_FILE = YES`, so we should set an Info.plist key using Xcode's `INFOPLIST_KEY_*` build setting:

- `INFOPLIST_KEY_ClerkPublishableKey = $(CLERK_PUBLISHABLE_KEY)`

3) Read from Bundle in Swift

Example:

```swift
let key = Bundle.main.object(forInfoDictionaryKey: "ClerkPublishableKey") as? String
```

This keeps the key environment-scoped and avoids committing per-developer values into source.

## Implementation Plan

### 1) Add Clerk iOS SDK (Swift Package Manager)

- Add SPM dependency: `https://github.com/clerk/clerk-ios`
- Link product: `Clerk` to the `SabaiPicsStudio` target

### 2) Configure Clerk + restore session on app launch

Update `apps/studio/SabaiPicsStudio/SabaiPicsStudioApp.swift`:

- Add a stored Clerk instance (`Clerk.shared`)
- Call:
  - `clerk.configure(publishableKey: ...)`
  - `try await clerk.load()`

Notes:
- `load()` is required to restore any previously authenticated session.

### 3) Add an auth gate view

Create `AuthGateView` (new SwiftUI view) that:

- If signed out, shows `AuthView()`.
- If signed in, shows the existing `ContentView()` (the current PTP flow).

The goal is to keep the existing coordinator + PTP code unchanged while enforcing authentication before any API-dependent flows.

### 4) Minimal API client wrapper (token injection)

Create a small `SabaiPicsAPIClient` wrapper over `URLSession`:

- Uses `await clerk.session?.getToken()`
- Adds header: `Authorization: Bearer <jwt>`

### 5) Verify end-to-end auth

Use API route `GET /auth/me` (exists in `apps/api/src/routes/auth.ts`) to verify:

- token is attached
- backend recognizes the user (returns `userId`)

## References (Official)

Clerk:
- iOS Quickstart: https://clerk.com/docs/ios/getting-started/quickstart
- `AuthView` reference: https://clerk.com/docs/ios/reference/views/authentication/auth-view
- iOS `getToken()` reference: https://clerk.com/docs/reference/ios/get-token
- Session tokens: https://clerk.com/docs/guides/sessions/session-tokens
- Force token refresh: https://clerk.com/docs/guides/sessions/force-token-refresh

Open questions (defer):
- Whether Studio needs Sign in with Apple in MVP (depends on desired UX)
- Whether we want JWT templates vs default session token claims (likely not needed initially)
