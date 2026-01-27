# iOS Studio - Custom Auth UI (Clerk) Research + Analysis

Date: 2026-01-22

## Context

We integrated Clerk auth in Studio (`apps/studio`) using Clerk's prebuilt `AuthView()`. It works, but the default UI may not meet SabaiPics quality/branding expectations.

This note evaluates how hard it is to replace `AuthView()` with custom native UI while still supporting:

- Email with code (OTP)
- Google OAuth
- LINE OAuth

## Clerk Capability: Prebuilt vs Custom ("headless")

Clerk iOS supports:

- Prebuilt UI: `AuthView()` for end-to-end authentication.
- Custom flows: build your own screens and drive auth using Clerk SDK APIs (sign-in/up creation, factor preparation, factor attempts, OAuth redirects, etc.).

## Difficulty Assessment

### Easy (recommended): Hybrid custom UI

Build a SabaiPics-branded "Welcome / Sign in" screen (logo, typography, copy, buttons for providers), but still present `AuthView()` for the actual authentication step.

Pros:
- Fast (low engineering time).
- Clerk handles edge cases (MFA, recovery, state transitions).
- Minimal auth-risk.

Cons:
- The actual credential entry screens remain Clerk-styled.

### Medium: Fully custom UI (happy paths)

Implement custom screens for:
- Email OTP: input email, then input code.
- OAuth buttons: start redirect flow for Google/LINE.

You must handle:
- Sign-in vs sign-up transfer cases after OAuth (result may create a SignUp).
- "Incomplete" states (e.g., still needs additional steps) and errors.

### Hard: Fully custom UI with robust coverage

To match `AuthView()` completeness you also need to cover:
- MFA (if enabled)
- account recovery / reset flows
- configuration-driven "missing requirements"
- careful state restoration when app backgrounding interrupts an auth flow

## Provider Notes

### Email with code (OTP)

- Supported by Clerk custom flows.
- Implementation: create sign-in attempt, prepare `email_code` factor, submit code, handle status.

### Google OAuth

- Supported by Clerk social connection.
- Google disallows embedded WebViews for OAuth.
- On iOS, the flow must use a system browser / redirect style auth session (Clerk's redirect flow aligns with this).

### LINE OAuth

- Supported by Clerk social connection.
- Uses same redirect-style OAuth flow as other providers.

## Platform / Configuration Requirements (applies either way)

- iOS Associated Domains capability: `webcredentials:{YOUR_FRONTEND_API_URL}` (per Clerk iOS quickstart).
- Production: allowlist mobile OAuth redirect URLs under Clerk dashboard "Native applications" settings.
  - This is important for redirect security/nonce handling.

## Recommendation for SabaiPics Studio

Start with the Hybrid approach:

1) Build a polished SabaiPics-branded entry screen (custom UI) with:
   - Email "Continue" button
   - Google button
   - LINE button
2) On tap, present `AuthView()` to complete auth.
3) If we still want full control after shipping the hybrid experience, implement custom flows incrementally:
   - Phase 1: Email OTP custom flow
   - Phase 2: OAuth custom flow buttons (Google + LINE)
   - Phase 3: MFA + edge-case completeness

This strategy minimizes auth risk while letting us improve first impressions immediately.

## Official References

- iOS `AuthView`: https://clerk.com/docs/ios/reference/views/authentication/auth-view
- Custom flows overview: https://clerk.com/docs/guides/development/custom-flows/overview
- Email/SMS OTP custom flow: https://clerk.com/docs/guides/development/custom-flows/authentication/email-sms-otp
- OAuth connections custom flow: https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections
- Social connections overview (native allowlist note): https://clerk.com/docs/guides/configure/auth-strategies/social-connections/overview
- Google social connection: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google
- LINE social connection: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/line
- iOS quickstart (Associated Domains): https://clerk.com/docs/ios/getting-started/quickstart
- Sign in with Apple (if needed later): https://clerk.com/docs/ios/guides/configure/auth-strategies/sign-in-with-apple
