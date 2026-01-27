# API Changes for SAB-53 - Simplify PDPA Consent

## Date

January 27, 2026

## Summary

Removed consent middleware from API routes, allowing Clerk to enforce consent at sign-up instead. Updated webhook to sync Clerk's `legal_accepted_at` to database.

## Changes Made

### 1. Clerk Webhook (`apps/api/src/routes/webhooks/clerk.ts`)

- Added `legal_accepted_at` field to `ClerkWebhookEvent` interface
- Imported `consentRecords` table
- Updated `user.created` event handler:
  - Check `user.legal_accepted_at` from Clerk
  - Set `photographers.pdpa_consent_at` from `legal_accepted_at`
  - Create `consent_records` entry if user accepted consent

### 2. Middleware (`apps/api/src/middleware/`)

- **Deleted**: `require-consent.ts` middleware file
- **Updated**: `middleware/index.ts` - Removed export of `requireConsent`
- **No changes to**: `require-photographer.ts` (keeps `pdpaConsentAt` in context for future use)

### 3. Routes - Removed `requireConsent()` from middleware chains

#### Dashboard (`apps/api/src/routes/dashboard/route.ts`)

- Removed import of `requireConsent`
- Removed `requireConsent()` from GET `/` middleware chain

#### Events (`apps/api/src/routes/events/index.ts`)

- Removed import of `requireConsent`
- Removed `requireConsent()` from:
  - POST `/events`
  - GET `/events`
  - GET `/events/:id`
  - GET `/events/:id/qr-download`

#### Photos (`apps/api/src/routes/photos.ts`)

- Removed import of `requireConsent`
- Removed `requireConsent()` from POST `/photos`

#### Credits (`apps/api/src/routes/credits.ts`)

- Removed import of `requireConsent`
- Removed `requireConsent()` from:
  - POST `/checkout`
  - GET `/purchase/:sessionId`

## Verification

```bash
pnpm --filter=@sabaipics/api build
```

Build completed successfully with no TypeScript errors.

## Database

No schema changes needed. Existing `photographers.pdpa_consent_at` and `consent_records` tables are used for audit trail.

## Behavior Changes

### Before

- User signs up with Clerk
- Redirects to `/onboarding` page
- Shows PDPA consent modal
- POST `/consent` endpoint to record consent
- API routes check `requireConsent()` middleware
- Users without consent blocked (403 error)

### After

- User signs up with Clerk
- Clerk enforces consent checkbox: "I accept Terms of Service, Privacy Policy, and PDPA consent"
- User cannot proceed without checking box
- Clerk webhook syncs `legal_accepted_at` to `photographers.pdpa_consent_at`
- API routes work with authentication only
- Consent enforced at sign-up by Clerk

## Security

- Clerk prevents account creation without consent
- Webhook ensures database record of consent
- IP address captured in `consent_records` for audit trail
- No consent bypass possible (blocked by Clerk)

## Commits

1. `7aefa75` - Remove consent middleware, sync from Clerk webhook
2. `e64176a` - Remove consent endpoint and tests
3. `695c6f5` - Remove consent router registration and fix test syntax

## Next Steps

1. Enable "Require express consent to legal documents" in Clerk Dashboard
2. Configure checkbox text and URLs in Clerk Dashboard
3. Implement frontend changes (dashboard and event UI)
4. Test webhook integration
5. Deploy and verify
