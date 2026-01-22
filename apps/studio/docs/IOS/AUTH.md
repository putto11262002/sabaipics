# iOS Studio Auth (Clerk)

This doc describes how authentication is implemented in the iOS Studio app (`apps/studio`) using the Clerk iOS SDK.

## Goals

- Require sign-in before the Studio app can access API-backed features (events, uploads, etc.).
- Keep the existing PTP/camera state machine unchanged.
- Make Clerk publishable key configuration simple for local dev.

## Architecture

### Top-level flow

`SabaiPicsStudioApp` renders `RootFlowView`.

- If signed out: show Clerk's `AuthView()`.
- If signed in: show the existing `ContentView()` (PTP camera flow).

This intentionally avoids adding auth states to `AppCoordinator.appState`.

Relevant files:

- `apps/studio/SabaiPicsStudio/SabaiPicsStudioApp.swift`
- `apps/studio/SabaiPicsStudio/Views/RootFlowView.swift`

### Clerk lifecycle

On app start:

1) Read publishable key from Info.plist key `ClerkPublishableKey`.
2) Configure Clerk: `clerk.configure(publishableKey: ...)`.
3) Restore session: `try await clerk.load()`.

At runtime:

- Signed-in detection: `clerk.user != nil`.
- Token for API calls: `try await clerk.session?.getToken()`.

## Configuration

### Publishable key

Clerk publishable key is supplied via Xcode build setting `CLERK_PUBLISHABLE_KEY` and substituted into the app Info.plist:

- `apps/studio/Config/SabaiPicsStudio-Info.plist`
  - `ClerkPublishableKey = $(CLERK_PUBLISHABLE_KEY)`

Recommended local dev setup:

1) Copy the example file:

- from: `apps/studio/Config/Studio.Local.xcconfig.example`
- to: `apps/studio/Config/Studio.Local.xcconfig`

2) Edit `apps/studio/Config/Studio.Local.xcconfig`:

```xcconfig
CLERK_PUBLISHABLE_KEY = pk_test_...
```

Notes:

- `apps/studio/Config/Studio.Local.xcconfig` is gitignored by design.
- Publishable keys are safe to ship in the app binary, but should still be environment-scoped (dev/staging/prod).

### Deployment target

Clerk iOS SDK requires iOS 17+. Studio app is configured with:

- `IPHONEOS_DEPLOYMENT_TARGET = 17.0`

## Making authenticated API requests

Expected request pattern:

- Fetch token: `let token = try await clerk.session?.getToken()`
- Add header: `Authorization: Bearer <token.jwt>`

Server side:

- API is protected by Clerk auth middleware.

## Debugging / common pitfalls

- If you see an assertion about missing `ClerkPublishableKey`:
  - verify `CLERK_PUBLISHABLE_KEY` is set (via `Studio.Local.xcconfig`)
  - clean build (`Product > Clean Build Folder...`) and run again

- If you don't see `AuthView()`:
  - you may already have a persisted session (Keychain)
  - easiest reset on simulator: `Device > Erase All Content and Settings...`

## References

- Clerk iOS Quickstart: https://clerk.com/docs/ios/getting-started/quickstart
- Clerk `AuthView`: https://clerk.com/docs/ios/reference/views/authentication/auth-view
- Clerk iOS `getToken()`: https://clerk.com/docs/reference/ios/get-token
