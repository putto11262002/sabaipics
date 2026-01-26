# iOS Studio Auth (Clerk)

This doc describes how authentication is implemented in the iOS Studio app (`apps/studio`) using the Clerk iOS SDK.

## Goals

- Require sign-in before the Studio app can access API-backed features (events, uploads, etc.).
- Keep the existing PTP/camera state machine unchanged.
- Make Clerk publishable key configuration simple for local dev.
- Provide fully custom branded auth UI (not Clerk's prebuilt `AuthView()`).

## Architecture

### Top-level flow

`SabaiPicsStudioApp` renders `RootFlowView`.

- If signed out: show custom `AuthFlowContainerView` (branded auth UI).
- If signed in: show the main app shell (`MainTabView`).

This intentionally avoids adding auth states to `AppCoordinator.appState`.

### Custom Auth UI

The app uses a **fully custom auth UI** built with SwiftUI, following Clerk's headless/custom flow APIs strictly.

**Supported auth methods:**

- Email OTP (passwordless) - sign-in only (users sign up on the web app)
- Google OAuth sign-in (requires Associated Domains - see below)
- LINE OAuth sign-in (requires Associated Domains - see below)

**Provider buttons:**

- Google: app-styled outline button using the Google "G" icon.
- LINE: native button following LINE button guidelines (base `#06C755`, pressed overlay, separator), using the official LINE icon.
- Copy:
  - Google: "Continue with Google"
  - LINE: "Log in with LINE"

**Flow architecture:**

- `AuthFlowCoordinator` - ObservableObject managing state machine and Clerk API calls
- `AuthFlowState` - Enum representing current auth step (welcome, emailEntry, otpPending, oauthLoading, error)
- `AuthFlowContainerView` - State-driven navigation container

**Screens:**

- `WelcomeView` - Branded entry screen with provider buttons
- `EmailEntryView` - Email input with validation
- `OTPVerificationView` - 6-digit code input with resend functionality

Relevant files:

- `apps/studio/SabaiPicsStudio/SabaiPicsStudioApp.swift`
- `apps/studio/SabaiPicsStudio/Views/RootFlowView.swift`
- `apps/studio/SabaiPicsStudio/Views/Auth/` - All custom auth views
- `apps/studio/SabaiPicsStudio/Coordinators/AuthFlowCoordinator.swift`

See also:

- App shell + capture mode: `APP_SHELL.md`
- Implementation plan: `log/ios/006_custom-auth-ui-robust-plan.md`

### Clerk lifecycle

On app start:

1. Read publishable key from Info.plist key `ClerkPublishableKey`.
2. Configure Clerk: `clerk.configure(publishableKey: ...)`.
3. Restore session: `try await clerk.load()`.

At runtime:

- Signed-in detection: `clerk.user != nil`.
- Token for API calls: `try await clerk.session?.getToken()`.

## Configuration

### Publishable key

Clerk publishable key is supplied via Xcode build setting `CLERK_PUBLISHABLE_KEY` and substituted into the app Info.plist:

- `apps/studio/Config/SabaiPicsStudio-Info.plist`
  - `ClerkPublishableKey = $(CLERK_PUBLISHABLE_KEY)`

Recommended local dev setup:

1. Copy the example file:

- from: `apps/studio/Config/Studio.Local.xcconfig.example`
- to: `apps/studio/Config/Studio.Local.xcconfig`

2. Edit `apps/studio/Config/Studio.Local.xcconfig`:

```xcconfig
CLERK_PUBLISHABLE_KEY = pk_test_...
```

Notes:

- `apps/studio/Config/Studio.Local.xcconfig` is gitignored by design.
- Publishable keys are safe to ship in the app binary, but should still be environment-scoped (dev/staging/prod).

### Deployment target

Clerk iOS SDK requires iOS 17+. Studio app is configured with:

- `IPHONEOS_DEPLOYMENT_TARGET = 17.0`

### Associated Domains (required for OAuth)

OAuth redirect flows (Google, LINE) require Associated Domains to be configured:

1. In Xcode: Target > Signing & Capabilities > Add "Associated Domains"
2. Add: `applinks:{YOUR_CLERK_FRONTEND_API_URL}`
3. In Clerk Dashboard: Add your app's redirect URLs under "Native applications"

Without this, OAuth buttons will open the browser but won't redirect back to the app.

**Current status:** Not configured. Email OTP works without it; OAuth will not work until configured.

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

- If you don't see the auth screens (WelcomeView):
  - you may already have a persisted session (Keychain)
  - easiest reset on simulator: `Device > Erase All Content and Settings...`

- If OAuth buttons don't work:
  - Associated Domains must be configured (see above)
  - Check Clerk dashboard for redirect URL configuration

- If OTP code verification fails:
  - Check if code is expired (60 second window typically)
  - Use "Resend" button to get a new code

## References

- Clerk iOS Quickstart: https://clerk.com/docs/ios/getting-started/quickstart
- Clerk `AuthView`: https://clerk.com/docs/ios/reference/views/authentication/auth-view
- Clerk iOS `getToken()`: https://clerk.com/docs/reference/ios/get-token
