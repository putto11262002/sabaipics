# Dashboard Changes for SAB-53 - Simplify PDPA Consent

## Date

January 27, 2026

## Summary

Removed custom consent flow from dashboard, now trusting Clerk to enforce consent at sign-up.

## Changes Made

### 1. Sign-Up Redirect (`apps/dashboard/src/routes/sign-up.tsx`)

- Changed `afterSignUpUrl` from `/onboarding` to `/dashboard`

### 2. Deleted Files

**Onboarding Flow**:

- `/apps/dashboard/src/routes/onboarding/index.tsx` - Onboarding page
- `/apps/dashboard/src/routes/onboarding/_components/PDPAConsentModal.tsx` - Consent modal

**Consent Hooks**:

- `/apps/dashboard/src/hooks/consent/useConsentStatus.ts` - Consent status polling hook
- `/apps/dashboard/src/hooks/consent/` - Empty directory deleted

**Consent Components**:

- `/apps/dashboard/src/components/auth/ConsentGate.tsx` - Consent guard component

### 3. Router Updates (`apps/dashboard/src/router.tsx`)

**Removed Imports**:

- `import { ConsentGate } from './components/auth/ConsentGate'`
- `import { OnboardingPage } from './routes/onboarding'`

**Added Import**:

- `import { Outlet } from 'react-router'`

**Removed Routes**:

- `/onboarding` route entirely

**Updated Routes**:

- Credits route: Wrapped with `ProtectedRoute` only (removed `ConsentGate`)
- Protected routes: Wrapped with `ProtectedRoute > SidebarLayout` (removed `ConsentGate`)
- Credits route element: Changed to `<ProtectedRoute><Outlet /></ProtectedRoute>`

## Verification

```bash
pnpm --filter=@sabaipics/dashboard build
```

Build completed successfully with no TypeScript errors.

## Behavior Changes

### Before

1. User signs up with Clerk
2. Redirects to `/onboarding`
3. Polls for photographer record (30s timeout)
4. Shows PDPA consent modal
5. User accepts → POST `/consent` endpoint
6. Redirects to `/dashboard`

### After

1. User signs up with Clerk (with consent checkbox enforced)
2. Redirects to `/dashboard` immediately
3. No consent prompts, no polling
4. Direct access to dashboard features

## Notes

- No consent-related code remains in dashboard
- All consent checks handled by Clerk at sign-up
- Existing users continue to work (no consent check needed)
